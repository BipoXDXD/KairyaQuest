"""Liveness nao toca no banco; readiness toca de verdade."""

from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from focusquest import main
from focusquest.core.database import create_engine_from_url
from focusquest.main import app, get_engine


@pytest.fixture
def override_engine() -> Iterator[Callable[[Engine], None]]:
    """Substitui a engine e restaura SEMPRE, inclusive se o teste falhar.

    `app.dependency_overrides` e estado global do app, e limpeza escrita no
    corpo do teste so roda se o teste chegar ate ela: um assert que cai antes
    vaza o override para os testes seguintes, e o defeito reaparece longe da
    causa. O `yield` da fixture roda no teardown, tenha o teste passado ou
    nao -- por isso restaurar estado global e trabalho de fixture, nao do
    corpo do teste.
    """

    def _aplicar(engine: Engine) -> None:
        app.dependency_overrides[get_engine] = lambda: engine

    yield _aplicar
    app.dependency_overrides.clear()


@pytest.fixture
def client(
    engine: Engine, override_engine: Callable[[Engine], None]
) -> Iterator[TestClient]:
    override_engine(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def engine_quebrada() -> Iterator[Engine]:
    """Engine apontada para uma porta onde nada escuta.

    O `dispose()` tambem e limpeza de estado, entao tambem vive aqui: no
    corpo do teste ele deixaria de rodar assim que algo falhasse antes dele.
    """
    engine = create_engine_from_url(
        "postgresql+psycopg://focusquest:focusquest_local@127.0.0.1:1/inexistente"
    )
    yield engine
    engine.dispose()


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


def test_ready_falha_quando_o_banco_nao_responde(
    engine_quebrada: Engine, override_engine: Callable[[Engine], None]
) -> None:
    override_engine(engine_quebrada)
    with TestClient(app) as c:
        resposta = c.get("/ready")

    assert resposta.status_code == 503
    assert resposta.json()["database"] == "indisponivel"


def test_get_engine_cria_uma_vez_e_reaproveita(monkeypatch: pytest.MonkeyPatch) -> None:
    """get_engine() e substituida nos testes de rota, entao o corpo dela
    precisa de um teste proprio -- senao fica descoberto.

    Substituir uma dependencia nos testes nao a testa. Aqui o modulo e
    importado como objeto porque o cache vive em uma variavel global dele:
    so com o modulo em maos da para zerar e restaurar esse estado. O
    monkeypatch restaura no teardown, valendo a mesma regra da fixture
    override_engine.
    """
    monkeypatch.setattr(main, "_engine", None)
    primeira = main.get_engine()
    segunda = main.get_engine()
    assert primeira is segunda
    primeira.dispose()
    monkeypatch.setattr(main, "_engine", None)
