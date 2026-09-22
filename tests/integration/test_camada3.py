"""Camada 3 do servidor falso: ele emite a sequencia de TIPOS de evento que a
API real emitiu, gravada uma vez pela chamada real do 1b-2.

As camadas 1 (tipos do SDK) e 2 (o SDK real entende o falso) provam que o
falso e valido PARA O SDK; esta prova que ele se parece com o que a API manda
(`docs/QUALITY.md` §9). O arquivo de referencia nao tem conteudo: so nomes de
evento e de tipo de bloco.
"""

import inspect
import json
import re
from datetime import UTC, datetime
from pathlib import Path

import anthropic
import anthropic._streaming
import pytest

from integration import camada3
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

PROPOSTA = {
    "instructions": "Ler o capitulo 3",
    "completion_criterion": "Resumo entregue",
    "difficulty": 2,
    "estimated_minutes": 30,
    "deadline": "2027-01-10T13:00:00Z",
}


def test_sequencia_de_tipos_guarda_so_nomes_e_colapsa_repeticoes() -> None:
    linhas = [
        "event: message_start",
        'data: {"type":"message_start","message":{"content":[]}}',
        "",
        "event: ping",
        'data: {"type":"ping"}',
        "",
        "event: content_block_start",
        'data: {"type":"content_block_start","index":0,'
        '"content_block":{"type":"text","text":""}}',
        "",
        "event: content_block_delta",
        'data: {"type":"content_block_delta","index":0,'
        '"delta":{"type":"text_delta","text":"SEGREDO"}}',
        "",
        "event: content_block_delta",
        'data: {"type":"content_block_delta","index":0,'
        '"delta":{"type":"text_delta","text":"MAIS"}}',
        "",
        "event: message_stop",
        'data: {"type":"message_stop"}',
    ]
    tipos = camada3.sequencia_de_tipos(linhas)
    assert tipos == [
        "message_start",
        "ping",
        "content_block_start:text",
        "content_block_delta:text_delta",
        "message_stop",
    ]
    assert "SEGREDO" not in json.dumps(tipos)


def test_comparavel_retira_so_o_que_o_sdk_descarta() -> None:
    assert camada3.comparavel(["message_start", "ping", "message_stop"]) == [
        "message_start",
        "message_stop",
    ]


def test_o_sdk_fixado_ainda_descarta_ping() -> None:
    """A retirada do `ping` na comparacao so e honesta enquanto o SDK o
    descartar de fato (medido no 1b-2: `anthropic/_streaming.py`). Se uma versao
    nova passar a entrega-lo, esta guarda reprova e a decisao volta a mesa."""
    fonte = inspect.getsource(anthropic._streaming)
    assert 'if sse.event == "ping":' in fonte
    assert frozenset({"ping"}) == camada3.DESCARTADOS_PELO_SDK


def test_a_referencia_gravada_nao_tem_conteudo() -> None:
    referencia = json.loads(camada3.REFERENCIA.read_text())
    assert set(referencia) == {"capturada_em", "sdk", "modelo", "eventos"}
    # A versao do SDK e so INFORMACAO sobre a fotografia. Mudar o SDK nao
    # reprova aqui: quem acusa um SDK que deixou de entender o falso e a
    # camada 2 (`test_provedor_falso.py`).
    assert isinstance(referencia["sdk"], str)
    for tipo in referencia["eventos"]:
        assert re.fullmatch(r"[a-z_]+(:[a-z_]+)?", tipo), tipo
    # Uma resposta com texto E proposta: e o que a camada 3 precisa comparar.
    assert "content_block_start:text" in referencia["eventos"]
    assert "content_block_start:tool_use" in referencia["eventos"]


def test_o_falso_emite_a_sequencia_da_api_real(falso: ServidorAnthropicFalso) -> None:
    """A camada 3. Mesma funcao de captura da chamada real, contra o falso."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Bora, ", "vamos estudar!")), ChamadaDeFerramenta(PROPOSTA))
    )
    cliente = anthropic.Anthropic(
        api_key="sk-ant-teste", base_url=falso.url, max_retries=0
    )
    do_falso = camada3.capturar(
        cliente,
        modelo="claude-opus-5",
        max_tokens=100,
        agora=datetime(2026, 9, 22, tzinfo=UTC),
    )
    referencia = json.loads(camada3.REFERENCIA.read_text())["eventos"]

    assert camada3.comparavel(do_falso) == camada3.comparavel(referencia)


def test_a_captura_recusa_gravar_o_que_nao_e_a_api_real(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Sem esta guarda, "gravar" a referencia com o `.env` apontado para o falso
    produziria uma camada 3 que compara o falso com ele mesmo -- e sempre passa.
    (Na suite, a guarda de `tests/conftest.py` ja aponta para 127.0.0.1:9.)"""
    destino = tmp_path / "referencia.json"
    monkeypatch.setattr(camada3, "REFERENCIA", destino)
    with pytest.raises(SystemExit, match="so grava a API real"):
        camada3.main()
    assert not destino.exists()
