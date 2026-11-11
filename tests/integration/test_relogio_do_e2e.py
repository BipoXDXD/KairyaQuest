"""O relogio controlavel do E2E e o app que o monta sobre o de producao.

Um app de producao FALSO, com uma rota que le `get_clock`, no lugar do
`focusquest.main.app`: `montar_app_do_e2e` troca o relogio do app que recebe,
e fazer isso no app de producao vazaria o override para o resto da suite.
"""

from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from focusquest.core.clock import Clock, get_clock
from integration.relogio_do_e2e import (
    ROTA_DO_RELOGIO,
    RelogioDoE2E,
    montar_app_do_e2e,
)

INSTANTE = datetime(2025, 1, 9, 3, 10, tzinfo=UTC)


def _producao_falsa(partidas: list[str]) -> FastAPI:
    @asynccontextmanager
    async def ciclo(_app: FastAPI) -> AsyncIterator[None]:
        partidas.append("partiu")
        yield

    producao = FastAPI(lifespan=ciclo)

    @producao.get("/agora")
    def agora(clock: Annotated[Clock, Depends(get_clock)]) -> dict[str, str]:
        return {"now": clock().isoformat()}

    return producao


@pytest.fixture
def partidas() -> list[str]:
    return []


@pytest.fixture
def client(partidas: list[str]) -> Iterator[TestClient]:
    with TestClient(montar_app_do_e2e(_producao_falsa(partidas), RelogioDoE2E())) as c:
        yield c


def _agora(client: TestClient) -> datetime:
    return datetime.fromisoformat(client.get("/agora").json()["now"])


def test_sem_instante_fixado_o_relogio_e_o_real(client: TestClient) -> None:
    antes = datetime.now(UTC)

    lido = _agora(client)

    assert antes <= lido <= datetime.now(UTC)


def test_put_fixa_o_instante_que_as_rotas_de_producao_leem(
    client: TestClient,
) -> None:
    resposta = client.put(ROTA_DO_RELOGIO, json={"now": "2025-01-09T00:10:00-03:00"})

    assert resposta.status_code == 200
    assert datetime.fromisoformat(resposta.json()["now"]) == INSTANTE
    assert _agora(client) == INSTANTE
    assert _agora(client) == INSTANTE


def test_delete_devolve_o_relogio_real(client: TestClient) -> None:
    client.put(ROTA_DO_RELOGIO, json={"now": INSTANTE.isoformat()})

    resposta = client.delete(ROTA_DO_RELOGIO)

    assert resposta.status_code == 204
    assert _agora(client) > INSTANTE + timedelta(days=365)


@pytest.mark.parametrize(
    "corpo",
    [
        {"now": "2025-01-09T03:10:00"},
        {"now": "amanha"},
        {},
        {"now": INSTANTE.isoformat(), "offset": 60},
    ],
    ids=["sem-fuso", "invalido", "vazio", "campo-extra"],
)
def test_put_recusa_corpo_invalido_e_nao_mexe_no_relogio(
    client: TestClient, corpo: dict[str, object]
) -> None:
    client.put(ROTA_DO_RELOGIO, json={"now": INSTANTE.isoformat()})

    resposta = client.put(ROTA_DO_RELOGIO, json=corpo)

    assert resposta.status_code == 422
    assert _agora(client) == INSTANTE


def test_o_ciclo_de_vida_do_app_de_producao_roda(partidas: list[str]) -> None:
    app = montar_app_do_e2e(_producao_falsa(partidas), RelogioDoE2E())

    with TestClient(app):
        pass

    assert partidas == ["partiu"]


def test_fixar_recusa_instante_sem_fuso() -> None:
    relogio = RelogioDoE2E()

    with pytest.raises(ValueError, match="sem fuso"):
        relogio.fixar(datetime(2025, 1, 9, 3, 10))

    antes = datetime.now(UTC)
    assert antes <= relogio() <= datetime.now(UTC)
