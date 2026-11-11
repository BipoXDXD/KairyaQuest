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


# Os cabecalhos de limite da documentacao "Rate limits" da Anthropic, na ordem
# em que o log os escreve. Portado do log do provedor anterior (PR #72): o
# status sozinho nao diz qual limite estourou nem quando ele volta.
LIMITES_DA_ANTHROPIC = {
    "retry-after": "7",
    "anthropic-ratelimit-requests-limit": "50",
    "anthropic-ratelimit-requests-remaining": "0",
    "anthropic-ratelimit-requests-reset": "2026-11-10T18:00:07Z",
    "anthropic-ratelimit-tokens-limit": "80000",
    "anthropic-ratelimit-tokens-remaining": "0",
    "anthropic-ratelimit-tokens-reset": "2026-11-10T18:00:07Z",
    "anthropic-ratelimit-input-tokens-limit": "40000",
    "anthropic-ratelimit-input-tokens-remaining": "0",
    "anthropic-ratelimit-input-tokens-reset": "2026-11-10T18:00:07Z",
    "anthropic-ratelimit-output-tokens-limit": "8000",
    "anthropic-ratelimit-output-tokens-remaining": "0",
    "anthropic-ratelimit-output-tokens-reset": "2026-11-10T18:00:07Z",
}


def _mensagem_do_log(
    caplog: pytest.LogCaptureFixture,
    cabecalhos: dict[str, str] | list[tuple[str, str]],
) -> str:
    original = anthropic.RateLimitError(
        "mensagem-privada-do-teste",
        response=httpx2.Response(429, headers=cabecalhos, request=PEDIDO),
        body={"message": "evidencia-privada-do-teste"},
    )
    caplog.set_level(logging.WARNING, logger=LOGGER)

    with pytest.raises(ProvedorIndisponivelError), _traduzir_erros():
        raise original

    (registro,) = caplog.records
    assert registro.levelno == logging.WARNING
    assert registro.exc_info is None
    return registro.getMessage()


def test_429_registra_todos_os_limites_na_ordem_e_nada_alem_deles(
    caplog: pytest.LogCaptureFixture,
) -> None:
    fora_da_allowlist = {
        "location": "https://outro.invalido",
        "request-id": "req-privado-do-teste",
        "set-cookie": "cabecalho-privado-do-teste",
        "x-should-retry": "false",
    }
    # Embaralhado de proposito: a ordem do log e a da allowlist.
    cabecalhos = dict(
        reversed(list((LIMITES_DA_ANTHROPIC | fora_da_allowlist).items()))
    )

    mensagem = _mensagem_do_log(caplog, cabecalhos)

    assert mensagem == (
        "Falha HTTP do provedor: status=429 tipo=RateLimitError retry-after=7"
        " anthropic-ratelimit-requests-limit=50"
        " anthropic-ratelimit-requests-remaining=0"
        " anthropic-ratelimit-requests-reset=2026-11-10T18:00:07Z"
        " anthropic-ratelimit-tokens-limit=80000"
        " anthropic-ratelimit-tokens-remaining=0"
        " anthropic-ratelimit-tokens-reset=2026-11-10T18:00:07Z"
        " anthropic-ratelimit-input-tokens-limit=40000"
        " anthropic-ratelimit-input-tokens-remaining=0"
        " anthropic-ratelimit-input-tokens-reset=2026-11-10T18:00:07Z"
        " anthropic-ratelimit-output-tokens-limit=8000"
        " anthropic-ratelimit-output-tokens-remaining=0"
        " anthropic-ratelimit-output-tokens-reset=2026-11-10T18:00:07Z"
    )
    for privado in (*PRIVADOS, "outro.invalido", "req-privado-do-teste"):
        assert privado not in caplog.text


@pytest.mark.parametrize(
    ("bruto", "saneado"),
    [
        ("1 status=200", "1?status?200"),
        ("1\tx", "1?x"),
        ("1\x1b[2J", "1??2J"),
        ("1\r\nCRITICAL forjado", "1??CRITICAL?forjado"),
    ],
)
def test_valor_de_limite_hostil_sai_saneado_numa_linha(
    caplog: pytest.LogCaptureFixture, bruto: str, saneado: str
) -> None:
    mensagem = _mensagem_do_log(caplog, [("retry-after", bruto)])

    assert mensagem == (
        f"Falha HTTP do provedor: status=429 tipo=RateLimitError retry-after={saneado}"
    )
    assert "\n" not in mensagem
    assert "\r" not in mensagem


def test_valor_de_limite_longo_e_cortado_em_64(
    caplog: pytest.LogCaptureFixture,
) -> None:
    mensagem = _mensagem_do_log(caplog, {"anthropic-ratelimit-tokens-reset": "9" * 200})

    assert mensagem == (
        "Falha HTTP do provedor: status=429 tipo=RateLimitError"
        " anthropic-ratelimit-tokens-reset=" + "9" * 64
    )
