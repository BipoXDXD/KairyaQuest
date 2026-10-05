"""A janela tardia e timestamps consideram a espera real pela missao (160)."""

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
from focusquest.modules.missions.models import (
    Mission,
    MissionEvidence,
    MissionOperation,
    WeeklyPlan,
)
from focusquest.modules.missions.service import (
    NovaEvidencia,
    concluir_missao,
    iniciar_missao,
)
from focusquest.modules.progression.models import FONTE_CONCLUSAO, XpEntry

ESTUDANTE = 1
SEMANA = date(2026, 9, 21)
DIA = date(2026, 9, 23)
CRIADO_EM = datetime(2026, 9, 21, 15, tzinfo=UTC)
INICIADA_EM = datetime(2026, 9, 24, 2, 50, tzinfo=UTC)  # quarta 23:50 em SP
LIMITE = datetime(2026, 9, 25, 3, tzinfo=UTC)  # sexta 00:00 em SP
INICIO = "tardia-espera-start"
CONCLUSAO = "tardia-espera-complete"
EVIDENCIA = NovaEvidencia("Resumo tardio", None)
Resultado = Mission | MissaoExpiradaError


@pytest.fixture
def diaria_iniciada(banco_migrado: Engine) -> Iterator[int]:
    with Session(bind=banco_migrado) as sessao:
        criar_plano(
            sessao,
            user_id=ESTUDANTE,
            semana=SEMANA,
            diarias=[NovaDiaria(f"D{i}", "Resumo", 2, 30) for i in range(7)],
            especial=NovaEspecial("E", "Resumo semanal", 60),
            clock=lambda: CRIADO_EM,
        )
        plano_id = sessao.scalars(
            select(WeeklyPlan.id).where(
                WeeklyPlan.user_id == ESTUDANTE, WeeklyPlan.week_start == SEMANA
            )
        ).one()
        missao_id = sessao.scalars(
            select(Mission.id).where(
                Mission.plan_id == plano_id,
                Mission.mission_type == MissionType.DIARIA,
                Mission.day == DIA,
            )
        ).one()
        iniciar_missao(sessao, ESTUDANTE, missao_id, INICIO, clock=lambda: INICIADA_EM)
        sessao.commit()
    try:
        yield missao_id
    finally:
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(text("SET LOCAL lock_timeout = '2s'"))
            limpeza.execute(delete(Mission).where(Mission.plan_id == plano_id))
            limpeza.execute(delete(WeeklyPlan).where(WeeklyPlan.id == plano_id))
            limpeza.commit()


def _esperar_sinal(sinal: threading.Event, futuro: Future[Resultado]) -> None:
    limite = time.monotonic() + 10
    while time.monotonic() < limite:
        if sinal.is_set():
            return
        if futuro.done():
            futuro.result()
            pytest.fail("worker terminou sem carregar a missao")
        sinal.wait(0.01)
    if futuro.done():
        futuro.result()
    pytest.fail("worker nao carregou a missao")


def _esperar_bloqueio(
    engine: Engine, esperando: int, dono: int, futuro: Future[Resultado]
) -> None:
    limite = time.monotonic() + 10
    with engine.connect() as observador:
        while time.monotonic() < limite:
            if futuro.done():
                futuro.result()
                pytest.fail("conclusao terminou antes de esperar pela missao")
            bloqueadores = observador.execute(
                text("SELECT pg_blocking_pids(:pid)"), {"pid": esperando}
            ).scalar_one()
            observador.commit()
            if dono in bloqueadores:
                return
            time.sleep(0.01)
    if futuro.done():
        futuro.result()
    pytest.fail(f"backend {esperando} nao esperou pelo dono {dono}")


def _estado(
    sessao: Session, missao_id: int, *, expirou: bool, depois: datetime
) -> None:
    # Consultas normais fazem autoflush: efeitos indevidos na transacao que
    # sera revertida nao podem ser escondidos pelo rollback do teste.
    estado = sessao.execute(
        select(Mission.state, Mission.started_at, Mission.completed_at).where(
            Mission.id == missao_id
        )
    ).one()
    operacoes = sessao.execute(
        select(MissionOperation.operation_id, MissionOperation.kind)
        .where(MissionOperation.mission_id == missao_id)
        .order_by(MissionOperation.kind)
    ).all()
    evidencias = sessao.execute(
        select(
            MissionEvidence.text, MissionEvidence.link, MissionEvidence.submitted_at
        ).where(MissionEvidence.mission_id == missao_id)
    ).all()
    creditos = sessao.execute(
        select(
            XpEntry.user_id, XpEntry.amount, XpEntry.source, XpEntry.credited_at
        ).where(XpEntry.mission_id == missao_id)
    ).all()
    if expirou:
        assert estado == (MissionState.EM_ANDAMENTO, INICIADA_EM, None)
        assert operacoes == [(INICIO, "start")]
        assert evidencias == []
        assert creditos == []
    else:
        assert estado == (MissionState.CONCLUIDA, INICIADA_EM, depois)
        assert operacoes == [(CONCLUSAO, "complete"), (INICIO, "start")]
        assert evidencias == [(EVIDENCIA.texto, EVIDENCIA.link, depois)]
        assert creditos == [(ESTUDANTE, 40, FONTE_CONCLUSAO, depois)]


@pytest.mark.parametrize(
    ("antes", "depois", "expirou"),
    [
        (
            datetime(2026, 9, 25, 2, 59, 59, tzinfo=UTC),
            LIMITE,
            True,
        ),
        (
            datetime(2026, 9, 25, 2, 59, 58, tzinfo=UTC),
            datetime(2026, 9, 25, 2, 59, 59, tzinfo=UTC),
            False,
        ),
    ],
    ids=["janela-expira", "ainda-na-janela"],
)
def test_conclusao_tardia_considera_o_instante_apos_a_espera(
    banco_migrado: Engine,
    diaria_iniciada: int,
    antes: datetime,
    depois: datetime,
    expirou: bool,
) -> None:
    carregou = threading.Event()
    iniciar = threading.Event()
    avancou = threading.Event()
    pids: list[int] = []

    def relogio() -> datetime:
        # Nao aguarda evento: ler antes da trava precisa devolver a hora velha.
        return depois if avancou.is_set() else antes

    def esperar() -> Resultado:
        with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
            sessao.execute(text("SET LOCAL statement_timeout = '15s'"))
            pids.append(sessao.execute(text("SELECT pg_backend_pid()")).scalar_one())
            velha = sessao.get(Mission, diaria_iniciada)
            assert velha is not None
            assert velha.state is MissionState.EM_ANDAMENTO
            assert velha.started_at == INICIADA_EM
            carregou.set()
            assert iniciar.wait(10), "controlador nao liberou a conclusao"
            try:
                concluida = concluir_missao(
                    sessao,
                    ESTUDANTE,
                    diaria_iniciada,
                    CONCLUSAO,
                    clock=relogio,
                    evidencia=EVIDENCIA,
                )
            except MissaoExpiradaError as erro:
                _estado(sessao, diaria_iniciada, expirou=True, depois=depois)
                assert velha.state is MissionState.EM_ANDAMENTO
                sessao.rollback()
                return erro
            assert concluida is velha
            sessao.commit()
            return concluida

    with Session(bind=banco_migrado) as dono:
        dono.execute(text("SET LOCAL statement_timeout = '15s'"))
        pid_dono = dono.execute(text("SELECT pg_backend_pid()")).scalar_one()
        dono.execute(
            select(Mission.id).where(Mission.id == diaria_iniciada).with_for_update()
        )
        with ThreadPoolExecutor(max_workers=1) as executor:
            futuro = executor.submit(esperar)
            try:
                _esperar_sinal(carregou, futuro)
                assert pids[0] != pid_dono
                iniciar.set()
                _esperar_bloqueio(banco_migrado, pids[0], pid_dono, futuro)
                avancou.set()
                dono.rollback()
                resultado = futuro.result(timeout=10)
            finally:
                # Soltar antes de o executor aguardar a thread, mesmo em falha.
                dono.rollback()
                iniciar.set()

    if expirou:
        assert type(resultado) is MissaoExpiradaError
    else:
        assert isinstance(resultado, Mission)
        assert resultado.completed_at == depois
    with Session(bind=banco_migrado) as leitura:
        _estado(leitura, diaria_iniciada, expirou=expirou, depois=depois)
