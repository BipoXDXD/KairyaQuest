"""Tetos da sessao do banco e o 503 `banco_ocupado`, contra PostgreSQL real.

ADR 0001: a engine da aplicacao nasce com `lock_timeout`, `statement_timeout`
e `idle_in_transaction_session_timeout` vindos do `Settings`; a do Alembic e as
da suite nao. Trava, comando acima do teto e pool esgotado viram 503 com
`Retry-After`; um erro operacional fora dessa lista continua 500.

Os tetos aqui sao curtos (centenas de milissegundos) para cada teste terminar
rapido. Nenhuma espera e um `sleep` chutado: quem segura a trava nunca solta, e
quem espera e cortado pelo proprio teto do PostgreSQL.
"""

import logging
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from sqlalchemy import Connection, Engine, create_engine, delete, func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool, QueuePool

from focusquest.core import database
from focusquest.core.config import Settings
from focusquest.core.database import (
    SQLSTATE_DA_TRANSACAO_OCIOSA,
    LimitesDaSessao,
    create_engine_from_url,
    e_falha_transitoria_do_banco,
    get_engine,
    get_session,
)
from focusquest.main import app
from focusquest.modules.missions.domain import MissionState
from focusquest.modules.missions.models import Mission, MissionOperation
from focusquest.modules.missions.service import criar_missao

# O usuario unico semeado pela migracao (README s8).
ESTUDANTE = 1
# O teto curto dos testes de trava e de comando: bem abaixo do prazo do teste.
TETO_CURTO_MS = 300
# Prazo maximo de um teste que espera o banco agir; nunca e sincronizacao.
PRAZO_DO_TESTE_SEGUNDOS = 5
OCUPADO = {
    "detail": "banco de dados ocupado; tente de novo em instantes",
    "code": "banco_ocupado",
}


@contextmanager
def _missao_commitada(engine: Engine) -> Iterator[int]:
    """Uma missao COMMITADA (outra conexao precisa enxerga-la para disputar a
    trava), apagada no `finally`; `mission_operations` vai pelo CASCADE."""
    with Session(bind=engine) as sessao:
        missao = criar_missao(
            sessao,
            user_id=ESTUDANTE,
            instructions="Ler o capitulo 3",
            completion_criterion="Resumo de uma pagina entregue",
            difficulty=2,
            estimated_minutes=30,
            deadline=datetime.now(UTC) + timedelta(days=1),
        )
        sessao.commit()
        mission_id = missao.id
    try:
        yield mission_id
    finally:
        with Session(bind=engine) as sessao:
            sessao.execute(delete(Mission).where(Mission.id == mission_id))
            sessao.commit()


def _tetos_da_sessao(engine: Engine) -> tuple[int, str, str, str]:
    with engine.connect() as conexao:
        linha = conexao.execute(
            text(
                "SELECT pg_backend_pid(), current_setting('lock_timeout'),"
                " current_setting('statement_timeout'),"
                " current_setting('idle_in_transaction_session_timeout')"
            )
        ).one()
        conexao.rollback()
    return linha[0], linha[1], linha[2], linha[3]


@pytest.fixture
def engine_da_aplicacao(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, settings: Settings, engine: Engine
) -> Iterator[Callable[[], Engine]]:
    """A engine de `get_engine`, apontada para o banco de TESTE.

    A fixture `engine` garante que o banco existe; a URL de desenvolvimento
    nunca e usada. O `chdir` tira o .env do caminho: so o ambiente do teste
    configura o `Settings`.
    """
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", settings.test_database_url)
    monkeypatch.setenv("FOCUSQUEST_TEST_DATABASE_URL", settings.test_database_url)
    for variavel in (
        "FOCUSQUEST_DB_LOCK_TIMEOUT_MS",
        "FOCUSQUEST_DB_STATEMENT_TIMEOUT_MS",
        "FOCUSQUEST_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS",
    ):
        monkeypatch.delenv(variavel, raising=False)
    monkeypatch.chdir(tmp_path)
    database.descartar_engine()
    try:
        yield get_engine
    finally:
        database.descartar_engine()


def test_a_engine_da_aplicacao_nasce_com_os_tetos_padrao(
    engine_da_aplicacao: Callable[[], Engine],
) -> None:
    _, trava, comando, ociosa = _tetos_da_sessao(engine_da_aplicacao())

    assert (trava, comando, ociosa) == ("5s", "15s", "1min")


def test_os_tetos_vem_do_settings_e_sobrevivem_a_devolucao_ao_pool(
    engine_da_aplicacao: Callable[[], Engine], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Valores fora do padrao provam que o numero vem do `Settings`. A segunda
    leitura, na MESMA conexao (mesmo pid) depois do rollback do pool, e a
    armadilha que o docstring de `_configurar_sessao` mediu para o fuso."""
    monkeypatch.setenv("FOCUSQUEST_DB_LOCK_TIMEOUT_MS", "1234")
    monkeypatch.setenv("FOCUSQUEST_DB_STATEMENT_TIMEOUT_MS", "4321")
    monkeypatch.setenv("FOCUSQUEST_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS", "7000")
    engine = engine_da_aplicacao()

    primeira = _tetos_da_sessao(engine)
    segunda = _tetos_da_sessao(engine)

    assert primeira[1:] == ("1234ms", "4321ms", "7s")
    assert segunda == primeira


def test_a_engine_sem_limites_nasce_sem_tetos(settings: Settings) -> None:
    """O caminho do `alembic/env.py`: uma migracao longa nao pode ser cortada."""
    engine = create_engine_from_url(settings.test_database_url, poolclass=NullPool)
    try:
        _, trava, comando, ociosa = _tetos_da_sessao(engine)
    finally:
        engine.dispose()

    assert (trava, comando, ociosa) == ("0", "0", "0")


@contextmanager
def _engine_com_tetos(url: str, **tetos: int) -> Iterator[Engine]:
    limites = LimitesDaSessao(
        lock_timeout_ms=tetos.get("lock_timeout_ms", 5_000),
        statement_timeout_ms=tetos.get("statement_timeout_ms", 15_000),
        idle_in_transaction_timeout_ms=tetos.get(
            "idle_in_transaction_timeout_ms", 60_000
        ),
    )
    engine = create_engine_from_url(url, limites=limites)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def cliente_sobre() -> Iterator[Callable[[Engine], TestClient]]:
    """Cliente cujas rotas usam `engine`; 500 vira resposta, nao excecao."""

    def _montar(engine: Engine) -> TestClient:
        app.dependency_overrides[get_engine] = lambda: engine
        return TestClient(app, raise_server_exceptions=False)

    yield _montar
    app.dependency_overrides.clear()


def _sem_vazamento(corpo: str, *proibidos: str) -> None:
    for proibido in proibidos:
        assert proibido not in corpo


def test_trava_presa_vira_503_com_retry_after(
    banco_migrado: Engine,
    settings: Settings,
    cliente_sobre: Callable[[Engine], TestClient],
) -> None:
    operation_id = "teto-trava-presa"
    with (
        _missao_commitada(banco_migrado) as mission_id,
        _engine_com_tetos(
            settings.test_database_url, lock_timeout_ms=TETO_CURTO_MS
        ) as engine,
        banco_migrado.connect() as segurando,
    ):
        # Rede de seguranca do proprio teste: sem o teto da aplicacao, a rota
        # esperaria esta trava para sempre. Com isto o PostgreSQL derruba quem
        # segura depois do prazo, a rota segue e o teste FALHA em vez de travar.
        segurando.execute(
            text(
                "SELECT set_config('idle_in_transaction_session_timeout', :ms, false)"
            ),
            {"ms": str(PRAZO_DO_TESTE_SEGUNDOS * 1000)},
        )
        segurando.execute(
            select(Mission.id).where(Mission.id == mission_id).with_for_update()
        )
        with cliente_sobre(engine) as cliente:
            inicio = time.monotonic()
            resposta = cliente.post(
                f"/api/missions/{mission_id}/start",
                json={"operation_id": operation_id},
            )
            decorrido = time.monotonic() - inicio
        segurando.rollback()

        assert resposta.status_code == 503
        assert resposta.headers["Retry-After"] == "2"
        assert resposta.json() == OCUPADO
        _sem_vazamento(resposta.text, "55P03", "LockNotAvailable", "SELECT", "missions")
        assert decorrido < PRAZO_DO_TESTE_SEGUNDOS
        assert isinstance(engine.pool, QueuePool)
        assert engine.pool.checkedout() == 0
        with Session(bind=banco_migrado) as leitura:
            assert leitura.get_one(Mission, mission_id).state == MissionState.PENDENTE
            assert (
                leitura.scalar(
                    select(func.count())
                    .select_from(MissionOperation)
                    .where(MissionOperation.operation_id == operation_id)
                )
                == 0
            )


def test_comando_acima_do_teto_vira_503(
    banco_migrado: Engine,
    settings: Settings,
    cliente_sobre: Callable[[Engine], TestClient],
) -> None:
    """`pg_sleep` de 1 s na sessao da requisicao, com `statement_timeout` de
    300 ms: o PostgreSQL cancela o comando (57014) e a rota responde 503."""
    with _engine_com_tetos(
        settings.test_database_url, statement_timeout_ms=TETO_CURTO_MS
    ) as engine:

        def sessao_lenta() -> Iterator[Session]:
            with Session(bind=engine) as sessao:
                sessao.execute(text("SELECT pg_sleep(1)"))
                yield sessao

        app.dependency_overrides[get_session] = sessao_lenta
        with cliente_sobre(engine) as cliente:
            resposta = cliente.get("/api/missions")

    assert resposta.status_code == 503
    assert resposta.headers["Retry-After"] == "2"
    assert resposta.json() == OCUPADO
    _sem_vazamento(resposta.text, "57014", "QueryCanceled", "pg_sleep")


def test_pool_esgotado_vira_503(
    banco_migrado: Engine,
    settings: Settings,
    cliente_sobre: Callable[[Engine], TestClient],
) -> None:
    """Engine crua, e nao `create_engine_from_url`: so assim o pool tem uma
    conexao e uma espera de 200 ms, em vez dos 15 lugares e 4 s da aplicacao.
    O que se prova e o handler do `TimeoutError` do pool, nao o tamanho dele."""
    engine = create_engine(
        settings.test_database_url, pool_size=1, max_overflow=0, pool_timeout=0.2
    )
    try:
        with engine.connect(), cliente_sobre(engine) as cliente:
            resposta = cliente.get("/api/missions")
    finally:
        engine.dispose()

    assert resposta.status_code == 503
    assert resposta.headers["Retry-After"] == "2"
    assert resposta.json() == OCUPADO
    _sem_vazamento(resposta.text, "QueuePool", "TimeoutError")


def test_outro_erro_operacional_continua_500(
    banco_migrado: Engine,
    settings: Settings,
    cliente_sobre: Callable[[Engine], TestClient],
) -> None:
    """A sessao encerra o proprio backend: o PostgreSQL responde 57P01
    (`admin_shutdown`), um `OperationalError` fora da lista transitoria. Ele
    nao e "banco ocupado", e repetir nao resolve: segue 500, sem `code`."""
    with _engine_com_tetos(settings.test_database_url) as engine:

        def sessao_derrubada() -> Iterator[Session]:
            with Session(bind=engine) as sessao:
                sessao.execute(text("SELECT pg_terminate_backend(pg_backend_pid())"))
                yield sessao

        app.dependency_overrides[get_session] = sessao_derrubada
        with cliente_sobre(engine) as cliente:
            resposta = cliente.get("/api/missions")

    assert resposta.status_code == 500
    assert "Retry-After" not in resposta.headers
    _sem_vazamento(resposta.text, "banco_ocupado", "57P01", "pg_terminate_backend")


def test_transacao_ociosa_acima_do_teto_encerra_a_sessao(
    banco_migrado: Engine, settings: Settings
) -> None:
    with (
        _engine_com_tetos(
            settings.test_database_url, idle_in_transaction_timeout_ms=TETO_CURTO_MS
        ) as engine,
        engine.connect() as ociosa,
    ):
        pid = ociosa.execute(text("SELECT pg_backend_pid()")).scalar_one()
        prazo = time.monotonic() + PRAZO_DO_TESTE_SEGUNDOS
        with banco_migrado.connect() as observador:
            while observador.execute(
                text("SELECT count(*) FROM pg_stat_activity WHERE pid = :pid"),
                {"pid": pid},
            ).scalar_one():
                observador.rollback()
                assert time.monotonic() < prazo, "a sessao ociosa nao caiu"

        with pytest.raises(DBAPIError) as erro:
            ociosa.execute(text("SELECT 1"))
    # O 25P03 real chega com o SQLSTATE, e nao como "server closed the
    # connection" sem codigo (que viraria 500), e e classificado transitorio.
    assert getattr(erro.value.orig, "sqlstate", None) == SQLSTATE_DA_TRANSACAO_OCIOSA
    assert e_falha_transitoria_do_banco(erro.value)


def _esperar(condicao: Callable[[], bool], motivo: str) -> None:
    """Sincroniza pelo estado do PostgreSQL, com prazo; nunca um `sleep` chutado."""
    prazo = time.monotonic() + PRAZO_DO_TESTE_SEGUNDOS
    while not condicao():
        assert time.monotonic() < prazo, motivo


def _backend_sumiu(observador: Connection, pid: int) -> bool:
    vivo: int = observador.execute(
        text("SELECT count(*) FROM pg_stat_activity WHERE pid = :pid"), {"pid": pid}
    ).scalar_one()
    observador.rollback()
    return vivo == 0


def _backend_espera_trava(observador: Connection, pids: list[int]) -> bool:
    if not pids:
        return False
    esperando: int = observador.execute(
        text(
            "SELECT count(*) FROM pg_stat_activity"
            " WHERE pid = :pid AND wait_event_type = 'Lock'"
        ),
        {"pid": pids[0]},
    ).scalar_one()
    observador.rollback()
    return esperando == 1


def test_transacao_ociosa_numa_rota_vira_503_e_loga_erro(
    banco_migrado: Engine,
    settings: Settings,
    cliente_sobre: Callable[[Engine], TestClient],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A sessao da requisicao abre a transacao e fica ociosa alem do teto; so
    depois de o PostgreSQL derrubar o backend a rota roda a consulta. O 25P03
    chega pela rota com SQLSTATE: 503, e log em `error` (defeito, ADR 0001)."""
    with _engine_com_tetos(
        settings.test_database_url, idle_in_transaction_timeout_ms=TETO_CURTO_MS
    ) as engine:

        def sessao_esquecida() -> Iterator[Session]:
            with Session(bind=engine) as sessao, banco_migrado.connect() as obs:
                pid = sessao.execute(text("SELECT pg_backend_pid()")).scalar_one()
                _esperar(lambda: _backend_sumiu(obs, pid), "a sessao ociosa nao caiu")
                yield sessao

        app.dependency_overrides[get_session] = sessao_esquecida
        with caplog.at_level(logging.WARNING), cliente_sobre(engine) as cliente:
            resposta = cliente.get("/api/missions")

    assert resposta.status_code == 503
    assert resposta.headers["Retry-After"] == "2"
    assert resposta.json() == OCUPADO
    _sem_vazamento(resposta.text, "25P03", "IdleInTransaction", "SELECT")
    erros = [
        r
        for r in caplog.records
        if r.name == "focusquest.main" and r.levelno >= logging.WARNING
    ]
    assert [r.levelno for r in erros] == [logging.ERROR]
    assert "transacao ociosa" in erros[0].getMessage()
    assert "SELECT" not in caplog.text


def test_deadlock_real_numa_rota_vira_503(
    banco_migrado: Engine,
    settings: Settings,
    cliente_sobre: Callable[[Engine], TestClient],
) -> None:
    """`FOR UPDATE` cruzado: a requisicao trava B (na sessao) e espera A (na
    rota); a conexao de fora trava A e, depois de ver a rota esperando, pede B.

    A vitima e quem procura o deadlock primeiro: cada backend so procura
    depois de esperar o proprio `deadlock_timeout`. A rota usa 1 s e a
    conexao de fora o prazo do teste, entao a rota acha o ciclo e leva o
    40P01; a transacao dela reverte, B e solto e a conexao de fora segue."""
    operation_id = "teto-deadlock"
    with (
        _missao_commitada(banco_migrado) as missao_a,
        _missao_commitada(banco_migrado) as missao_b,
        _engine_com_tetos(settings.test_database_url) as engine,
        banco_migrado.connect() as de_fora,
        banco_migrado.connect() as observador,
    ):
        pids_da_rota: list[int] = []

        def sessao_que_trava_b() -> Iterator[Session]:
            with Session(bind=engine) as sessao:
                pids_da_rota.append(
                    sessao.execute(text("SELECT pg_backend_pid()")).scalar_one()
                )
                sessao.execute(
                    select(Mission.id).where(Mission.id == missao_b).with_for_update()
                )
                yield sessao

        # Rede de seguranca: se a rota nao for a vitima, quem fica preso e a
        # conexao de fora, derrubada pelo teto em vez de travar a suite.
        de_fora.execute(
            text("SELECT set_config('lock_timeout', :ms, false)"),
            {"ms": str(PRAZO_DO_TESTE_SEGUNDOS * 1000)},
        )
        # A vitima e quem checa primeiro, e a ordem das esperas nao basta:
        # com a maquina carregada, o alarme de 1 s da rota pode disparar
        # depois do da conexao de fora, que comecou a esperar milissegundos
        # depois. Com o `deadlock_timeout` dela no prazo do teste, so a rota
        # checa em 1 s. Exige superusuario, como o POSTGRES_USER do compose
        # e do CI.
        de_fora.execute(
            text("SELECT set_config('deadlock_timeout', :ms, false)"),
            {"ms": str(PRAZO_DO_TESTE_SEGUNDOS * 1000)},
        )
        de_fora.execute(
            select(Mission.id).where(Mission.id == missao_a).with_for_update()
        )
        app.dependency_overrides[get_session] = sessao_que_trava_b
        respostas: list[Response] = []
        with cliente_sobre(engine) as cliente:
            requisicao = threading.Thread(
                target=lambda: respostas.append(
                    cliente.post(
                        f"/api/missions/{missao_a}/start",
                        json={"operation_id": operation_id},
                    )
                )
            )
            requisicao.start()
            _esperar(
                lambda: _backend_espera_trava(observador, pids_da_rota),
                "a rota nao chegou a esperar a trava de A",
            )
            de_fora.execute(
                select(Mission.id).where(Mission.id == missao_b).with_for_update()
            )
            requisicao.join(PRAZO_DO_TESTE_SEGUNDOS)
        de_fora.rollback()

        assert not requisicao.is_alive()
        [resposta] = respostas
        assert resposta.status_code == 503
        assert resposta.headers["Retry-After"] == "2"
        assert resposta.json() == OCUPADO
        _sem_vazamento(resposta.text, "40P01", "DeadlockDetected", "SELECT")
        with Session(bind=banco_migrado) as leitura:
            assert leitura.get_one(Mission, missao_a).state == MissionState.PENDENTE
            assert (
                leitura.scalar(
                    select(func.count())
                    .select_from(MissionOperation)
                    .where(MissionOperation.operation_id == operation_id)
                )
                == 0
            )
