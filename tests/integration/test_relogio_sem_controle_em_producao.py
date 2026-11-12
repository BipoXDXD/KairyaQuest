"""O app de producao nao tem controle de relogio (pendencia 116, STRIDE).

O E2E move o relogio da API por `PUT /_e2e/clock`, e essa rota so existe na
entrada do E2E (`tests/integration/e2e_app.py`). Se ela aparecesse no app de
producao, qualquer cliente que alcancasse a API poderia mover "agora" --
abrir de novo uma diaria perdida, concluir fora do prazo, destravar o teto
diario da tutoria. Estes testes montam o app de producao como o uvicorn de
producao o monta (`focusquest.main:app`) e conferem que a rota nao existe e
que o relogio nao muda.

Importar `integration.relogio_do_e2e` aqui e seguro: o modulo so declara o
relogio e a rota. Quem os liga a um app e `montar_app_do_e2e`, chamado so pela
entrada do E2E -- que este arquivo NAO importa.
"""

from collections.abc import Iterator
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.openapi.utils import get_openapi
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from focusquest.core.clock import get_clock, system_now
from focusquest.core.database import get_session
from focusquest.main import app
from integration.relogio_do_e2e import ROTA_DO_RELOGIO
from integration.reset_do_e2e import ROTA_DO_RESET

# Um instante que nenhum relogio real devolve hoje: se ele aparecer como o dia
# do ciclo, a rota de controle existiu e funcionou.
INSTANTE_FORJADO = "2025-01-09T03:10:00Z"
DIA_FORJADO = "2025-01-09"


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    """A sessao do teste, e so ela: o relogio fica o de producao."""
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_session, None)


def test_o_app_de_producao_nao_publica_a_rota_do_relogio() -> None:
    """O esquema OpenAPI gerado agora, e nao o `app.openapi()` em cache: o
    FastAPI guarda o primeiro esquema calculado, e uma rota registrada depois
    dele nao apareceria. `app.routes` tambem nao serve: no FastAPI do uv.lock
    (0.142) as rotas de um `include_router` ficam num no interno, sem `path`.
    Uma rota com `include_in_schema=False` escaparia daqui; o teste de 404
    abaixo e o que a pega."""
    esquema = get_openapi(title=app.title, version=app.version, routes=app.routes)

    assert not [caminho for caminho in esquema["paths"] if caminho.startswith("/_e2e")]


def test_o_app_de_producao_usa_o_relogio_real() -> None:
    assert get_clock not in app.dependency_overrides
    assert get_clock() is system_now


@pytest.mark.parametrize("metodo", ["PUT", "DELETE"])
def test_a_rota_do_relogio_responde_404_e_o_relogio_nao_muda(
    client: TestClient, metodo: str
) -> None:
    resposta = client.request(metodo, ROTA_DO_RELOGIO, json={"now": INSTANTE_FORJADO})

    assert resposta.status_code == 404
    assert "now" not in resposta.text
    # O dia do ciclo continua o de hoje em Sao Paulo, lido do relogio real. Os
    # dois lados da leitura cobrem a virada da meia-noite durante o teste.
    fuso = ZoneInfo("America/Sao_Paulo")
    antes = datetime.now(UTC).astimezone(fuso).date().isoformat()
    hoje = client.get("/api/cycle").json()["today"]
    depois = datetime.now(UTC).astimezone(fuso).date().isoformat()
    assert hoje in {antes, depois}
    assert hoje != DIA_FORJADO


def test_a_rota_do_reset_do_e2e_responde_404_em_producao(client: TestClient) -> None:
    """O reset do E2E (`/_e2e/reset`) tambem e so da entrada do E2E."""
    resposta = client.post(ROTA_DO_RESET)

    assert resposta.status_code == 404
