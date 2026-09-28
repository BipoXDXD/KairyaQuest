"""O provedor avalia: chamada com a ferramenta forcada, contra o falso."""

import pytest

from focusquest.modules.tutoring.provider import (
    Ferramenta,
    MensagemDoTurno,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)
from focusquest.modules.tutoring.service import Tutoria
from integration.conftest import TIMEOUT_DE_TESTE
from integration.provedor_falso import (
    APOS_O_PRIMEIRO_PEDACO,
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


def test_avaliar_forca_a_ferramenta_na_requisicao(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    falso.roteiro = Roteiro(
        blocos=(ChamadaDeFerramenta({"verdict": "atende"}, nome="record_evaluation"),)
    )
    tutoria.provedor.avaliar(TURNO, FERRAMENTA)
    corpo = falso.recebidas[-1].corpo
    assert corpo["tool_choice"] == {
        "type": "tool",
        "name": "record_evaluation",
        "disable_parallel_tool_use": True,
    }
    assert [t["name"] for t in corpo["tools"]] == ["record_evaluation"]
    assert "thinking" not in corpo


def test_avaliar_sem_chamar_a_ferramenta_e_none(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
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


def test_avaliar_com_erro_http_e_provedor_indisponivel(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    falso.roteiro = Roteiro(status_http=500)
    with pytest.raises(ProvedorIndisponivelError):
        tutoria.provedor.avaliar(TURNO, FERRAMENTA)


def test_avaliar_com_demora_e_tempo_esgotado(
    falso: ServidorAnthropicFalso, tutoria: Tutoria
) -> None:
    falso.roteiro = Roteiro(atrasar_cabecalhos=TIMEOUT_DE_TESTE * 3)
    with pytest.raises(TempoEsgotadoError):
        tutoria.provedor.avaliar(TURNO, FERRAMENTA)
