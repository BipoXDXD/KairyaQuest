"""Inicio de diaria decide pelo dia civil apos a espera real (parte da 160).

O relogio nao bloqueante cruza a meia-noite de Sao Paulo somente depois de
pg_blocking_pids comprovar a espera. Relogio anterior a trava inicia a diaria
perdida ou recusa a que acabou de ser revelada, alem de falsificar started_at.
"""

import threading
import time
from collections.abc import Iterator
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import Engine, delete, select, text
from sqlalchemy.orm import Session

from focusquest.core.errors import MissaoExpiradaError
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
)
from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission, MissionOperation, WeeklyPlan
from focusquest.modules.missions.service import iniciar_missao
from focusquest.modules.progression.models import XpEntry

ESTUDANTE = 1
SEGUNDA = date(2026, 9, 21)
QUARTA = date(2026, 9, 23)
QUINTA = date(2026, 9, 24)
CRIADO_EM = datetime(2026, 9, 21, 15, tzinfo=UTC)
ANTES = datetime(2026, 9, 24, 2, 59, 59, tzinfo=UTC)  # quarta 23:59:59 em SP
DEPOIS = datetime(2026, 9, 24, 3, 0, tzinfo=UTC)  # quinta 00:00:00 em SP
OPERACAO = "inicio-virada-dia"
SEGUNDOS_LIMITE = 10
Resultado = Mission | MissaoExpiradaError


@pytest.fixture
def plano_commitado(banco_migrado: Engine) -> Iterator[int]:
    """Apaga so as missoes do plano criado e, depois, o proprio plano."""
    with Session(bind=banco_migrado) as sessao:
        criar_plano(
            sessao,
            user_id=ESTUDANTE,
            semana=SEGUNDA,
            diarias=[
                NovaDiaria(f"D{i}", "Resumo de uma pagina", 2, 30) for i in range(7)
            ],
            especial=NovaEspecial("E", "Resumo de sete paginas", 60),
            clock=lambda: CRIADO_EM,
        )
        plano_id = sessao.scalars(
            select(WeeklyPlan.id).where(
                WeeklyPlan.user_id == ESTUDANTE, WeeklyPlan.week_start == SEGUNDA
            )
        ).one()
        sessao.commit()

    try:
        yield plano_id
    finally:
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(text("SET LOCAL lock_timeout = '2s'"))
            limpeza.execute(delete(Mission).where(Mission.plan_id == plano_id))
            limpeza.execute(delete(WeeklyPlan).where(WeeklyPlan.id == plano_id))
            limpeza.commit()


def _esperar_bloqueio(
    engine: Engine, esperando: int, dono: int, futuro: Future[Resultado]
) -> None:
    """Observa dependencia exata dos PIDs, sem esconder erro da thread."""
    limite = time.monotonic() + SEGUNDOS_LIMITE
    with engine.connect() as observador:
        while time.monotonic() < limite:
            if futuro.done():
                futuro.result()
                pytest.fail("inicio terminou antes de esperar pela missao")
            bloqueadores = observador.execute(
                text("SELECT pg_blocking_pids(:pid)"), {"pid": esperando}
            ).scalar_one()
            observador.commit()
            if dono in bloqueadores:
                return
            time.sleep(0.01)
    pytest.fail(f"backend {esperando} nao esperou pelo dono {dono}")


@pytest.mark.parametrize(
    "dia", [QUARTA, QUINTA], ids=["diaria-vence", "diaria-revelada"]
)
def test_inicio_da_diaria_revalida_o_dia_civil_apos_a_espera(
    banco_migrado: Engine, plano_commitado: int, dia: date
) -> None:
    """A virada recusa a pendente de ontem e revela a diaria de hoje."""
    with Session(bind=banco_migrado) as leitura:
        missao_id = leitura.scalars(
            select(Mission.id).where(
                Mission.plan_id == plano_commitado,
                Mission.mission_type == MissionType.DIARIA,
                Mission.day == dia,
            )
        ).one()

    carregou = threading.Event()
    iniciar_pedido = threading.Event()
    virou = threading.Event()
    pids: list[int] = []

    def relogio() -> datetime:
        # Retorna imediatamente: esperar aqui esconderia o clock antecipado.
        return DEPOIS if virou.is_set() else ANTES

    def esperar() -> Resultado:
        with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
            sessao.execute(text("SET LOCAL statement_timeout = '15s'"))
            pids.append(sessao.execute(text("SELECT pg_backend_pid()")).scalar_one())
            # Reter a missao garante a pre-carga ate a chamada do servico.
            carregada = sessao.get(Mission, missao_id)
            assert carregada is not None
            assert carregada.state is MissionState.PENDENTE
            assert carregada.started_at is None
            carregou.set()
            assert iniciar_pedido.wait(SEGUNDOS_LIMITE), "dono nao iniciou"
            try:
                resultado = iniciar_missao(
                    sessao, ESTUDANTE, missao_id, OPERACAO, clock=relogio
                )
            except MissaoExpiradaError as erro:
                # Antes do rollback: autoflush revela escritas indevidas pendentes.
                assert (
                    list(
                        sessao.scalars(
                            select(MissionOperation).where(
                                MissionOperation.mission_id == missao_id
                            )
                        )
                    )
                    == []
                )
                assert sessao.execute(
                    select(
                        Mission.state, Mission.started_at, Mission.completed_at
                    ).where(Mission.id == missao_id)
                ).one() == (MissionState.PENDENTE, None, None)
                assert (
                    list(
                        sessao.scalars(
                            select(XpEntry).where(XpEntry.mission_id == missao_id)
                        )
                    )
                    == []
                )
                sessao.rollback()
                return erro
            sessao.commit()
            assert resultado is carregada
            return resultado

    with (
        ThreadPoolExecutor(max_workers=1) as executor,
        Session(bind=banco_migrado) as dono,
    ):
        dono.execute(text("SET LOCAL statement_timeout = '15s'"))
        pid_dono = dono.execute(text("SELECT pg_backend_pid()")).scalar_one()
        futuro = executor.submit(esperar)
        try:
            if not carregou.wait(SEGUNDOS_LIMITE):
                futuro.result(timeout=0)
                pytest.fail("sessao nao pre-carregou a diaria")
            # So segura a linha: nenhum inicio, reagendamento ou conclusao concorrente.
            dono.execute(
                text("SELECT id FROM missions WHERE id = :id FOR UPDATE"),
                {"id": missao_id},
            ).one()
            assert pids[0] != pid_dono
            iniciar_pedido.set()
            _esperar_bloqueio(banco_migrado, pids[0], pid_dono, futuro)
            virou.set()
            dono.commit()
            resultado = futuro.result(timeout=SEGUNDOS_LIMITE)
        finally:
            # Libera a linha antes de o executor esperar a thread, inclusive em erro.
            dono.rollback()
            virou.set()
            iniciar_pedido.set()

    with Session(bind=banco_migrado) as leitura:
        final = leitura.get(Mission, missao_id)
        assert final is not None
        assert final.day == dia
        assert final.completed_at is None
        operacoes = list(
            leitura.execute(
                select(MissionOperation.operation_id, MissionOperation.kind).where(
                    MissionOperation.mission_id == missao_id
                )
            )
        )
        assert (
            list(
                leitura.scalars(select(XpEntry).where(XpEntry.mission_id == missao_id))
            )
            == []
        )
        if dia == QUARTA:
            assert isinstance(resultado, MissaoExpiradaError)
            assert final.state is MissionState.PENDENTE
            assert final.started_at is None
            assert operacoes == []
        else:
            assert isinstance(resultado, Mission)
            assert resultado.state is MissionState.EM_ANDAMENTO
            assert resultado.started_at == DEPOIS
            assert final.state is MissionState.EM_ANDAMENTO
            assert final.started_at == DEPOIS
            assert operacoes == [(OPERACAO, "start")]
