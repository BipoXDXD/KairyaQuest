"""A traducao das excecoes do SDK e do transporte, sem banco e sem servidor.

Importa o nome privado `_traduzir_erros` de proposito: e o unico ponto da
traducao, e os testes do chat so o exercitam por um caminho (o do servidor
falso), deixando metade de cada `except` sem prova propria.
"""

import anthropic
import httpx2
import pytest

from focusquest.modules.tutoring.anthropic_provider import _traduzir_erros
from focusquest.modules.tutoring.provider import (
    ProvedorIndisponivelError,
    TempoEsgotadoError,
)

_PEDIDO = httpx2.Request("POST", "https://provedor.invalido/v1/messages")


def _resposta(status: int) -> httpx2.Response:
    return httpx2.Response(status, request=_PEDIDO)


CASOS = [
    pytest.param(
        anthropic.APITimeoutError(_PEDIDO),
        TempoEsgotadoError,
        id="sdk-timeout",
    ),
    pytest.param(
        httpx2.ReadTimeout("x"),
        TempoEsgotadoError,
        id="httpx2-timeout-cru",
    ),
    pytest.param(
        anthropic.APIConnectionError(request=_PEDIDO),
        ProvedorIndisponivelError,
        id="sdk-conexao",
    ),
    pytest.param(
        anthropic.InternalServerError("falhou", response=_resposta(500), body=None),
        ProvedorIndisponivelError,
        id="sdk-status-500",
    ),
    pytest.param(
        anthropic.APIError("falhou", _PEDIDO, body=None),
        ProvedorIndisponivelError,
        id="sdk-erro-generico",
    ),
    pytest.param(
        httpx2.ConnectError("x"),
        ProvedorIndisponivelError,
        id="httpx2-transporte-cru",
    ),
]


@pytest.mark.parametrize(("original", "traduzida"), CASOS)
def test_a_excecao_sai_traduzida_com_a_original_como_causa(
    original: Exception, traduzida: type[Exception]
) -> None:
    with pytest.raises(traduzida) as saiu, _traduzir_erros():
        raise original

    # `type is`, e nao `isinstance`: uma classe nao pode passar pela outra.
    assert type(saiu.value) is traduzida
    assert saiu.value.__cause__ is original


def test_excecao_nao_relacionada_atravessa_sem_traducao() -> None:
    original = ValueError("nada a ver com o provedor")

    with pytest.raises(ValueError) as saiu, _traduzir_erros():
        raise original

    assert saiu.value is original
    assert saiu.value.__cause__ is None
