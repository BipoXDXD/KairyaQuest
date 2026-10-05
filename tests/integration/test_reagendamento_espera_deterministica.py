"""Prazo e historico do reagendamento apos espera real (parte da pendencia 160).

A missao fica retida no identity map da sessao perdedora antes da primeira
escrita. O relogio so avanca apos pg_blocking_pids comprovar a espera: ler a
hora antes da trava aceita um prazo vencido ou grava o instante errado.
"""

import threading
import time
from collections.abc import Iterator
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import Engine, delete, select, text
from sqlalchemy.orm import Session

from focusquest.core.clock import Clock
from focusquest.core.errors import PrazoExpiradoError
from focusquest.modules.missions.domain import (
    MissionState,
    MotivoDoReagendamento,
    OrigemDoReagendamento,
)
from focusquest.modules.missions.models import (
    Mission,
    MissionOperation,
    MissionReschedule,
)
from focusquest.modules.missions.service import criar_missao, reagendar_missao
from focusquest.modules.progression.models import XpEntry

ESTUDANTE = 1
AGORA = datetime(2026, 10, 5, 12, tzinfo=UTC)
PRIMEIRO_EM = AGORA + timedelta(minutes=1)
ANTES_DA_ESPERA = AGORA + timedelta(minutes=2)
DEPOIS_DA_ESPERA = AGORA + timedelta(hours=2)
PRAZO_ORIGINAL = AGORA + timedelta(days=2)
PRAZO_PRIMEIRO = AGORA + timedelta(days=5)
PRAZO_QUE_EXPIRA = AGORA + timedelta(hours=1)
PRAZO_FUTURO = AGORA + timedelta(days=7)
OPERACAO_PRIMEIRO = "espera-primeiro"
OPERACAO_SEGUNDO = "espera-segundo"
SEGUNDOS_LIMITE = 10
Resultado = Mission | PrazoExpiradoError


@pytest.fixture
def missao_commitada(banco_migrado: Engine) -> Iterator[int]:
    """Limpa apenas a missao criada; operacoes e historico vao por CASCADE."""
    with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
        missao = criar_missao(
            sessao,
            user_id=ESTUDANTE,
            instructions="Ler o capitulo 3",
            completion_criterion="Resumo de uma pagina",
            difficulty=2,
            estimated_minutes=30,
            deadline=PRAZO_ORIGINAL,
        )
        sessao.commit()
        missao_id = missao.id

    try:
        yield missao_id
    finally:
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(text("SET LOCAL lock_timeout = '2s'"))
            limpeza.execute(delete(Mission).where(Mission.id == missao_id))
            limpeza.commit()


def _reagendar(
    sessao: Session, missao_id: int, operacao: str, prazo: datetime, clock: Clock
) -> Mission:
    return reagendar_missao(
        sessao,
        ESTUDANTE,
        missao_id,
        operacao,
        novo_prazo=prazo,
        motivo=MotivoDoReagendamento.FALTA_DE_TEMPO,
        origem=OrigemDoReagendamento.USUARIO,
        clock=clock,
    )


def _esperar_bloqueio(
    engine: Engine, esperando: int, vencedor: int, futuro: Future[Resultado]
) -> None:
    """Observa os PIDs exatos e propaga uma falha antecipada da thread."""
    limite = time.monotonic() + SEGUNDOS_LIMITE
    with engine.connect() as observador:
        while time.monotonic() < limite:
            if futuro.done():
                futuro.result()
                pytest.fail("pedido terminou antes de esperar pelo vencedor")
            bloqueadores = observador.execute(
                text("SELECT pg_blocking_pids(:pid)"), {"pid": esperando}
            ).scalar_one()
            observador.commit()
            if vencedor in bloqueadores:
                return
            time.sleep(0.01)
    pytest.fail(f"backend {esperando} nao esperou pelo vencedor {vencedor}")


@pytest.mark.parametrize(
    "prazo_expira", [True, False], ids=["prazo-expira", "prazo-futuro"]
)
def test_reagendamento_revalida_prazo_e_historico_depois_da_espera(
    banco_migrado: Engine, missao_commitada: int, prazo_expira: bool
) -> None:
    """Prazo vencido nao escreve; prazo futuro encadeia com a hora posterior."""
    carregou = threading.Event()
    iniciar_pedido = threading.Event()
    liberou = threading.Event()
    pids: list[int] = []
    prazo_segundo = PRAZO_QUE_EXPIRA if prazo_expira else PRAZO_FUTURO

    def relogio() -> datetime:
        # Nao espera pelo evento: esperar aqui esconderia o clock antecipado.
        return DEPOIS_DA_ESPERA if liberou.is_set() else ANTES_DA_ESPERA

    def esperar() -> Resultado:
        with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
            sessao.execute(text("SET LOCAL statement_timeout = '15s'"))
            pids.append(sessao.execute(text("SELECT pg_backend_pid()")).scalar_one())
            # Reter a referencia impede o identity map de descartar a missao.
            carregada = sessao.get(Mission, missao_commitada)
            assert carregada is not None
            assert carregada.deadline == PRAZO_ORIGINAL
            assert carregada.state is MissionState.PENDENTE
            carregou.set()
            assert iniciar_pedido.wait(SEGUNDOS_LIMITE), "vencedor nao iniciou"
            try:
                resultado = _reagendar(
                    sessao,
                    missao_commitada,
                    OPERACAO_SEGUNDO,
                    prazo_segundo,
                    relogio,
                )
            except PrazoExpiradoError as erro:
                # Antes do rollback: consultas com autoflush revelam ate uma
                # escrita pendente que o rollback esconderia da leitura final.
                assert list(
                    sessao.scalars(
                        select(MissionOperation.operation_id).where(
                            MissionOperation.mission_id == missao_commitada
                        )
                    )
                ) == [OPERACAO_PRIMEIRO]
                assert list(
                    sessao.scalars(
                        select(MissionReschedule.operation_id).where(
                            MissionReschedule.mission_id == missao_commitada
                        )
                    )
                ) == [OPERACAO_PRIMEIRO]
                assert (
                    sessao.scalar(
                        select(Mission.deadline).where(Mission.id == missao_commitada)
                    )
                    == PRAZO_PRIMEIRO
                )
                sessao.rollback()
                return erro
            sessao.commit()
            assert resultado is carregada
            return resultado

    with (
        ThreadPoolExecutor(max_workers=1) as executor,
        Session(bind=banco_migrado, expire_on_commit=False) as vencedor,
    ):
        vencedor.execute(text("SET LOCAL statement_timeout = '15s'"))
        pid_vencedor = vencedor.execute(text("SELECT pg_backend_pid()")).scalar_one()
        futuro = executor.submit(esperar)
        try:
            if not carregou.wait(SEGUNDOS_LIMITE):
                futuro.result(timeout=0)
                pytest.fail("sessao nao pre-carregou a missao")
            primeiro = _reagendar(
                vencedor,
                missao_commitada,
                OPERACAO_PRIMEIRO,
                PRAZO_PRIMEIRO,
                lambda: PRIMEIRO_EM,
            )
            assert primeiro.deadline == PRAZO_PRIMEIRO
            assert pids[0] != pid_vencedor
            iniciar_pedido.set()
            _esperar_bloqueio(banco_migrado, pids[0], pid_vencedor, futuro)
            liberou.set()
            vencedor.commit()
            resultado = futuro.result(timeout=SEGUNDOS_LIMITE)
        finally:
            # Antes de o executor aguardar a thread, inclusive se o teste falhar.
            vencedor.rollback()
            liberou.set()
            iniciar_pedido.set()

    with Session(bind=banco_migrado) as leitura:
        final = leitura.get(Mission, missao_commitada)
        assert final is not None
        assert final.state is MissionState.PENDENTE
        assert final.started_at is None and final.completed_at is None
        historico = list(
            leitura.scalars(
                select(MissionReschedule)
                .where(MissionReschedule.mission_id == missao_commitada)
                .order_by(MissionReschedule.id)
            )
        )
        operacoes = list(
            leitura.execute(
                select(MissionOperation.operation_id, MissionOperation.kind)
                .where(MissionOperation.mission_id == missao_commitada)
                .order_by(MissionOperation.operation_id)
            )
        )
        assert (
            list(
                leitura.scalars(
                    select(XpEntry).where(XpEntry.mission_id == missao_commitada)
                )
            )
            == []
        )
        assert historico[0].operation_id == OPERACAO_PRIMEIRO
        assert historico[0].previous_deadline == PRAZO_ORIGINAL
        assert historico[0].new_deadline == PRAZO_PRIMEIRO
        assert historico[0].rescheduled_at == PRIMEIRO_EM
        for elo in historico:
            assert elo.reason is MotivoDoReagendamento.FALTA_DE_TEMPO
            assert elo.origin is OrigemDoReagendamento.USUARIO

        if prazo_expira:
            assert isinstance(resultado, PrazoExpiradoError)
            assert final.deadline == PRAZO_PRIMEIRO
            assert len(historico) == 1
            assert operacoes == [(OPERACAO_PRIMEIRO, "reschedule")]
        else:
            assert isinstance(resultado, Mission)
            assert resultado.deadline == PRAZO_FUTURO
            assert final.deadline == PRAZO_FUTURO
            assert len(historico) == 2
            segundo = historico[1]
            assert segundo.operation_id == OPERACAO_SEGUNDO
            assert segundo.previous_deadline == PRAZO_PRIMEIRO
            assert segundo.new_deadline == PRAZO_FUTURO
            assert segundo.rescheduled_at == DEPOIS_DA_ESPERA
            assert segundo.rescheduled_at > historico[0].rescheduled_at
            assert operacoes == [
                (OPERACAO_PRIMEIRO, "reschedule"),
                (OPERACAO_SEGUNDO, "reschedule"),
            ]
