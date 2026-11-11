"""A traducao do corpo invalido de `PATCH /api/me`, sem banco.

Os testes de `tests/integration/test_me_api.py` provam o mesmo contra o
PostgreSQL, e tambem que nada muda no banco. Este arquivo prova so a fronteira
HTTP -- a `RotaQueRecusaCampoExtra` e o handler do 400 em `main.py` -- e por
isso roda sem banco: a validacao recusa o corpo antes da rota chamar o
servico, e a sessao substituida nunca e usada.
"""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from focusquest.core.database import get_session
from focusquest.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    """Sessao substituida por `None`: se a rota chegasse ao servico, o teste
    quebraria com `AttributeError`, e nao passaria calado."""
    app.dependency_overrides[get_session] = lambda: None
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_session, None)


@pytest.mark.parametrize(
    "corpo",
    [
        {"locale": "en", "display_name": "X"},
        {"locale": "en", "id": 2},
        {"locale": "fr", "role": "admin"},
    ],
)
def test_campo_extra_vira_400_com_code(client: TestClient, corpo: Any) -> None:
    resposta = client.patch("/api/me", json=corpo)
    assert resposta.status_code == 400
    assert resposta.json() == {
        "detail": "campo desconhecido no corpo",
        "code": "campo_desconhecido",
    }


@pytest.mark.parametrize(
    "corpo", [{"locale": "fr"}, {"locale": None}, {}, [], "en", None]
)
def test_sem_campo_extra_continua_422_nativo(client: TestClient, corpo: Any) -> None:
    resposta = client.patch("/api/me", json=corpo)
    assert resposta.status_code == 422
    assert "code" not in resposta.json()


def test_campo_extra_numa_rota_de_outro_router_continua_422(
    client: TestClient,
) -> None:
    """O 400 e so de `/api/me`: o handler global segue em 422 no resto da API."""
    resposta = client.post("/api/plans", json={"x": 1})
    assert resposta.status_code == 422


def test_openapi_publica_o_400_e_o_422_do_patch(client: TestClient) -> None:
    respostas = client.get("/openapi.json").json()["paths"]["/api/me"]["patch"][
        "responses"
    ]
    assert {"200", "400", "422"} <= set(respostas)
