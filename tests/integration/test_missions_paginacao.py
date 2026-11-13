"""Paginacao por keyset do `GET /api/missions` (#182).

O cursor e o par `(deadline, id)` da ULTIMA missao da pagina anterior, a mesma
chave da ordenacao: `after_deadline` e `after_id` andam juntos. A resposta
continua sendo a lista (mudanca aditiva: quem nao manda parametro recebe a
primeira pagina, no tamanho padrao). Pagina mais curta que o `limit` e a
ultima.

Os valores esperados sao literais: 50 de padrao e 100 de teto, escritos a mao.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from focusquest.core.database import get_session
from focusquest.main import app
from focusquest.modules.missions.service import criar_missao
from focusquest.modules.users.models import User

ESTUDANTE = 1
OUTRO = 2
BASE = datetime(2030, 1, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    """A requisicao usa a sessao do teste (ver `test_missions_api.client`)."""
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_session, None)


def _criar(session: Session, prazo: datetime, *, user_id: int = ESTUDANTE) -> int:
    return criar_missao(
        session,
        user_id=user_id,
        instructions="Ler o capitulo",
        completion_criterion="Resumo entregue",
        difficulty=2,
        estimated_minutes=30,
        deadline=prazo,
    ).id


def _ids(resposta: Any) -> list[int]:
    assert resposta.status_code == 200, resposta.text
    return [missao["id"] for missao in resposta.json()]


def _depois_de(resposta: Any) -> dict[str, Any]:
    ultima = resposta.json()[-1]
    return {"after_deadline": ultima["deadline"], "after_id": ultima["id"]}


def test_pagina_vazia_e_lista_vazia(client: TestClient) -> None:
    assert _ids(client.get("/api/missions")) == []


def test_uma_pagina_devolve_tudo_em_ordem(client: TestClient, session: Session) -> None:
    terceira = _criar(session, BASE + timedelta(days=3))
    primeira = _criar(session, BASE + timedelta(days=1))
    segunda = _criar(session, BASE + timedelta(days=2))

    assert _ids(client.get("/api/missions")) == [primeira, segunda, terceira]


def test_varias_paginas_seguem_a_ordem_sem_repetir_nem_pular(
    client: TestClient, session: Session
) -> None:
    # Dois prazos iguais caem na fronteira entre a primeira e a segunda
    # pagina: o desempate por `id` e o que impede repetir ou pular.
    a = _criar(session, BASE + timedelta(days=1))
    b = _criar(session, BASE + timedelta(days=2))
    c = _criar(session, BASE + timedelta(days=2))
    d = _criar(session, BASE + timedelta(days=3))
    e = _criar(session, BASE + timedelta(days=4))

    primeira = client.get("/api/missions", params={"limit": 2})
    assert _ids(primeira) == [a, b]
    segunda = client.get("/api/missions", params={"limit": 2, **_depois_de(primeira)})
    assert _ids(segunda) == [c, d]
    terceira = client.get("/api/missions", params={"limit": 2, **_depois_de(segunda)})
    assert _ids(terceira) == [e]
    depois_da_ultima = client.get(
        "/api/missions", params={"limit": 2, **_depois_de(terceira)}
    )
    assert _ids(depois_da_ultima) == []


def test_cursor_em_outro_fuso_e_o_mesmo_instante(
    client: TestClient, session: Session
) -> None:
    a = _criar(session, BASE)
    b = _criar(session, BASE + timedelta(hours=1))
    resposta = client.get(
        "/api/missions",
        params={"after_deadline": "2030-01-01T09:00:00-03:00", "after_id": a},
    )
    assert _ids(resposta) == [b]


def test_missao_de_outro_usuario_nao_entra_na_pagina(
    client: TestClient, session: Session
) -> None:
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()
    _criar(session, BASE, user_id=OUTRO)
    minha = _criar(session, BASE + timedelta(days=1))

    assert _ids(client.get("/api/missions", params={"limit": 1})) == [minha]


def test_sem_limit_a_pagina_tem_50(client: TestClient, session: Session) -> None:
    ids = [_criar(session, BASE + timedelta(minutes=i)) for i in range(51)]

    assert _ids(client.get("/api/missions")) == ids[:50]


def test_limit_no_teto_e_aceito(client: TestClient, session: Session) -> None:
    ids = [_criar(session, BASE + timedelta(minutes=i)) for i in range(101)]

    assert _ids(client.get("/api/missions", params={"limit": 100})) == ids[:100]


@pytest.mark.parametrize(
    "params",
    [
        pytest.param({"limit": 101}, id="limit-acima-do-teto"),
        pytest.param({"limit": 0}, id="limit-zero"),
        pytest.param({"limit": -1}, id="limit-negativo"),
        pytest.param({"limit": "dez"}, id="limit-texto"),
        pytest.param({"after_deadline": "lixo", "after_id": 1}, id="prazo-lixo"),
        pytest.param(
            {"after_deadline": "2030-01-01T12:00:00", "after_id": 1},
            id="prazo-sem-fuso",
        ),
        pytest.param(
            {"after_deadline": "9999-12-31T23:59:59-03:00", "after_id": 1},
            id="prazo-fora-da-faixa",
        ),
        pytest.param({"after_deadline": "2030-01-01T12:00:00Z"}, id="so-prazo"),
        pytest.param({"after_id": 1}, id="so-id"),
        pytest.param(
            {"after_deadline": "2030-01-01T12:00:00Z", "after_id": 0}, id="id-zero"
        ),
        pytest.param(
            {"after_deadline": "2030-01-01T12:00:00Z", "after_id": 2**31},
            id="id-acima-do-int4",
        ),
        pytest.param(
            {"after_deadline": "2030-01-01T12:00:00Z\u0000", "after_id": 1},
            id="prazo-com-nul",
        ),
        pytest.param({"cursor": "abc"}, id="parametro-desconhecido"),
    ],
)
def test_parametro_invalido_e_422_e_nunca_500(
    client: TestClient, params: dict[str, Any]
) -> None:
    resposta = client.get("/api/missions", params=params)
    assert resposta.status_code == 422, resposta.text
