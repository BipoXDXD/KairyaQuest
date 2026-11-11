"""O pedido que o adaptador monta para a API, capturado num cliente falso.

Os testes de comportamento do stream (texto, proposta, recusa, demora) estao
em `tests/integration/test_anthropic_provider.py`, contra o servidor falso.
Aqui so o CONTEUDO do pedido: o que os modelos 5.x recusam com 400, o esforco
e o prefixo cacheado.
"""

import dataclasses
import json
from typing import Any

import pytest
from anthropic import omit

from focusquest.core.idioma import Idioma
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.persona import persona_do_idioma
from focusquest.modules.tutoring.provider import MensagemDoTurno, Turno
from unit.anthropic_falso import (
    FERRAMENTA,
    TURNO,
    ClienteFalso,
    instalar_cliente_falso,
)


@pytest.fixture
def cliente_falso(monkeypatch: pytest.MonkeyPatch) -> list[ClienteFalso]:
    return instalar_cliente_falso(monkeypatch)


def _provedor(*, fallback: bool = True) -> ProvedorAnthropic:
    return ProvedorAnthropic(
        chave="sk-ant-ficticia",
        base_url="http://127.0.0.1:9",
        modelo="claude-sonnet-5-5",
        max_tokens=256,
        timeout_segundos=1,
        fallback=fallback,
        esforco="low",
        esforco_da_avaliacao="medium",
    )


def _pedido_do_chat(criados: list[ClienteFalso]) -> dict[str, Any]:
    list(_provedor().responder(TURNO))
    (pedido,) = criados[0].pedidos
    return pedido


@pytest.mark.parametrize(
    ("fallback", "fallbacks", "betas"),
    [
        pytest.param(True, "default", ["server-side-fallback-2026-07-01"], id="ligado"),
        pytest.param(False, omit, omit, id="desligado"),
    ],
)
def test_o_fallback_da_recusa_controla_fallbacks_e_beta(
    cliente_falso: list[ClienteFalso], fallback: bool, fallbacks: Any, betas: Any
) -> None:
    """Ligado, pede o fallback padrao com o beta de data exata; desligado, a
    chamada sai sem os dois (ausentes ou `omit`, que o SDK nao envia)."""
    list(_provedor(fallback=fallback).responder(TURNO))
    (kwargs,) = cliente_falso[0].pedidos
    assert kwargs.get("fallbacks", omit) == fallbacks
    assert kwargs.get("betas", omit) == betas


def _pedido_da_avaliacao(criados: list[ClienteFalso]) -> dict[str, Any]:
    _provedor().avaliar(TURNO, FERRAMENTA)
    (pedido,) = criados[0].pedidos
    return pedido


@pytest.mark.parametrize("pedido_de", [_pedido_do_chat, _pedido_da_avaliacao])
def test_pedido_ao_modelo_nao_envia_parametros_recusados_nos_5x(
    cliente_falso: list[ClienteFalso], pedido_de: Any
) -> None:
    kwargs = pedido_de(cliente_falso)
    assert {"temperature", "top_p", "top_k"}.isdisjoint(kwargs)
    assert "budget_tokens" not in json.dumps(kwargs.get("thinking", {}))


@pytest.mark.parametrize(
    ("pedido_de", "esperado"),
    [(_pedido_do_chat, "low"), (_pedido_da_avaliacao, "medium")],
)
def test_pedido_envia_esforco_configurado(
    cliente_falso: list[ClienteFalso], pedido_de: Any, esperado: str
) -> None:
    kwargs = pedido_de(cliente_falso)
    assert kwargs["output_config"]["effort"] == esperado


def test_o_modelo_do_pedido_e_o_configurado(cliente_falso: list[ClienteFalso]) -> None:
    assert _pedido_do_chat(cliente_falso)["model"] == "claude-sonnet-5-5"
    assert _provedor().modelo == "claude-sonnet-5-5"


# --- Cache do prefixo estatico (Tarefa 1.2) ---------------------------------

_CACHE = {"type": "ephemeral"}


def test_a_ultima_ferramenta_marca_o_fim_do_prefixo_cacheado(
    cliente_falso: list[ClienteFalso],
) -> None:
    ferramentas = _pedido_do_chat(cliente_falso)["tools"]
    assert ferramentas[-1]["cache_control"] == _CACHE
    assert all("cache_control" not in f for f in ferramentas[:-1])


@pytest.mark.parametrize("idioma", list(Idioma))
def test_a_persona_do_idioma_e_o_ultimo_bloco_cacheado_do_sistema(
    cliente_falso: list[ClienteFalso], idioma: Idioma
) -> None:
    """Cada idioma tem o seu prefixo cacheado: a persona inteira do idioma,
    sozinha e por ultimo no bloco com `cache_control`. Nada que varia (nem o
    idioma escrito a parte) vem antes dela."""
    turno = dataclasses.replace(TURNO, sistema=persona_do_idioma(idioma))
    list(_provedor().responder(turno))
    (pedido,) = cliente_falso[0].pedidos
    persona, contexto = pedido["system"]
    assert persona == {
        "type": "text",
        "text": persona_do_idioma(idioma),
        "cache_control": _CACHE,
    }
    # O contexto do turno muda a cada pergunta: vem DEPOIS do ponto de cache.
    assert contexto == {"type": "text", "text": "CONTEXTO DO TURNO"}


def test_o_historico_fica_fora_do_prefixo_cacheado(
    cliente_falso: list[ClienteFalso],
) -> None:
    kwargs = _pedido_do_chat(cliente_falso)
    assert "cache_control" not in kwargs
    assert "cache_control" not in json.dumps(kwargs["messages"])
    assert [m["content"] for m in kwargs["messages"]] == [
        "oi",
        "ola",
        "bora estudar",
    ]


def test_sem_contexto_o_sistema_e_so_a_persona_cacheada(
    cliente_falso: list[ClienteFalso],
) -> None:
    persona = persona_do_idioma(Idioma.EN)
    list(_provedor().responder(Turno(persona, (MensagemDoTurno("user", "oi"),))))
    (pedido,) = cliente_falso[0].pedidos
    assert pedido["system"] == [
        {"type": "text", "text": persona, "cache_control": _CACHE}
    ]
