"""O adaptador de producao, inteiro, contra o servidor falso."""

from typing import Any

import pytest

from focusquest.modules.tutoring.anthropic_provider import (
    BETA_DO_FALLBACK,
    TENTATIVAS,
    ProvedorAnthropic,
)
from focusquest.modules.tutoring.provider import (
    Delta,
    EventoDoProvedor,
    Fim,
    MensagemDoTurno,
    Parada,
    Proposta,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)
from integration.provedor_falso import (
    APOS_O_PRIMEIRO_PEDACO,
    PENSAMENTO,
    ChamadaDeFerramenta,
    MotivoDeParada,
    Roteiro,
    ServidorAnthropicFalso,
    Substituicao,
    Texto,
    eventos_do_roteiro,
)

TURNO = Turno(sistema="SISTEMA", mensagens=(MensagemDoTurno("user", "oi"),))
ENTRADA: dict[str, Any] = {"instructions": "Ler", "difficulty": 2}
# Pequeno o bastante para os testes de demora levarem menos de um segundo.
TIMEOUT = 0.3


def _provedor(
    falso: ServidorAnthropicFalso,
    chave: str = "sk-ant-teste",
    *,
    fallback: bool = True,
) -> ProvedorAnthropic:
    return ProvedorAnthropic(
        chave=chave,
        base_url=falso.url,
        modelo="claude-opus-5",
        max_tokens=256,
        timeout_segundos=TIMEOUT,
        fallback=fallback,
    )


def _todos(falso: ServidorAnthropicFalso) -> list[EventoDoProvedor]:
    return list(_provedor(falso).responder(TURNO))


def test_texto_em_pedacos_e_fim(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("Bora, ", "estudar!")),))
    assert _todos(falso) == [Delta("Bora, "), Delta("estudar!"), Fim()]


def test_a_ferramenta_vira_proposta_antes_do_fim(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("Toma:",)), ChamadaDeFerramenta(ENTRADA)))
    assert _todos(falso) == [Delta("Toma:"), Proposta("create_mission", ENTRADA), Fim()]


@pytest.mark.parametrize(
    ("stop_reason", "parada"),
    [
        ("end_turn", Parada.TERMINOU),
        ("tool_use", Parada.TERMINOU),
        ("max_tokens", Parada.CORTADA),
        ("model_context_window_exceeded", Parada.CORTADA),
        ("refusal", Parada.RECUSADA),
    ],
)
def test_o_fim_diz_por_que_a_resposta_parou(
    falso: ServidorAnthropicFalso, stop_reason: MotivoDeParada, parada: Parada
) -> None:
    """Pendencias 45 e 120: o `message_stop` chega igual quando o modelo
    terminou, quando a resposta foi cortada (o teto de tokens ou a janela de
    contexto) e quando ela foi recusada. Quem distingue e o `stop_reason` do
    `message_delta`, que o adaptador traduz para o `Fim`. A recusa no meio do
    stream chega DEPOIS de texto -- o `Delta` sai, e quem decide descarta-lo e
    o servico."""
    falso.roteiro = Roteiro(blocos=(Texto(("Bora",)),), stop_reason=stop_reason)
    assert _todos(falso) == [Delta("Bora"), Fim(parada)]


@pytest.mark.parametrize(
    ("blocos", "esperado"),
    [
        ((Texto(("Bora, ", "estudar!")),), [Delta("Bora, "), Delta("estudar!"), Fim()]),
        (
            (Texto(("Toma:",)), ChamadaDeFerramenta(ENTRADA)),
            [Delta("Toma:"), Proposta("create_mission", ENTRADA), Fim()],
        ),
    ],
)
def test_o_thinking_da_api_nao_chega_ao_dominio(
    falso: ServidorAnthropicFalso,
    blocos: tuple[Texto | ChamadaDeFerramenta, ...],
    esperado: list[EventoDoProvedor],
) -> None:
    """A API real (`claude-opus-5`) manda um bloco de thinking antes do texto,
    mesmo sem a requisicao pedir (referencia da camada 3, 1b-2). O adaptador
    entrega o MESMO dominio com e sem ele: so texto e proposta, e nenhuma
    palavra do raciocinio vira `Delta` na tela (README s6)."""
    falso.roteiro = Roteiro(blocos=blocos, pensar=False)
    sem_thinking = _todos(falso)
    falso.roteiro = Roteiro(blocos=blocos)
    # O padrao do falso emite o thinking; sem isto, o teste passaria vazio.
    assert any(
        evento.type == "content_block_start" and evento.content_block.type == "thinking"
        for evento in eventos_do_roteiro(falso.roteiro)
    )
    com_thinking = _todos(falso)

    assert sem_thinking == esperado
    assert com_thinking == esperado
    assert PENSAMENTO not in repr(com_thinking)


def test_a_requisicao_leva_o_que_a_spec_manda(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    _todos(falso)
    corpo = falso.recebidas[0].corpo
    assert corpo["model"] == "claude-opus-5"
    assert corpo["max_tokens"] == 256
    assert corpo["system"] == "SISTEMA"
    assert corpo["messages"] == [{"role": "user", "content": "oi"}]
    assert corpo["tool_choice"] == {"type": "auto", "disable_parallel_tool_use": True}
    criar, reagendar = corpo["tools"]
    assert [criar["name"], reagendar["name"]] == [
        "create_mission",
        "reschedule_mission",
    ]
    ferramenta = criar
    esquema = ferramenta["input_schema"]
    # A docstring de manutencao do MissionCreate nao vai para o modelo.
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
    """Documenta que o SDK nao denuncia o corte. Quem trata a falta
    do `Fim` e o servico."""
    # Corta depois do primeiro pedaco ("meio"), antes do segundo.
    falso.roteiro = Roteiro(
        blocos=(Texto(("meio", "resto")),), cortar_apos_eventos=APOS_O_PRIMEIRO_PEDACO
    )
    assert _todos(falso) == [Delta("meio")]


def test_demora_no_meio_vira_tempo_esgotado(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(
        # A demora cai antes do segundo pedaco: "meio" ja chegou.
        blocos=(Texto(("meio", "resto")),),
        atrasar_evento=(APOS_O_PRIMEIRO_PEDACO, TIMEOUT * 4),
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
        fallback=True,
    )
    with pytest.raises(ProvedorIndisponivelError):
        list(provedor.responder(TURNO))


ENTRADA_DO_REAGENDAMENTO: dict[str, Any] = {
    "mission_id": 12,
    "new_deadline": "2026-10-05T18:00:00-03:00",
    "reason": "falta_de_tempo",
}


def test_o_reagendamento_vira_proposta_com_o_nome(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = Roteiro(
        blocos=(
            Texto(("Vamos mover:",)),
            ChamadaDeFerramenta(ENTRADA_DO_REAGENDAMENTO, nome="reschedule_mission"),
        )
    )
    assert _todos(falso) == [
        Delta("Vamos mover:"),
        Proposta("reschedule_mission", ENTRADA_DO_REAGENDAMENTO),
        Fim(),
    ]


def test_o_esquema_do_reagendamento_vai_sem_a_docstring(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    _todos(falso)
    _, reagendar = falso.recebidas[0].corpo["tools"]
    esquema = reagendar["input_schema"]
    assert "description" not in esquema and "title" not in esquema
    assert set(esquema["required"]) == {"mission_id", "new_deadline", "reason"}
    assert esquema["additionalProperties"] is False
    assert "strict" not in reagendar  # F18: como a create_mission


# ---------------------------------------------------------------------------
# O fallback do servidor para a recusa (pendencia 174, beta)
# ---------------------------------------------------------------------------

SUBSTITUTO = "claude-opus-4-8"


def test_a_requisicao_pede_o_fallback_padrao(falso: ServidorAnthropicFalso) -> None:
    """`"default"` so e aceito com o beta de data `2026-07-01` EXATA: qualquer
    outra data de `server-side-fallback-*` da 400 (documentacao "Refusals and
    fallback"). Por isso a string inteira e conferida."""
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    _todos(falso)
    recebida = falso.recebidas[0]
    assert BETA_DO_FALLBACK == "server-side-fallback-2026-07-01"
    assert recebida.corpo["fallbacks"] == "default"
    assert BETA_DO_FALLBACK in recebida.cabecalhos["anthropic-beta"].split(",")


def test_desligado_a_requisicao_nao_pede_fallback(
    falso: ServidorAnthropicFalso,
) -> None:
    """`FOCUSQUEST_TUTOR_FALLBACK=false`: o corpo e o de antes, sem `fallbacks`
    e sem o cabecalho beta -- a saida se o beta mudar (pendencia 174)."""
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    assert list(_provedor(falso, fallback=False).responder(TURNO)) == [
        Delta("ok"),
        Fim(),
    ]
    recebida = falso.recebidas[0]
    assert "fallbacks" not in recebida.corpo
    assert "anthropic-beta" not in recebida.cabecalhos


@pytest.mark.parametrize(
    "substituicao",
    [
        Substituicao(SUBSTITUTO),
        Substituicao(SUBSTITUTO, apos_blocos=1),
        Substituicao(SUBSTITUTO, fixa=True),
    ],
    ids=["antes-da-saida", "no-meio", "fixa"],
)
def test_o_fim_diz_quem_substituiu(
    falso: ServidorAnthropicFalso, substituicao: Substituicao
) -> None:
    """O sinal e a entrada `fallback_message` de `usage.iterations`, e nao o
    bloco `fallback` (ausente no roteamento fixo) nem o `model` do
    `message_start` (o do pedido quando a troca vem no meio)."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("parcial ",)), Texto(("fim",))), substituicao=substituicao
    )
    eventos = _todos(falso)
    assert eventos[-1] == Fim(Parada.TERMINOU, substituto=SUBSTITUTO)


def test_sem_substituicao_o_fim_nao_tem_substituto(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    fim = _todos(falso)[-1]
    assert isinstance(fim, Fim)
    assert fim.substituto is None


def test_o_texto_do_pedido_continua_depois_da_troca(
    falso: ServidorAnthropicFalso,
) -> None:
    """O substituto continua A PARTIR do parcial ("nothing you have already
    received is invalidated"): os `Delta` saem os dois, nessa ordem."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("parcial ",)), Texto(("continuacao",))),
        substituicao=Substituicao(SUBSTITUTO, apos_blocos=1),
    )
    assert _todos(falso) == [
        Delta("parcial "),
        Delta("continuacao"),
        Fim(Parada.TERMINOU, substituto=SUBSTITUTO),
    ]


def test_a_proposta_antes_da_troca_e_descartada(
    falso: ServidorAnthropicFalso,
) -> None:
    """Um `tool_use` que fechou antes da troca e trabalho do modelo que
    recusou; a documentacao manda descarta-lo, e o substituto so recebe o
    texto parcial como contexto. Se ele nao chamar a ferramenta, nada vira
    proposta."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Toma:",)), ChamadaDeFerramenta(ENTRADA), Texto((" pronto",))),
        substituicao=Substituicao(SUBSTITUTO, apos_blocos=2),
        stop_reason="end_turn",
    )
    assert _todos(falso) == [
        Delta("Toma:"),
        Delta(" pronto"),
        Fim(Parada.TERMINOU, substituto=SUBSTITUTO),
    ]


def test_a_proposta_do_substituto_vale(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(
        blocos=(Texto(("Toma:",)), ChamadaDeFerramenta(ENTRADA)),
        substituicao=Substituicao(SUBSTITUTO, apos_blocos=1),
    )
    assert _todos(falso) == [
        Delta("Toma:"),
        Proposta("create_mission", ENTRADA),
        Fim(Parada.TERMINOU, substituto=SUBSTITUTO),
    ]


def test_a_cadeia_esgotada_continua_recusada(falso: ServidorAnthropicFalso) -> None:
    """O substituto tambem recusou: a parada FINAL e `refusal`, e o servico
    segue o caminho da recusa de hoje (pendencia 120)."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("parcial",)),),
        substituicao=Substituicao(SUBSTITUTO, apos_blocos=1),
        stop_reason="refusal",
    )
    assert _todos(falso) == [
        Delta("parcial"),
        Fim(Parada.RECUSADA, substituto=SUBSTITUTO),
    ]
