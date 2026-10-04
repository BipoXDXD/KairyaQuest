"""O servidor falso fala o formato que o SDK FIXADO entende (camada 2).

A camada 1 e estrutural: cada evento do falso e um objeto do proprio SDK,
conferido pelo mypy. Esta e a camada 2: o SDK real consome o stream do falso
e monta a `Message` final. Se a versao do `anthropic` no `uv.lock` mudar e
deixar de entender o falso, este arquivo reprova no gate -- antes de a tela
quebrar em silencio.
"""

import json
import urllib.request

import anthropic
import pytest
from anthropic.types.beta import (
    BetaFallbackBlock,
    BetaFallbackMessageIterationUsage,
    BetaMessageIterationUsage,
    BetaRawContentBlockStartEvent,
    BetaRawMessageDeltaEvent,
    BetaRawMessageStartEvent,
    BetaRawMessageStreamEvent,
)

from integration.provedor_falso import (
    MODELO_DO_FALSO,
    ChamadaDeFerramenta,
    MotivoDeParada,
    Roteiro,
    ServidorAnthropicFalso,
    Substituicao,
    Texto,
    eventos_do_roteiro,
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


# ---------------------------------------------------------------------------
# A troca de modelo depois de uma recusa (fallback do servidor, pendencia 174)
# ---------------------------------------------------------------------------

SUBSTITUTO = "claude-opus-4-8"


def _inicio(eventos: list[BetaRawMessageStreamEvent]) -> BetaRawMessageStartEvent:
    primeiro = eventos[0]
    assert isinstance(primeiro, BetaRawMessageStartEvent)
    return primeiro


def _aberturas(
    eventos: list[BetaRawMessageStreamEvent],
) -> list[BetaRawContentBlockStartEvent]:
    return [e for e in eventos if isinstance(e, BetaRawContentBlockStartEvent)]


def _iteracoes(eventos: list[BetaRawMessageStreamEvent]) -> list[tuple[str, str]]:
    """As tentativas do `usage.iterations`, como `(tipo, modelo)`."""
    (delta,) = [e for e in eventos if isinstance(e, BetaRawMessageDeltaEvent)]
    tentativas: list[tuple[str, str]] = []
    for iteracao in delta.usage.iterations or []:
        assert isinstance(
            iteracao, BetaMessageIterationUsage | BetaFallbackMessageIterationUsage
        )
        assert iteracao.model is not None
        tentativas.append((iteracao.type, iteracao.model))
    return tentativas


def test_sem_substituicao_o_uso_nao_tem_iteracoes() -> None:
    """Como a resposta normal da API real: nenhuma `fallback_message`."""
    eventos = eventos_do_roteiro(Roteiro(blocos=(Texto(("oi",)),)))
    assert _inicio(eventos).message.model == MODELO_DO_FALSO
    assert [a.content_block.type for a in _aberturas(eventos)] == ["thinking", "text"]
    assert _iteracoes(eventos) == []


def test_a_substituicao_antes_da_saida_abre_com_o_substituto() -> None:
    """Recusa antes de qualquer saida: o `message_start` ja nomeia o
    substituto e o bloco `fallback` e o primeiro (documentacao "Refusals and
    fallback")."""
    eventos = eventos_do_roteiro(
        Roteiro(blocos=(Texto(("oi",)),), substituicao=Substituicao(SUBSTITUTO))
    )
    assert _inicio(eventos).message.model == SUBSTITUTO
    aberturas = _aberturas(eventos)
    assert [a.content_block.type for a in aberturas] == ["fallback", "thinking", "text"]
    troca = aberturas[0].content_block
    assert isinstance(troca, BetaFallbackBlock)
    assert aberturas[0].index == 0
    assert (troca.from_.model, troca.to.model) == (MODELO_DO_FALSO, SUBSTITUTO)
    assert troca.trigger.type == "refusal"
    assert _iteracoes(eventos) == [
        ("message", MODELO_DO_FALSO),
        ("fallback_message", SUBSTITUTO),
    ]


def test_a_substituicao_no_meio_fica_entre_os_blocos() -> None:
    """Recusa no meio: o pedido entrega `apos_blocos` blocos, vem a troca, e
    o substituto continua. Os indices seguem monotonicos."""
    eventos = eventos_do_roteiro(
        Roteiro(
            blocos=(Texto(("parcial ",)), Texto(("continuacao",))),
            substituicao=Substituicao(SUBSTITUTO, apos_blocos=1),
        )
    )
    assert _inicio(eventos).message.model == MODELO_DO_FALSO
    aberturas = _aberturas(eventos)
    assert [(a.index, a.content_block.type) for a in aberturas] == [
        (0, "thinking"),
        (1, "text"),
        (2, "fallback"),
        (3, "text"),
    ]
    assert _iteracoes(eventos) == [
        ("message", MODELO_DO_FALSO),
        ("fallback_message", SUBSTITUTO),
    ]


def test_a_substituicao_fixa_nao_tem_bloco() -> None:
    """Roteamento fixo (sticky): a API vai direto ao substituto, sem bloco
    `fallback`, e o uso so tem a `fallback_message`."""
    eventos = eventos_do_roteiro(
        Roteiro(
            blocos=(Texto(("oi",)),), substituicao=Substituicao(SUBSTITUTO, fixa=True)
        )
    )
    assert _inicio(eventos).message.model == SUBSTITUTO
    assert [a.content_block.type for a in _aberturas(eventos)] == ["thinking", "text"]
    assert _iteracoes(eventos) == [("fallback_message", SUBSTITUTO)]


def test_o_bloco_fallback_vai_com_from_no_fio(falso: ServidorAnthropicFalso) -> None:
    """O nome do campo no fio e `from` (palavra reservada no Python, `from_` no
    SDK). O SDK monta o evento sem validar: um `from_` no fio nao reprovaria
    nada, e o falso mentiria em silencio. Por isso a linha CRUA."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("oi",)),), substituicao=Substituicao(SUBSTITUTO)
    )
    pedido = urllib.request.Request(
        f"{falso.url}/v1/messages",
        data=json.dumps({"model": MODELO_DO_FALSO}).encode(),
        method="POST",
    )
    with urllib.request.urlopen(pedido, timeout=5) as resposta:
        corpo = resposta.read().decode()
    (linha,) = [
        linha
        for linha in corpo.splitlines()
        if linha.startswith("data: ") and '"fallback"' in linha
    ]
    bloco = json.loads(linha.removeprefix("data: "))["content_block"]
    assert bloco["from"] == {"model": MODELO_DO_FALSO}
    assert "from_" not in bloco


def test_o_sdk_beta_monta_a_troca_do_stream_do_falso(
    falso: ServidorAnthropicFalso,
) -> None:
    """Camada 2 do falso com o fallback: o SDK fixado, pelo endpoint beta,
    troca o modelo da mensagem final pelo substituto e guarda o bloco."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("parcial ",)), Texto(("fim",))),
        substituicao=Substituicao(SUBSTITUTO, apos_blocos=1),
    )
    with _cliente(falso).beta.messages.stream(
        model=MODELO_DO_FALSO,
        max_tokens=100,
        messages=[{"role": "user", "content": "oi"}],
    ) as stream:
        final = stream.get_final_message()
    assert final.model == SUBSTITUTO
    assert [b.type for b in final.content] == ["thinking", "text", "fallback", "text"]
    assert [i.type for i in final.usage.iterations or []] == [
        "message",
        "fallback_message",
    ]
