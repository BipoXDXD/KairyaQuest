"""Diagnostico HTTP interno sem registrar a requisicao ou a evidencia (100)."""

import logging

import anthropic
import httpx2
import pytest

from focusquest.modules.tutoring.anthropic_provider import _traduzir_erros
from focusquest.modules.tutoring.provider import (
    ProvedorIndisponivelError,
    TempoEsgotadoError,
)

LOGGER = "focusquest.modules.tutoring.anthropic_provider"
PRIVADOS = (
    "cabecalho-privado-do-teste",
    "evidencia-privada-do-teste",
    "rota-privada-do-teste",
    "mensagem-privada-do-teste",
)
PEDIDO = httpx2.Request(
    "POST",
    "https://provedor.invalido/rota-privada-do-teste",
    headers={"Authorization": "cabecalho-privado-do-teste"},
    content="evidencia-privada-do-teste",
)


@pytest.mark.parametrize(
    ("status", "classe", "nome"),
    [
        (400, anthropic.BadRequestError, "BadRequestError"),
        (401, anthropic.AuthenticationError, "AuthenticationError"),
        (403, anthropic.PermissionDeniedError, "PermissionDeniedError"),
        (404, anthropic.NotFoundError, "NotFoundError"),
        (429, anthropic.RateLimitError, "RateLimitError"),
        (500, anthropic.InternalServerError, "InternalServerError"),
        (424, anthropic.APIStatusError, "APIStatusError"),
    ],
)
def test_falha_http_identifica_status_e_tipo_sem_dados_privados(
    caplog: pytest.LogCaptureFixture,
    status: int,
    classe: type[anthropic.APIStatusError],
    nome: str,
) -> None:
    """Sem log, status errado ou corpo/traceback no log, o teste reprova."""
    original = classe(
        "mensagem-privada-do-teste",
        response=httpx2.Response(status, request=PEDIDO),
        body={"message": "evidencia-privada-do-teste"},
    )
    caplog.set_level(logging.WARNING, logger=LOGGER)

    with pytest.raises(ProvedorIndisponivelError) as saiu, _traduzir_erros():
        raise original

    assert type(saiu.value) is ProvedorIndisponivelError
    assert saiu.value.__cause__ is original
    (registro,) = caplog.records
    assert registro.name == LOGGER
    assert registro.levelno == logging.WARNING
    mensagem = registro.getMessage()
    assert mensagem == f"Falha HTTP do provedor: status={status} tipo={nome}"
    assert registro.exc_info is None
    assert registro.stack_info is None
    for privado in PRIVADOS:
        assert privado not in caplog.text


@pytest.mark.parametrize(
    ("original", "traduzida"),
    [
        (anthropic.APITimeoutError(PEDIDO), TempoEsgotadoError),
        (httpx2.ReadTimeout("mensagem-privada-do-teste"), TempoEsgotadoError),
        (anthropic.APIConnectionError(request=PEDIDO), ProvedorIndisponivelError),
        (
            anthropic.APIError("mensagem-privada-do-teste", PEDIDO, body=None),
            ProvedorIndisponivelError,
        ),
        (
            httpx2.ConnectError("mensagem-privada-do-teste"),
            ProvedorIndisponivelError,
        ),
    ],
)
def test_falha_sem_resposta_http_preserva_traducao_sem_inventar_status(
    caplog: pytest.LogCaptureFixture,
    original: Exception,
    traduzida: type[Exception],
) -> None:
    caplog.set_level(logging.WARNING, logger=LOGGER)

    with pytest.raises(traduzida) as saiu, _traduzir_erros():
        raise original

    assert type(saiu.value) is traduzida
    assert saiu.value.__cause__ is original
    assert caplog.records == []
