"""O provedor avalia contra o falso: `tool_choice` auto com
`disable_parallel_tool_use` e a ferramenta em modo `strict` (EM3)."""

import pytest

from focusquest.modules.tutoring.anthropic_provider import MAX_TOKENS_DA_AVALIACAO
from focusquest.modules.tutoring.provider import (
    Ferramenta,
    MensagemDoTurno,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)
from focusquest.modules.tutoring.service import Tutoria
from integration.conftest import TIMEOUT_DA_DEMORA
from integration.provedor_falso import (
    APOS_O_PRIMEIRO_PEDACO,
    EVENTOS_DO_PENSAMENTO,
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

FERRAMENTA = Ferramenta(
    nome="record_evaluation",
    descricao="Registra o veredito.",
    esquema={
        "type": "object",
        "properties": {"verdict": {"type": "string"}},
        "required": ["verdict"],
    },
)
TURNO = Turno(
    sistema="Avalie.", mensagens=(MensagemDoTurno("user", '{"evidence": "x"}'),)
)


def test_avaliar_devolve_a_entrada_da_ferramenta(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    falso.roteiro = Roteiro(
        blocos=(ChamadaDeFerramenta({"verdict": "atende"}, nome="record_evaluation"),)
    )
    assert tutoria.provedor.avaliar(TURNO, FERRAMENTA) == {"verdict": "atende"}


def test_avaliar_pede_a_ferramenta_com_tool_choice_auto_e_strict(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    """EM3: `tool_choice` NAO e forcado (daria 400 em alguns modelos); a
    ferramenta e `strict` e uma chamada so por resposta."""
    falso.roteiro = Roteiro(
        blocos=(ChamadaDeFerramenta({"verdict": "atende"}, nome="record_evaluation"),)
    )
    tutoria.provedor.avaliar(TURNO, FERRAMENTA)
    corpo = falso.recebidas[-1].corpo
    assert corpo["tool_choice"] == {"type": "auto", "disable_parallel_tool_use": True}
    assert [t["name"] for t in corpo["tools"]] == ["record_evaluation"]
    assert corpo["tools"][0]["strict"] is True
    assert "thinking" not in corpo
    # O que o chamador manda e o que chega ao modelo: a rubrica so chega por aqui.
    assert corpo["tools"][0]["name"] == FERRAMENTA.nome
    assert corpo["tools"][0]["input_schema"] == FERRAMENTA.esquema
    assert corpo["system"] == TURNO.sistema
    assert corpo["messages"] == [{"role": "user", "content": '{"evidence": "x"}'}]


def test_avaliar_manda_o_max_tokens_proprio_da_avaliacao(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    """Nao e o `max_tokens` do chat (256 nesta fixture, 1024 em producao)."""
    falso.roteiro = Roteiro(
        blocos=(ChamadaDeFerramenta({"verdict": "atende"}, nome="record_evaluation"),)
    )
    tutoria.provedor.avaliar(TURNO, FERRAMENTA)
    assert falso.recebidas[-1].corpo["max_tokens"] == MAX_TOKENS_DA_AVALIACAO == 2048


def test_avaliar_sem_chamar_a_ferramenta_e_none(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    """Com `tool_choice` auto o modelo PODE so conversar: resposta so de texto
    (`end_turn`, sem `tool_use`) e `None`, nao erro."""
    falso.roteiro = Roteiro(blocos=(Texto(("Nao vou avaliar.",)),))
    assert tutoria.provedor.avaliar(TURNO, FERRAMENTA) is None


def test_avaliar_ignora_chamada_de_outra_ferramenta(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    falso.roteiro = Roteiro(
        blocos=(ChamadaDeFerramenta({"instructions": "x"}, nome="create_mission"),)
    )
    assert tutoria.provedor.avaliar(TURNO, FERRAMENTA) is None


def test_avaliar_com_stream_cortado_e_provedor_indisponivel(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    falso.roteiro = Roteiro(
        blocos=(ChamadaDeFerramenta({"verdict": "atende"}, nome="record_evaluation"),),
        cortar_apos_eventos=APOS_O_PRIMEIRO_PEDACO,
    )
    with pytest.raises(ProvedorIndisponivelError):
        tutoria.provedor.avaliar(TURNO, FERRAMENTA)


def test_avaliar_com_a_ferramenta_completa_mas_sem_message_stop_e_indisponivel(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    """O corte DEPOIS do bloco da ferramenta completo e do `message_delta`, e
    antes do `message_stop`: a entrada esta inteira, mas a API nao terminou a
    resposta, e so `message_stop` prova isso."""
    falso.roteiro = Roteiro(
        blocos=(ChamadaDeFerramenta({"verdict": "atende"}, nome="record_evaluation"),),
        cortar_apos_eventos=EVENTOS_DO_PENSAMENTO + 5,
    )
    with pytest.raises(ProvedorIndisponivelError, match="message_stop"):
        tutoria.provedor.avaliar(TURNO, FERRAMENTA)


def test_avaliar_com_resposta_truncada_por_max_tokens_e_none(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    """`max_tokens` estourado deixa um `input` parcial; devolve-lo como
    dict valido esconderia o truncamento. `None` e o resultado invalido."""
    falso.roteiro = Roteiro(
        blocos=(ChamadaDeFerramenta({"verdict": "atende"}, nome="record_evaluation"),),
        stop_reason="max_tokens",
    )
    assert tutoria.provedor.avaliar(TURNO, FERRAMENTA) is None


def test_avaliar_com_erro_http_e_provedor_indisponivel(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    falso.roteiro = Roteiro(status_http=500)
    with pytest.raises(ProvedorIndisponivelError):
        tutoria.provedor.avaliar(TURNO, FERRAMENTA)


@pytest.mark.parametrize("prazo_do_provedor", [TIMEOUT_DA_DEMORA])
def test_avaliar_com_demora_e_tempo_esgotado(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    falso.roteiro = Roteiro(atrasar_cabecalhos=TIMEOUT_DA_DEMORA * 3)
    with pytest.raises(TempoEsgotadoError):
        tutoria.provedor.avaliar(TURNO, FERRAMENTA)
