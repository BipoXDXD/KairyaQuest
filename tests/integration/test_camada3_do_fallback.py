"""Camada 3 do fallback da recusa (pendencia 174): o que a chamada real prova.

Nao da para provocar uma recusa sob demanda sem tentar burlar os
classificadores de seguranca, e isso nao se faz. A chamada real
(`camada3_do_fallback.main`) prova o que da: que a API ACEITA o pedido com
`fallbacks="default"` e o beta, pelo adaptador de producao, numa resposta
normal. Estes testes provam o mesmo caminho contra o falso.
"""

import dataclasses
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from focusquest.modules.tutoring.anthropic_provider import BETA_DO_FALLBACK
from focusquest.modules.tutoring.provider import Delta, Fim
from integration import camada3, camada3_do_fallback
from integration.camada3_do_fallback import Captura
from integration.conftest import TIMEOUT_FOLGADO
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

AGORA = datetime(2026, 9, 30, 15, tzinfo=UTC)
PROPOSTA = {"instructions": "Revisar recursao", "difficulty": 2}


def _capturar(falso: ServidorAnthropicFalso) -> Captura:
    captura, _ = camada3_do_fallback.capturar(
        chave="sk-ant-teste",
        base_url=falso.url,
        modelo="claude-opus-5",
        max_tokens=256,
        timeout_segundos=TIMEOUT_FOLGADO,
        agora=AGORA,
    )
    return captura


def test_a_captura_pede_o_fallback_e_bate_com_a_referencia(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("Bora: ",)), ChamadaDeFerramenta(PROPOSTA)))
    captura = _capturar(falso)
    referencia = json.loads(camada3.REFERENCIA.read_text())["eventos"]

    assert captura.corpo is not None
    assert captura.corpo["fallbacks"] == "default"
    assert BETA_DO_FALLBACK in captura.betas
    assert camada3_do_fallback.problemas(captura) == []
    assert camada3.comparavel(captura.tipos) == camada3.comparavel(referencia)
    assert captura.fim == Fim()


_APROVADA = Captura(
    tipos=["message_start", "message_stop"],
    eventos=[Delta("oi"), Fim()],
    corpo={"fallbacks": "default"},
    betas=[BETA_DO_FALLBACK],
)


@pytest.mark.parametrize(
    ("captura", "esperado"),
    [
        (_APROVADA, []),
        (
            dataclasses.replace(_APROVADA, corpo={}),
            ["o pedido nao levou fallbacks=default"],
        ),
        (
            dataclasses.replace(_APROVADA, corpo=None),
            ["o pedido nao levou fallbacks=default"],
        ),
        (
            dataclasses.replace(_APROVADA, betas=[]),
            [f"o pedido nao declarou o beta {BETA_DO_FALLBACK}"],
        ),
        (
            dataclasses.replace(_APROVADA, eventos=[Delta("oi")]),
            ["o stream terminou sem message_stop"],
        ),
    ],
)
def test_o_veredito_do_fallback(captura: Captura, esperado: list[str]) -> None:
    """O que a chamada real exige para dizer "aprovado"."""
    assert camada3_do_fallback.problemas(captura) == esperado


def test_a_camada3_do_fallback_recusa_o_que_nao_e_a_api_real(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    destino = tmp_path / "referencia.json"
    monkeypatch.setattr(camada3_do_fallback, "REFERENCIA_DO_FALLBACK", destino)
    with pytest.raises(SystemExit, match="so grava a API real"):
        camada3_do_fallback.main()
    assert not destino.exists()
