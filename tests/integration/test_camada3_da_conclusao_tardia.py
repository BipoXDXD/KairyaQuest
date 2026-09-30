"""Camada 3 da conclusao tardia no contexto (pendencia 180): o cenario da
diaria de ontem em andamento pelo `ProvedorAnthropic.responder` de producao.

A chamada real (`camada3_da_conclusao_tardia.main`) mede que o modelo, com a
diaria de ontem na secao de conclusao tardia e uma avulsa pendente com `#id`
no contexto, NAO propoe `reschedule_mission` quando a pessoa pede para adiar a
diaria; estes testes provam o mesmo caminho contra o falso.
"""

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from focusquest.modules.tutoring.domain import TipoDeAcao
from focusquest.modules.tutoring.provider import Proposta
from integration import camada3, camada3_da_conclusao_tardia
from integration.conftest import TIMEOUT_DE_TESTE
from integration.espiao import provedor_espionado
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

# Quinta, 01/10/2026, 12:00 em Sao Paulo: a diaria de ontem (quarta) venceu a
# meia-noite e pode ser concluida ate a meia-noite de sexta.
AGORA = datetime(2026, 10, 1, 15, tzinfo=UTC)


def _capturar(
    falso: ServidorAnthropicFalso,
) -> tuple[list[str], list[Proposta], str]:
    provedor, espiao = provedor_espionado(
        chave="sk-ant-teste",
        base_url=falso.url,
        modelo="claude-opus-5",
        max_tokens=256,
        timeout_segundos=TIMEOUT_DE_TESTE,
        fallback=True,
    )
    return camada3_da_conclusao_tardia.capturar(provedor, espiao, agora=AGORA)


def test_o_contexto_traz_a_diaria_de_ontem_tardia_e_a_avulsa_pelo_id(
    falso: ServidorAnthropicFalso,
) -> None:
    """Sem a secao da conclusao tardia, a chamada real mediria outra coisa; sem
    a avulsa com `#id`, o modelo nao teria o que reagendar por engano."""
    falso.roteiro = Roteiro(blocos=(Texto(("Certo.",)),))
    _capturar(falso)
    corpo = falso.recebidas[-1].corpo
    sistema = corpo["system"]
    assert "Missões do ciclo em conclusão tardia" in sistema
    assert (
        "- diária de ontem: Resolver 5 exercícios de laço (em andamento desde "
        "2026-10-01T02:40:00+00:00; pode ser concluída antes de "
        "2026-10-02T03:00:00+00:00, que é 2026-10-02T00:00:00-03:00 em São Paulo)"
    ) in sistema
    assert f"- #{camada3_da_conclusao_tardia.ID_DA_AVULSA}: " in sistema
    assert "diária de ontem" in corpo["messages"][0]["content"]
    assert [t["name"] for t in corpo["tools"]] == [
        TipoDeAcao.CRIAR_MISSAO.value,
        TipoDeAcao.REAGENDAR_MISSAO.value,
    ]
    assert len(falso.recebidas) == 1


def test_a_captura_devolve_o_texto_e_nenhuma_proposta(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("Ainda dá ", "para concluir.")),))
    tipos, propostas, texto = _capturar(falso)

    assert propostas == []
    assert texto == "Ainda dá para concluir."
    assert tipos[-1] == "message_stop"


def test_a_sequencia_sem_ferramenta_e_a_da_referencia_sem_o_bloco_da_ferramenta(
    falso: ServidorAnthropicFalso,
) -> None:
    """A resposta certa aqui e so texto: a comparacao com a referencia da
    conversa tira dela o bloco `tool_use` (inicio, delta e fim)."""
    falso.roteiro = Roteiro(blocos=(Texto(("Ainda dá.",)),))
    tipos, _, _ = _capturar(falso)
    referencia = json.loads(camada3.REFERENCIA.read_text())["eventos"]

    assert camada3_da_conclusao_tardia.sem_bloco_de_ferramenta(
        camada3.comparavel(referencia)
    ) == camada3.comparavel(tipos)


def test_sem_bloco_de_ferramenta_tira_so_o_bloco_da_ferramenta() -> None:
    tipos = [
        "message_start",
        "content_block_start:text",
        "content_block_stop",
        "content_block_start:tool_use",
        "content_block_delta:input_json_delta",
        "content_block_stop",
        "message_stop",
    ]
    assert camada3_da_conclusao_tardia.sem_bloco_de_ferramenta(tipos) == [
        "message_start",
        "content_block_start:text",
        "content_block_stop",
        "message_stop",
    ]


def test_o_reagendamento_proposto_pelo_falso_aparece_na_captura(
    falso: ServidorAnthropicFalso,
) -> None:
    """O veredito so vale se a captura enxergar a proposta quando ela vem."""
    entrada = {
        "mission_id": camada3_da_conclusao_tardia.ID_DA_AVULSA,
        "new_deadline": "2026-10-03T21:00:00Z",
        "reason": "falta_de_tempo",
    }
    falso.roteiro = Roteiro(
        blocos=(
            Texto(("Vou mover.",)),
            ChamadaDeFerramenta(entrada, nome=TipoDeAcao.REAGENDAR_MISSAO.value),
        )
    )
    _, propostas, _ = _capturar(falso)

    assert propostas == [Proposta(TipoDeAcao.REAGENDAR_MISSAO.value, entrada)]


@pytest.mark.parametrize(
    ("propostas", "tipos", "esperado"),
    [
        ([], ["message_start", "message_stop"], None),
        (
            [Proposta("reschedule_mission", {"mission_id": 7})],
            ["message_start", "message_stop"],
            "o modelo propos reschedule_mission",
        ),
        (
            [],
            ["message_start", "message_delta"],
            "o stream terminou sem message_stop",
        ),
    ],
)
def test_o_veredito_da_conclusao_tardia(
    propostas: list[Proposta], tipos: list[str], esperado: str | None
) -> None:
    """O que a chamada real exige para dizer "aprovado"."""
    problema = camada3_da_conclusao_tardia.problema(propostas, tipos)
    if esperado is None:
        assert problema is None
    else:
        assert problema is not None
        assert esperado in problema


def test_a_captura_da_conclusao_tardia_recusa_o_que_nao_e_a_api_real(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    destino = tmp_path / "referencia.json"
    monkeypatch.setattr(camada3, "REFERENCIA", destino)
    with pytest.raises(SystemExit, match="so mede a API real"):
        camada3_da_conclusao_tardia.main()
    assert not destino.exists()
