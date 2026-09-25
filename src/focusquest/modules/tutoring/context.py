"""Monta o turno que o provedor recebe: persona, contexto e historico."""

from collections.abc import Sequence
from datetime import datetime
from typing import Literal

from focusquest.modules.missions.cycle_service import leitura_da_avulsa
from focusquest.modules.missions.models import Mission
from focusquest.modules.tutoring.domain import Papel
from focusquest.modules.tutoring.models import TutorMessage
from focusquest.modules.tutoring.provider import MensagemDoTurno, Turno

_PAPEL_NA_API: dict[Papel, Literal["user", "assistant"]] = {
    Papel.USUARIO: "user",
    Papel.TUTORA: "assistant",
}


def montar_turno(
    *,
    persona: str,
    agora: datetime,
    pendentes: Sequence[Mission],
    historico: Sequence[TutorMessage],
) -> Turno:
    """O turno inteiro.

    O "agora" vai no sistema porque a Tifa precisa propor um prazo, e o prazo
    e obrigatorio. As missoes pendentes sao o `get_study_context` do README s6,
    so leitura: no 1b entram no prompt, e nao viram ferramenta.
    """
    return Turno(
        sistema=f"{persona}\n\n{_contexto(agora, pendentes)}",
        mensagens=_mensagens(historico),
    )


def _contexto(agora: datetime, pendentes: Sequence[Mission]) -> str:
    linhas = [
        "## Contexto desta conversa",
        f"Agora (UTC): {agora.isoformat()}",
        "Missões pendentes:",
    ]
    if not pendentes:
        linhas.append("- nenhuma")
    linhas.extend(
        f"- #{missao.id}: {missao.instructions} "
        f"(prazo {leitura_da_avulsa(missao).deadline.isoformat()})"
        for missao in pendentes
    )
    return "\n".join(linhas)


def _texto(mensagem: TutorMessage) -> str:
    """O texto da mensagem, com as acoes dela escritas como texto.

    A API exige um `tool_result` depois de cada `tool_use`, e o backend nunca
    devolve resultado. Escrever a proposta como texto mantem o historico bem
    formado e conta ao modelo o que de fato aconteceu com ela.
    """
    partes = [mensagem.content]
    partes.extend(
        f"[Proposta de missao #{acao.id}: {acao.payload.get('instructions', '')} "
        f"-- {acao.state.value}]"
        for acao in mensagem.actions
    )
    return "\n\n".join(parte for parte in partes if parte)


def _mensagens(historico: Sequence[TutorMessage]) -> tuple[MensagemDoTurno, ...]:
    """Converte, funde papeis seguidos, descarta respostas no inicio e
    mensagens sem texto nenhum.

    Uma `completa` sem texto e sem acao existe: e o `message_stop` que chega
    sem nunca emitir um bloco (a guarda M3 cobre o corte de transporte, nao o
    esgotamento de `tutor_max_tokens` -- pendencia registrada no HANDOFF).
    Deixar essa mensagem virar `MensagemDoTurno` de texto vazio quebraria TODA
    resposta seguinte: a API da Anthropic rejeita mensagem sem conteudo, e a
    linha vazia so sai da janela do historico quando o limite a empurra para
    fora. Descartar aqui, e nao ao gravar, mantem a gravacao fiel ao que o
    provedor de fato mandou.
    """
    fundidas: list[MensagemDoTurno] = []
    for mensagem in historico:
        texto = _texto(mensagem)
        if not texto:
            continue
        papel = _PAPEL_NA_API[mensagem.role]
        if not fundidas and papel == "assistant":
            continue
        if fundidas and fundidas[-1].papel == papel:
            fundidas[-1] = MensagemDoTurno(papel, f"{fundidas[-1].texto}\n\n{texto}")
        else:
            fundidas.append(MensagemDoTurno(papel, texto))
    return tuple(fundidas)
