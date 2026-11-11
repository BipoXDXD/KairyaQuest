"""`descartar_engine` fecha o pool no desligamento (pendencia 14).

O `get_engine` cria a engine sob demanda e nunca a devolvia: no shutdown as
conexoes do pool ficavam abertas ate o processo morrer. O lifespan de
`main.py` chama `descartar_engine` no `finally`.

Nenhum teste aqui conecta ao banco: a engine e uma falsa que conta chamadas de
`dispose`, e o `Settings` nao e lido -- a criacao tambem e substituida.
"""

import logging
import threading
from collections.abc import Iterator
from typing import cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from focusquest.core import database
from focusquest.main import app

# Teto para `join`/`wait`: um deadlock vira falha do teste, nao suite pendurada.
TETO_DA_THREAD = 10.0
# Quanto o teste espera para ter certeza de que a thread NAO andou.
ESPERA_DO_BLOQUEIO = 0.3


class EngineFalsa:
    def __init__(self) -> None:
        self.descartes = 0

    def dispose(self) -> None:
        self.descartes += 1


def como_engine(falsa: EngineFalsa) -> Engine:
    return cast(Engine, falsa)


def as_object(valor: object) -> object:
    # O mypy estrito recusa `is` entre `Engine` e a falsa (tipos sem
    # sobreposicao); a identidade e justamente o que o teste quer afirmar.
    return valor


@pytest.fixture(autouse=True)
def sem_engine_global(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(database, "_engine", None)
    yield


def test_descartar_sem_engine_criada_nao_faz_nada() -> None:
    database.descartar_engine()

    assert database._engine is None


def test_descartar_chama_dispose_e_zera_a_referencia(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    falsa = EngineFalsa()
    monkeypatch.setattr(database, "_engine", falsa)

    database.descartar_engine()

    assert falsa.descartes == 1
    assert database._engine is None


def test_descartar_duas_vezes_descarta_uma_so(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    falsa = EngineFalsa()
    monkeypatch.setattr(database, "_engine", falsa)

    database.descartar_engine()
    database.descartar_engine()

    assert falsa.descartes == 1


def test_get_engine_depois_do_descarte_cria_outra(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    primeira, segunda = EngineFalsa(), EngineFalsa()
    fila = [primeira, segunda]
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", "postgresql+psycopg://u:p@h:55432/d")
    monkeypatch.setenv(
        "FOCUSQUEST_TEST_DATABASE_URL", "postgresql+psycopg://u:p@h:55432/t"
    )
    monkeypatch.setattr(
        database,
        "create_engine_from_url",
        lambda url, poolclass=None: como_engine(fila.pop(0)),
    )

    antes = database.get_engine()
    database.descartar_engine()
    depois = database.get_engine()

    assert as_object(antes) is primeira
    assert as_object(depois) is segunda
    assert primeira.descartes == 1
    assert segunda.descartes == 0


def test_descartar_espera_a_trava_da_criacao(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Descartar durante uma criacao em andamento nao pode ler `_engine` no
    meio dela: a trava e a mesma do `get_engine`."""
    falsa = EngineFalsa()
    monkeypatch.setattr(database, "_engine", falsa)
    terminou = threading.Event()

    def descartar() -> None:
        database.descartar_engine()
        terminou.set()

    thread = threading.Thread(target=descartar, daemon=True)
    with database._trava_da_criacao:
        thread.start()
        assert not terminou.wait(timeout=ESPERA_DO_BLOQUEIO)
        assert falsa.descartes == 0
    thread.join(timeout=TETO_DA_THREAD)

    assert terminou.is_set()
    assert falsa.descartes == 1


def test_lifespan_descarta_a_engine_na_saida(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    falsa = EngineFalsa()
    monkeypatch.setattr(database, "_engine", falsa)

    with TestClient(app):
        # Na partida o lifespan nao mexe na engine.
        assert falsa.descartes == 0
        assert as_object(database._engine) is falsa

    assert falsa.descartes == 1
    assert database._engine is None


def test_lifespan_descarta_mesmo_quando_o_corpo_levanta(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    falsa = EngineFalsa()
    monkeypatch.setattr(database, "_engine", falsa)

    with pytest.raises(RuntimeError, match="falha no corpo"), TestClient(app):
        raise RuntimeError("falha no corpo")

    assert falsa.descartes == 1


def test_liveness_continua_sem_criar_engine_nem_ler_o_banco(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def proibido(url: str, poolclass: object = None) -> object:
        raise AssertionError("a liveness e a partida nao criam engine")

    monkeypatch.setattr(database, "create_engine_from_url", proibido)

    with TestClient(app) as cliente:
        resposta = cliente.get("/health")
        assert database._engine is None

    assert resposta.status_code == 200
    assert database._engine is None


def test_erro_ao_fechar_o_pool_nao_impede_restaurar_o_log(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class EngineQueFalha(EngineFalsa):
        def dispose(self) -> None:
            super().dispose()
            raise RuntimeError("falha ao fechar o pool")

    nivel_de_antes = logging.getLogger("focusquest").level
    monkeypatch.setattr(database, "_engine", EngineQueFalha())

    with pytest.raises(RuntimeError, match="falha ao fechar o pool"), TestClient(app):
        # Dentro do lifespan o nivel ja foi configurado pela partida.
        logging.getLogger("focusquest").setLevel(logging.CRITICAL)

    assert logging.getLogger("focusquest").level == nivel_de_antes
