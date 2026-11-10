"""A recusa dos limites da avulsa pela ROTA de criacao, sem banco.

A sessao da requisicao e substituida por um objeto que reprova o teste se for
tocado: a recusa tem de acontecer ANTES de qualquer escrita, e e isso que torna
o "banco inalterado" verdadeiro por construcao. O teste com banco real, que
confere a tabela, esta em `tests/integration/test_missions_api.py`.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from focusquest.core.clock import get_clock
from focusquest.core.database import get_session
from focusquest.main import app

AGORA = datetime(2026, 11, 10, 15, 0, tzinfo=UTC)


class _SessaoProibida:
    """Qualquer atributo lido reprova: a rota nao pode chegar ao banco."""

    def __getattr__(self, nome: str) -> Any:
        raise AssertionError(f"a sessao foi usada ({nome}) antes da recusa")


@pytest.fixture
def cliente() -> Iterator[TestClient]:
    sobrepostos: dict[Any, Any] = {
        get_session: lambda: _SessaoProibida(),
        get_clock: lambda: lambda: AGORA,
    }
    app.dependency_overrides.update(sobrepostos)
    try:
        with TestClient(app) as c:
            yield c
    finally:
        for chave in sobrepostos:
            app.dependency_overrides.pop(chave, None)


def _corpo(**ajustes: Any) -> dict[str, Any]:
    corpo: dict[str, Any] = {
        "instructions": "Ler o capitulo 3",
        "completion_criterion": "Resumo de uma pagina entregue",
        "difficulty": 2,
        "estimated_minutes": 30,
        "deadline": (AGORA + timedelta(days=1)).isoformat(),
    }
    return corpo | ajustes


@pytest.mark.parametrize(
    "minutos", [1441, 2**31 - 1], ids=["teto+1", "teto tecnico do int4"]
)
def test_estimativa_acima_do_teto_devolve_422_com_code(
    cliente: TestClient, minutos: int
) -> None:
    resposta = cliente.post("/api/missions", json=_corpo(estimated_minutes=minutos))

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["code"] == "estimativa_fora_do_limite"
    assert "1440" in corpo["detail"]


@pytest.mark.parametrize(
    "prazo",
    [
        AGORA,
        AGORA - timedelta(days=1),
        AGORA + timedelta(days=365, seconds=1),
        datetime(9999, 12, 31, 23, 59, 59, tzinfo=UTC),
    ],
    ids=["agora", "ontem", "agora+365d+1s", "ano 9999"],
)
def test_prazo_fora_da_janela_devolve_422_com_code(
    cliente: TestClient, prazo: datetime
) -> None:
    resposta = cliente.post("/api/missions", json=_corpo(deadline=prazo.isoformat()))

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["code"] == "prazo_fora_do_limite"
    assert "365" in corpo["detail"]


def test_estimativa_zero_continua_recusada_pelo_schema(cliente: TestClient) -> None:
    """Zero e negativo ja eram recusados pelo `gt=0` do schema, no formato
    nativo do 422 (com `loc`, sem `code`). O contrato antigo fica: a borda
    tecnica responde antes da regra de negocio."""
    resposta = cliente.post("/api/missions", json=_corpo(estimated_minutes=0))

    assert resposta.status_code == 422
    erros = resposta.json()["detail"]
    assert ["body", "estimated_minutes"] in [erro["loc"] for erro in erros]
