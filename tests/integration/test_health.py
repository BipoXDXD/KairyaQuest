"""Liveness nao toca no banco; readiness toca de verdade."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from focusquest import main
from focusquest.core.database import create_engine_from_url
from focusquest.main import app, get_engine


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    app.dependency_overrides[get_engine] = lambda: engine
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_health_responde_sem_banco() -> None:
    # Sem override: nenhuma dependencia de banco e resolvida.
    with TestClient(app) as c:
        resposta = c.get("/health")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok"}


def test_ready_confirma_o_banco(client: TestClient) -> None:
    resposta = client.get("/ready")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok", "database": "ok"}


def test_ready_falha_quando_o_banco_nao_responde() -> None:
    quebrado = create_engine_from_url(
        "postgresql+psycopg://focusquest:focusquest_local@127.0.0.1:1/inexistente"
    )
    app.dependency_overrides[get_engine] = lambda: quebrado
    with TestClient(app) as c:
        resposta = c.get("/ready")
    app.dependency_overrides.clear()
    quebrado.dispose()

    assert resposta.status_code == 503
    assert resposta.json()["database"] == "indisponivel"


def test_get_engine_cria_uma_vez_e_reaproveita(monkeypatch: pytest.MonkeyPatch) -> None:
    """get_engine() e substituida nos testes de rota, entao o corpo dela
    precisa de um teste proprio -- senao fica descoberto.

    Substituir uma dependencia nos testes nao a testa. Aqui o modulo e
    importado como objeto porque o cache vive em uma variavel global dele:
    so com o modulo em maos da para zerar e restaurar esse estado.
    """
    monkeypatch.setattr(main, "_engine", None)
    primeira = main.get_engine()
    segunda = main.get_engine()
    assert primeira is segunda
    primeira.dispose()
    monkeypatch.setattr(main, "_engine", None)
