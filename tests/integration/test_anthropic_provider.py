"""O adaptador de producao, inteiro, contra o servidor falso."""

from typing import Any

import pytest

from focusquest.modules.tutoring.anthropic_provider import (
    TENTATIVAS,
    ProvedorAnthropic,
)
from focusquest.modules.tutoring.provider import (
    Delta,
    EventoDoProvedor,
    Fim,
    MensagemDoTurno,
    Proposta,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

TURNO = Turno(sistema="SISTEMA", mensagens=(MensagemDoTurno("user", "oi"),))
ENTRADA: dict[str, Any] = {"instructions": "Ler", "difficulty": 2}
# Pequeno o bastante para os testes de demora levarem menos de um segundo.
TIMEOUT = 0.3


def _provedor(
    falso: ServidorAnthropicFalso, chave: str = "sk-ant-teste"
) -> ProvedorAnthropic:
    return ProvedorAnthropic(
        chave=chave,
        base_url=falso.url,
        modelo="claude-opus-5",
        max_tokens=256,
        timeout_segundos=TIMEOUT,
    )


def _todos(falso: ServidorAnthropicFalso) -> list[EventoDoProvedor]:
    return list(_provedor(falso).responder(TURNO))


def test_texto_em_pedacos_e_fim(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("Bora, ", "estudar!")),))
    assert _todos(falso) == [Delta("Bora, "), Delta("estudar!"), Fim()]


def test_a_ferramenta_vira_proposta_antes_do_fim(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("Toma:",)), ChamadaDeFerramenta(ENTRADA)))
    assert _todos(falso) == [Delta("Toma:"), Proposta(ENTRADA), Fim()]


def test_a_requisicao_leva_o_que_a_spec_manda(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    _todos(falso)
    corpo = falso.recebidas[0].corpo
    assert corpo["model"] == "claude-opus-5"
    assert corpo["max_tokens"] == 256
    assert corpo["system"] == "SISTEMA"
    assert corpo["messages"] == [{"role": "user", "content": "oi"}]
    assert corpo["tool_choice"] == {"type": "auto", "disable_parallel_tool_use": True}
    (ferramenta,) = corpo["tools"]
    assert ferramenta["name"] == "create_mission"
    esquema = ferramenta["input_schema"]
    # A docstring de manutencao do MissionCreate nao vai para o modelo (M8).
    assert "description" not in esquema
    assert "title" not in esquema
    assert set(esquema["required"]) == {
        "instructions",
        "completion_criterion",
        "difficulty",
        "estimated_minutes",
        "deadline",
    }
    # O raciocinio interno nao e pedido (README s6).
    assert "thinking" not in corpo


def test_a_chave_e_a_passada_explicitamente(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    list(_provedor(falso, chave="sk-ant-explicita").responder(TURNO))
    assert falso.recebidas[0].cabecalhos["x-api-key"] == "sk-ant-explicita"


def test_stream_cortado_termina_sem_fim_e_sem_erro(
    falso: ServidorAnthropicFalso,
) -> None:
    """Documenta a medicao M3: o SDK nao denuncia o corte. Quem trata a falta
    do `Fim` e o servico."""
    falso.roteiro = Roteiro(blocos=(Texto(("meio", "resto")),), cortar_apos_eventos=3)
    assert _todos(falso) == [Delta("meio")]


def test_demora_no_meio_vira_tempo_esgotado(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(
        blocos=(Texto(("meio", "resto")),), atrasar_evento=(3, TIMEOUT * 4)
    )
    eventos: list[EventoDoProvedor] = []
    with pytest.raises(TempoEsgotadoError):
        for evento in _provedor(falso).responder(TURNO):
            eventos.append(evento)
    assert eventos == [Delta("meio")]


def test_demora_antes_de_responder_vira_tempo_esgotado_depois_das_tentativas(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = Roteiro(atrasar_cabecalhos=TIMEOUT * 4)
    with pytest.raises(TempoEsgotadoError):
        _todos(falso)
    assert len(falso.recebidas) == 1 + TENTATIVAS


def test_erro_do_servidor_vira_indisponivel_depois_das_tentativas(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = Roteiro(status_http=500)
    with pytest.raises(ProvedorIndisponivelError):
        _todos(falso)
    assert len(falso.recebidas) == 1 + TENTATIVAS


def test_chave_recusada_vira_indisponivel_sem_nova_tentativa(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = Roteiro(status_http=401)
    with pytest.raises(ProvedorIndisponivelError):
        _todos(falso)
    assert len(falso.recebidas) == 1


def test_provedor_fora_do_ar_vira_indisponivel() -> None:
    """Nenhum servidor escutando: erro de conexao, e nao de status."""
    provedor = ProvedorAnthropic(
        chave="sk-ant-teste",
        base_url="http://127.0.0.1:9",
        modelo="claude-opus-5",
        max_tokens=8,
        timeout_segundos=TIMEOUT,
    )
    with pytest.raises(ProvedorIndisponivelError):
        list(provedor.responder(TURNO))
