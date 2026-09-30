"""O servidor falso fala o formato que o SDK FIXADO entende (camada 2).

A camada 1 e estrutural: cada evento do falso e um objeto do proprio SDK,
conferido pelo mypy. Esta e a camada 2: o SDK real consome o stream do falso
e monta a `Message` final. Se a versao do `anthropic` no `uv.lock` mudar e
deixar de entender o falso, este arquivo reprova no gate -- antes de a tela
quebrar em silencio.
"""

import anthropic
import pytest

from integration.provedor_falso import (
    ChamadaDeFerramenta,
    MotivoDeParada,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

ENTRADA = {"instructions": "Ler o capitulo 3", "difficulty": 2}


def _cliente(falso: ServidorAnthropicFalso) -> anthropic.Anthropic:
    return anthropic.Anthropic(
        api_key="sk-ant-teste", base_url=falso.url, max_retries=0
    )


def test_o_sdk_monta_texto_e_tool_use_do_stream_do_falso(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = Roteiro(
        blocos=(Texto(("Bora, ", "vamos estudar!")), ChamadaDeFerramenta(ENTRADA))
    )
    with _cliente(falso).messages.stream(
        model="claude-opus-5",
        max_tokens=100,
        messages=[{"role": "user", "content": "oi"}],
    ) as stream:
        final = stream.get_final_message()

    assert final.stop_reason == "tool_use"
    # O falso padrao emite o bloco de thinking da API real na frente (1b-2).
    pensamento, texto, ferramenta = final.content
    assert pensamento.type == "thinking"
    assert texto.type == "text"
    assert texto.text == "Bora, vamos estudar!"
    assert ferramenta.type == "tool_use"
    assert ferramenta.name == "create_mission"
    assert ferramenta.input == ENTRADA


def test_sem_ferramenta_a_resposta_termina_em_end_turn(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("So conversa.",)),))
    with _cliente(falso).messages.stream(
        model="claude-opus-5",
        max_tokens=100,
        messages=[{"role": "user", "content": "oi"}],
    ) as stream:
        final = stream.get_final_message()
    assert final.stop_reason == "end_turn"
    # O falso padrao emite o bloco de thinking da API real na frente (1b-2).
    assert [bloco.type for bloco in final.content] == ["thinking", "text"]


@pytest.mark.parametrize(
    "stop_reason", ["max_tokens", "model_context_window_exceeded", "refusal"]
)
def test_o_roteiro_escolhe_o_motivo_de_parada(
    falso: ServidorAnthropicFalso, stop_reason: MotivoDeParada
) -> None:
    """`stop_reason` explicito vence o derivado (com ferramenta seria `tool_use`).

    Os tres sao as paradas que a conversa trata (pendencias 45 e 120): o SDK
    fixado as entrega como vieram, sem erro, e o `message_stop` chega igual."""
    falso.roteiro = Roteiro(
        blocos=(ChamadaDeFerramenta(ENTRADA),), stop_reason=stop_reason
    )
    with _cliente(falso).messages.stream(
        model="claude-opus-5",
        max_tokens=100,
        messages=[{"role": "user", "content": "oi"}],
    ) as stream:
        final = stream.get_final_message()
    assert final.stop_reason == stop_reason


def test_o_falso_registra_corpo_e_cabecalhos(falso: ServidorAnthropicFalso) -> None:
    """E o contador que prova, em outros testes, que um reenvio nao chamou o
    modelo -- e o registro que prova QUAL chave foi usada."""
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    with _cliente(falso).messages.stream(
        model="claude-opus-5",
        max_tokens=7,
        messages=[{"role": "user", "content": "oi"}],
    ) as stream:
        stream.get_final_message()
    assert len(falso.recebidas) == 1
    assert falso.recebidas[0].corpo["max_tokens"] == 7
    assert falso.recebidas[0].cabecalhos["x-api-key"] == "sk-ant-teste"


def test_status_de_erro_vira_o_erro_do_sdk(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(status_http=500)
    with (
        pytest.raises(anthropic.InternalServerError),
        _cliente(falso).messages.stream(
            model="claude-opus-5",
            max_tokens=7,
            messages=[{"role": "user", "content": "oi"}],
        ) as stream,
    ):
        stream.get_final_message()
