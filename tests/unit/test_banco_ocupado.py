"""Falha transitoria do banco vira 503 `banco_ocupado`; o resto continua 500.

Aqui sem banco: a excecao e montada a mao e entra pela dependencia de sessao.
O caminho real (trava presa, comando acima do teto, pool esgotado e um erro
operacional de verdade do PostgreSQL) esta em
`tests/integration/test_tetos_do_banco.py`.
"""

import logging
from collections.abc import Callable, Iterator

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError, InternalError, OperationalError
from sqlalchemy.exc import TimeoutError as PoolEsgotadoError

from focusquest.core.database import (
    e_falha_transitoria_do_banco,
    get_session,
    motivo_da_falha_transitoria,
)
from focusquest.main import app


def _erro_operacional(original: BaseException) -> OperationalError:
    return OperationalError("SELECT 1", None, original)


# O embrulho que o SQLAlchemy de fato produz para cada um: a classe 25 do
# SQLSTATE (estado de transacao) chega como `InternalError`, e nao como
# `OperationalError`.
@pytest.mark.parametrize(
    "erro",
    [
        _erro_operacional(psycopg.errors.LockNotAvailable()),
        _erro_operacional(psycopg.errors.QueryCanceled()),
        _erro_operacional(psycopg.errors.DeadlockDetected()),
        InternalError(
            "SELECT 1", None, psycopg.errors.IdleInTransactionSessionTimeout()
        ),
    ],
    ids=["55P03", "57014", "40P01", "25P03"],
)
def test_classifica_sqlstate_transitorio(erro: DBAPIError) -> None:
    assert e_falha_transitoria_do_banco(erro)


def test_o_motivo_de_um_sqlstate_e_so_o_codigo() -> None:
    erro = _erro_operacional(psycopg.errors.LockNotAvailable("SELECT segredo"))

    assert motivo_da_falha_transitoria(erro) == "sqlstate 55P03"


def test_pool_esgotado_e_falha_transitoria() -> None:
    """Nao e `DBAPIError`, mas e o mesmo "tente de novo" (#177: a tutoria o
    classifica pela mesma funcao, dentro do stream)."""
    erro = PoolEsgotadoError("QueuePool limit of size 1 overflow 0 reached")

    assert e_falha_transitoria_do_banco(erro)
    assert motivo_da_falha_transitoria(erro) == "pool esgotado"


def test_excecao_que_nao_e_do_banco_nao_e_transitoria() -> None:
    assert not e_falha_transitoria_do_banco(RuntimeError("55P03"))


@pytest.mark.parametrize(
    "original",
    [
        psycopg.errors.UniqueViolation(),
        psycopg.errors.UndefinedTable(),
        psycopg.errors.AdminShutdown(),
        psycopg.OperationalError("conexao recusada"),
        RuntimeError("sem sqlstate"),
    ],
    ids=["23505", "42P01", "57P01", "sem-sqlstate", "nao-e-do-psycopg"],
)
def test_nao_classifica_o_resto_como_transitorio(original: BaseException) -> None:
    assert not e_falha_transitoria_do_banco(_erro_operacional(original))


@pytest.fixture
def cliente_com_falha() -> Iterator[Callable[[BaseException], TestClient]]:
    """Cliente cuja sessao da requisicao levanta `erro` ao ser resolvida.

    `raise_server_exceptions=False`: o 500 e a resposta que se quer observar,
    e nao a excecao relancada no teste.
    """

    def _montar(erro: BaseException) -> TestClient:
        def falhar() -> None:
            raise erro

        app.dependency_overrides[get_session] = falhar
        return TestClient(app, raise_server_exceptions=False)

    yield _montar
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "erro",
    [
        _erro_operacional(psycopg.errors.LockNotAvailable()),
        _erro_operacional(psycopg.errors.QueryCanceled()),
        InternalError(
            "SELECT 1", None, psycopg.errors.IdleInTransactionSessionTimeout()
        ),
        PoolEsgotadoError("QueuePool limit of size 1 overflow 0 reached"),
    ],
    ids=["trava", "teto-do-comando", "transacao-ociosa", "pool-esgotado"],
)
def test_falha_transitoria_responde_503_com_retry_after(
    cliente_com_falha: Callable[[BaseException], TestClient], erro: BaseException
) -> None:
    with cliente_com_falha(erro) as cliente:
        resposta = cliente.get("/api/missions")

    assert resposta.status_code == 503
    assert resposta.headers["Retry-After"] == "2"
    assert resposta.json() == {
        "detail": "banco de dados ocupado; tente de novo em instantes",
        "code": "banco_ocupado",
    }


@pytest.mark.parametrize(
    "erro",
    [
        _erro_operacional(psycopg.errors.DiskFull()),
        InternalError("SELECT 1", None, psycopg.errors.InFailedSqlTransaction()),
    ],
    ids=["53100", "25P02"],
)
def test_erro_do_banco_fora_da_lista_continua_500(
    cliente_com_falha: Callable[[BaseException], TestClient], erro: BaseException
) -> None:
    with cliente_com_falha(erro) as cliente:
        resposta = cliente.get("/api/missions")

    assert resposta.status_code == 500
    assert "Retry-After" not in resposta.headers
    assert "banco_ocupado" not in resposta.text


def _registros_do_handler(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [
        r
        for r in caplog.records
        if r.name == "focusquest.main" and r.levelno >= logging.WARNING
    ]


def test_transacao_ociosa_numa_rota_loga_erro_sem_sql_nem_valores(
    cliente_com_falha: Callable[[BaseException], TestClient],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """ADR 0001: o 25P03 numa rota indica defeito (a requisicao deixou a
    transacao ociosa), e repetir nao resolve. Segue 503, mas o log e `error`."""
    erro = InternalError(
        "SELECT segredo FROM missions WHERE id = %(id)s",
        {"id": "CANARIO-25P03"},
        psycopg.errors.IdleInTransactionSessionTimeout(),
    )
    with caplog.at_level(logging.WARNING), cliente_com_falha(erro) as cliente:
        resposta = cliente.get("/api/missions")

    assert resposta.status_code == 503
    registros = _registros_do_handler(caplog)
    assert [r.levelno for r in registros] == [logging.ERROR]
    mensagem = registros[0].getMessage()
    assert "transacao ociosa" in mensagem
    assert "25P03" in mensagem
    for proibido in ("SELECT", "segredo", "CANARIO-25P03"):
        assert proibido not in caplog.text


def test_trava_numa_rota_continua_em_warning(
    cliente_com_falha: Callable[[BaseException], TestClient],
    caplog: pytest.LogCaptureFixture,
) -> None:
    with (
        caplog.at_level(logging.WARNING),
        cliente_com_falha(
            _erro_operacional(psycopg.errors.LockNotAvailable())
        ) as cliente,
    ):
        cliente.get("/api/missions")

    assert [r.levelno for r in _registros_do_handler(caplog)] == [logging.WARNING]
