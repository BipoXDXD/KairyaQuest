"""Camada 3 da AVALIACAO (pendencia 91): o falso emite a sequencia de tipos de
evento que a API real emitiu para uma chamada de `avaliar` com a
`FERRAMENTA_DA_AVALIACAO` real (`tool_choice` auto, `strict`).

A referencia e gravada so pela chamada real (`camada3_da_avaliacao.main`),
nunca a mao nem pelo gate; o arquivo nao tem conteudo, so nomes de evento.
"""

import json
import re
from pathlib import Path

import pytest

from focusquest.core.idioma import Idioma
from focusquest.modules.evaluation.rubric import (
    FERRAMENTA_DA_AVALIACAO,
    NOME_DA_FERRAMENTA,
    rubrica_do_idioma,
)
from integration import camada3, camada3_da_avaliacao
from integration.conftest import TIMEOUT_FOLGADO
from integration.espiao import provedor_espionado
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
)

SAIDA_VALIDA = {"verdict": "atende", "feedback": "A evidencia mostra o criterio."}


def test_a_referencia_da_avaliacao_nao_tem_conteudo() -> None:
    referencia = json.loads(camada3_da_avaliacao.REFERENCIA.read_text())
    assert set(referencia) == {"capturada_em", "sdk", "modelo", "eventos"}
    for tipo in referencia["eventos"]:
        assert re.fullmatch(r"[a-z_]+(:[a-z_]+)?", tipo), tipo
    # A avaliacao so vale com a ferramenta chamada: e o que a camada compara.
    assert "content_block_start:tool_use" in referencia["eventos"]
    assert "feedback" not in camada3_da_avaliacao.REFERENCIA.read_text()


def test_o_falso_emite_a_sequencia_da_avaliacao_real(
    falso: ServidorAnthropicFalso,
) -> None:
    """Mesma funcao de captura da chamada real, contra o falso, pelo
    `ProvedorAnthropic.avaliar` de producao."""
    falso.roteiro = Roteiro(
        blocos=(ChamadaDeFerramenta(SAIDA_VALIDA, nome=NOME_DA_FERRAMENTA),)
    )
    provedor, espiao = provedor_espionado(
        chave="sk-ant-teste",
        base_url=falso.url,
        modelo="claude-opus-5",
        max_tokens=256,
        timeout_segundos=TIMEOUT_FOLGADO,
        fallback=True,
        esforco="low",
        esforco_da_avaliacao="medium",
    )
    tipos, entrada = camada3_da_avaliacao.capturar(provedor, espiao)
    referencia = json.loads(camada3_da_avaliacao.REFERENCIA.read_text())["eventos"]

    assert entrada == SAIDA_VALIDA
    assert camada3.comparavel(tipos) == camada3.comparavel(referencia)


def test_a_captura_pede_a_ferramenta_real_da_avaliacao(
    falso: ServidorAnthropicFalso,
) -> None:
    """O que a chamada real mede so vale se a requisicao for a de producao: a
    `FERRAMENTA_DA_AVALIACAO` estrita, `tool_choice` auto e o turno montado
    da `Tentativa` pelo `montar_turno_da_avaliacao`."""
    falso.roteiro = Roteiro(
        blocos=(ChamadaDeFerramenta(SAIDA_VALIDA, nome=NOME_DA_FERRAMENTA),)
    )
    provedor, espiao = provedor_espionado(
        chave="sk-ant-teste",
        base_url=falso.url,
        modelo="claude-opus-5",
        max_tokens=256,
        timeout_segundos=TIMEOUT_FOLGADO,
        fallback=True,
        esforco="low",
        esforco_da_avaliacao="medium",
    )
    camada3_da_avaliacao.capturar(provedor, espiao)
    corpo = falso.recebidas[-1].corpo
    assert [t["name"] for t in corpo["tools"]] == [NOME_DA_FERRAMENTA]
    assert corpo["tools"][0]["strict"] is True
    assert corpo["tools"][0]["input_schema"] == FERRAMENTA_DA_AVALIACAO.esquema
    assert corpo["tool_choice"] == {"type": "auto", "disable_parallel_tool_use": True}
    # A captura mede o prompt de producao em pt-BR, o idioma padrao.
    assert corpo["system"] == rubrica_do_idioma(Idioma.PT_BR)
    dados = json.loads(corpo["messages"][0]["content"])
    assert dados["mission"]["completion_criterion"] == (
        camada3_da_avaliacao.TENTATIVA.completion_criterion
    )
    assert dados["evidence"]["text"] == camada3_da_avaliacao.TENTATIVA.evidence_text
    # Uma chamada so: sem tentativas do SDK, a conta das chamadas reais e exata.
    assert len(falso.recebidas) == 1


def test_a_captura_da_avaliacao_recusa_gravar_o_que_nao_e_a_api_real(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """A guarda de `camada3.main`: gravar contra o falso faria a camada comparar
    o falso com ele mesmo. (Na suite, `tests/conftest.py` aponta para
    127.0.0.1:9.)"""
    destino = tmp_path / "referencia.json"
    monkeypatch.setattr(camada3_da_avaliacao, "REFERENCIA", destino)
    with pytest.raises(SystemExit, match="so grava a API real"):
        camada3_da_avaliacao.main()
    assert not destino.exists()
