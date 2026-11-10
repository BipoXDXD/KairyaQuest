"""A confirmacao pela Kairya fora dos limites da avulsa (pendencia 26), sem banco.

O servico grava a falha na acao com o `code` do limite e devolve `ForaDoLimite`;
a rota commita e so entao traduz em 422 com o MESMO `code`, como o
`PrazoExpirado`. Aqui a rota e provada com o servico substituido; o servico,
com banco, esta em `tests/integration/test_tutoring_acoes.py` e
`tests/integration/test_tutoring_reagendamento.py`.
"""

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from focusquest.core.clock import get_clock
from focusquest.core.database import get_session
from focusquest.main import CodigoDeErro, app
from focusquest.modules.tutoring import router as tutoring_router
from focusquest.modules.tutoring.domain import (
    ESTIMATIVA_FORA_DO_LIMITE,
    PRAZO_FORA_DO_LIMITE,
    EstadoDaAcao,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction
from focusquest.modules.tutoring.service import ForaDoLimite

AGORA = datetime(2026, 11, 10, 15, 0, tzinfo=UTC)


class _SessaoQueSoCommita:
    """A rota so pode commitar: a falha ja veio gravada pelo servico."""

    def __init__(self) -> None:
        self.commits = 0

    def commit(self) -> None:
        self.commits += 1


def _acao_falhou(codigo: str) -> TutorAction:
    return TutorAction(
        id=9,
        message_id=1,
        kind=TipoDeAcao.CRIAR_MISSAO,
        payload={},
        state=EstadoDaAcao.FALHOU,
        error_code=codigo,
        operation_id="op-1",
        created_at=AGORA,
        decided_at=AGORA,
    )


@pytest.fixture
def sessao() -> Iterator[_SessaoQueSoCommita]:
    falsa = _SessaoQueSoCommita()
    sobrepostos: dict[Any, Any] = {
        get_session: lambda: falsa,
        get_clock: lambda: lambda: AGORA,
    }
    app.dependency_overrides.update(sobrepostos)
    try:
        yield falsa
    finally:
        for chave in sobrepostos:
            app.dependency_overrides.pop(chave, None)


@pytest.mark.parametrize(
    ("codigo", "trecho"),
    [(ESTIMATIVA_FORA_DO_LIMITE, "1440"), (PRAZO_FORA_DO_LIMITE, "365")],
)
def test_fora_do_limite_e_422_com_o_code_depois_do_commit(
    sessao: _SessaoQueSoCommita,
    monkeypatch: pytest.MonkeyPatch,
    codigo: str,
    trecho: str,
) -> None:
    acao = _acao_falhou(codigo)

    def confirmar_falso(*_args: Any, **_kwargs: Any) -> ForaDoLimite:
        return ForaDoLimite(acao, codigo)

    monkeypatch.setattr(tutoring_router, "confirmar_acao", confirmar_falso)
    with TestClient(app) as cliente:
        resposta = cliente.post(
            "/api/tutoring/actions/9/confirm", json={"operation_id": "op-1"}
        )

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["code"] == codigo
    assert trecho in corpo["detail"]
    # A falha gravada sobrevive: o commit vem antes do 422.
    assert sessao.commits == 1


def test_os_codes_da_acao_sao_os_do_http() -> None:
    """O `error_code` gravado na acao e o `code` do 422 sao a mesma string: a
    tela mostra o mesmo texto antes e depois de recarregar."""
    assert CodigoDeErro.ESTIMATIVA_FORA_DO_LIMITE.value == ESTIMATIVA_FORA_DO_LIMITE
    assert CodigoDeErro.PRAZO_FORA_DO_LIMITE.value == PRAZO_FORA_DO_LIMITE
