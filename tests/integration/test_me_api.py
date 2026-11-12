"""`GET` e `PATCH /api/me`: o idioma do usuario, contra PostgreSQL real.

O `client` e copiado de `test_progression_api.py`, pelo mesmo motivo: a
substituicao amarra a requisicao a sessao do teste (o override de
`get_session`), o `commit` da rota fecha so o savepoint da fixture e o
rollback dela desfaz tudo; o teardown remove so a PROPRIA chave.
"""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import Session

from focusquest.core.database import get_session
from focusquest.core.idioma import Idioma
from focusquest.core.usuario_unico import USUARIO_UNICO
from focusquest.main import app
from focusquest.modules.users.models import User
from focusquest.modules.users.service import atualizar_idioma, ler_idioma

# Nenhum usuario tem este id: os testes de defeito nao o criam.
INEXISTENTE = 987_654


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    """Cliente cuja requisicao usa a SESSAO DO TESTE. Ver `test_missions_api.py`."""
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_session, None)


def _locale_gravado(session: Session) -> str | None:
    return session.scalar(select(User.locale).where(User.id == USUARIO_UNICO))


def test_get_me_devolve_exatamente_nome_e_idioma(client: TestClient) -> None:
    resposta = client.get("/api/me")
    assert resposta.status_code == 200
    assert set(resposta.json()) == {"display_name", "locale"}


def test_get_me_devolve_o_nome_semeado(client: TestClient) -> None:
    assert client.get("/api/me").json()["display_name"] == "Estudante"


def test_get_me_sem_escolha_devolve_locale_null(client: TestClient) -> None:
    assert client.get("/api/me").json()["locale"] is None


def test_get_me_depois_de_escolher_devolve_o_valor(client: TestClient) -> None:
    client.patch("/api/me", json={"locale": "en"})
    assert client.get("/api/me").json()["locale"] == "en"


def test_patch_me_grava_o_idioma(client: TestClient, session: Session) -> None:
    resposta = client.patch("/api/me", json={"locale": "en"})
    assert resposta.status_code == 200
    assert resposta.json() == {"display_name": "Estudante", "locale": "en"}
    assert _locale_gravado(session) == "en"


def test_patch_me_troca_um_idioma_ja_escolhido(
    client: TestClient, session: Session
) -> None:
    client.patch("/api/me", json={"locale": "en"})
    resposta = client.patch("/api/me", json={"locale": "pt-BR"})
    assert resposta.json()["locale"] == "pt-BR"
    assert _locale_gravado(session) == "pt-BR"


def test_patch_me_repetido_e_idempotente(client: TestClient) -> None:
    client.patch("/api/me", json={"locale": "en"})
    resposta = client.patch("/api/me", json={"locale": "en"})
    assert resposta.status_code == 200
    assert resposta.json()["locale"] == "en"


@pytest.mark.parametrize(
    "corpo",
    [
        {"locale": "en", "display_name": "X"},
        {"locale": "en", "id": 2},
        {"locale": "en", "role": "admin"},
    ],
)
def test_campo_extra_e_400_e_nada_muda(
    client: TestClient, session: Session, corpo: dict[str, Any]
) -> None:
    resposta = client.patch("/api/me", json=corpo)
    assert resposta.status_code == 400
    assert resposta.json() == {
        "detail": "campo desconhecido no corpo",
        "code": "campo_desconhecido",
    }
    assert _locale_gravado(session) is None
    nome = session.scalar(select(User.display_name).where(User.id == USUARIO_UNICO))
    assert nome == "Estudante"


def test_extra_e_valor_invalido_juntos_e_400(client: TestClient) -> None:
    resposta = client.patch("/api/me", json={"locale": "fr", "x": 1})
    assert resposta.status_code == 400


@pytest.mark.parametrize(
    "corpo",
    [
        {"locale": "fr"},
        {"locale": "EN"},
        {"locale": ""},
        {"locale": None},
        {"locale": "en\u0000"},
        {},
        [],
        "en",
        None,
    ],
)
def test_valor_invalido_ou_corpo_nao_objeto_e_422(
    client: TestClient, session: Session, corpo: Any
) -> None:
    resposta = client.patch("/api/me", json=corpo)
    assert resposta.status_code == 422
    assert _locale_gravado(session) is None


@pytest.mark.parametrize(
    ("corpo", "status"),
    [({"locale": "en", "x": 1}, 400), ({"locale": "fr"}, 422)],
    ids=["400-campo-extra", "422-valor-invalido"],
)
def test_erro_nao_vaza_detalhe_interno(
    client: TestClient, corpo: dict[str, Any], status: int
) -> None:
    resposta = client.patch("/api/me", json=corpo)
    assert resposta.status_code == status
    for proibido in ("Traceback", "sqlalchemy", "focusquest.", "SELECT"):
        assert proibido not in resposta.text


# ---------------------------------------------------------------------------
# O fallback do back: o unico lugar que troca `NULL` por `pt-BR`.
# ---------------------------------------------------------------------------


def test_ler_idioma_com_null_devolve_pt_br(session: Session) -> None:
    assert _locale_gravado(session) is None
    assert ler_idioma(session, USUARIO_UNICO) is Idioma.PT_BR


def test_ler_idioma_devolve_o_valor_gravado(session: Session) -> None:
    atualizar_idioma(session, USUARIO_UNICO, Idioma.EN)
    assert ler_idioma(session, USUARIO_UNICO) is Idioma.EN


def test_ler_idioma_de_usuario_inexistente_falha_alto(session: Session) -> None:
    """Usuario que nao existe nao e "nunca escolheu": nada de `pt-BR` calado."""
    with pytest.raises(NoResultFound):
        ler_idioma(session, INEXISTENTE)


def test_atualizar_idioma_de_usuario_inexistente_falha_alto(
    session: Session,
) -> None:
    """Nenhuma linha afetada e defeito, e nao 200 sobre nada gravado."""
    with pytest.raises(RuntimeError, match="afetou 0"):
        atualizar_idioma(session, INEXISTENTE, Idioma.EN)
