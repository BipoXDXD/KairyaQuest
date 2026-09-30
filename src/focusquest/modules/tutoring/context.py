"""Monta o turno que o provedor recebe: persona, contexto e historico."""

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Literal

from focusquest.modules.missions.cycle_domain import (
    FUSO_DO_CICLO,
    Availability,
    limite_da_conclusao_tardia,
)
from focusquest.modules.missions.cycle_service import (
    CicloLido,
    MissaoLida,
    leitura_da_avulsa,
)
from focusquest.modules.missions.domain import (
    MissionState,
    MissionType,
    MotivoDoReagendamento,
)
from focusquest.modules.missions.models import Mission
from focusquest.modules.progression.service import Progresso
from focusquest.modules.tutoring.domain import EstadoDaAcao, Papel, TipoDeAcao
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.provider import MensagemDoTurno, Turno

_PAPEL_NA_API: dict[Papel, Literal["user", "assistant"]] = {
    Papel.USUARIO: "user",
    Papel.TUTORA: "assistant",
}

# O motivo como o modelo le (F19): texto de produto, com acento. Um teste
# confere que todo membro do enum tem rotulo -- o mypy nao garante
# exaustividade de `dict`.
ROTULO_DO_MOTIVO: dict[MotivoDoReagendamento, str] = {
    MotivoDoReagendamento.DIFICULDADE: "dificuldade",
    MotivoDoReagendamento.FALTA_DE_TEMPO: "falta de tempo",
    MotivoDoReagendamento.MUDANCA_DE_PRIORIDADE: "mudança de prioridade",
}
# O mesmo, pelo valor gravado no `payload` (JSON: texto, nao o enum).
_ROTULO_POR_VALOR = {
    motivo.value: rotulo for motivo, rotulo in ROTULO_DO_MOTIVO.items()
}


def montar_turno(
    *,
    persona: str,
    agora: datetime,
    pendentes: Sequence[Mission],
    progresso: Progresso,
    historico: Sequence[TutorMessage],
    tardias: Sequence[MissaoLida] = (),
) -> Turno:
    """O turno inteiro.

    O "agora" vai no sistema porque a Tifa precisa propor um prazo, e o prazo
    e obrigatorio. As missoes pendentes sao o `get_study_context` do README s6,
    so leitura: no 1b entram no prompt, e nao viram ferramenta. O progresso e
    a mesma coisa (D15): a Tifa SABE o nivel, o saldo e as conquistas, mas
    nenhuma ferramenta muda nada disso.

    As `tardias` sao as missoes do ciclo em conclusao tardia (F25,
    `tardias_do_ciclo`): a Tifa sabe que ainda da para concluir, mas elas nao
    entram na lista de pendentes, que e a lista do reagendamento.
    """
    contexto = _contexto(agora, pendentes, tardias, progresso)
    return Turno(sistema=f"{persona}\n\n{contexto}", mensagens=_mensagens(historico))


def tardias_do_ciclo(ciclo: CicloLido, agora: datetime) -> tuple[MissaoLida, ...]:
    """A diaria de ontem e a especial que passaram do prazo mas, iniciadas a
    tempo, ainda podem ser concluidas (F25) -- nessa ordem.

    `disponivel` depois do prazo e exatamente a conclusao tardia
    (`com_inicio_a_tempo`). A concluida com atraso fica fora: `ler_ciclo` a
    mantem ate o limite para o cartao do Quartel-General, mas para a Tifa nao
    ha mais nada a lembrar. A especial ainda na janela tambem fica fora: ela e
    o ciclo de hoje, que a Tifa continua sem ver (pendencia 55).
    """
    candidatas = (ciclo.diaria_de_ontem, ciclo.especial)
    return tuple(
        lida
        for lida in candidatas
        if lida is not None
        and lida.availability is Availability.DISPONIVEL
        and agora >= lida.deadline
    )


def _contexto(
    agora: datetime,
    pendentes: Sequence[Mission],
    tardias: Sequence[MissaoLida],
    progresso: Progresso,
) -> str:
    linhas = [
        "## Contexto desta conversa",
        f"Agora (UTC): {agora.isoformat()}",
        "Missões pendentes:",
    ]
    if not pendentes:
        linhas.append("- nenhuma")
    linhas.extend(_linha_da_pendente(missao) for missao in pendentes)
    if tardias:
        linhas.append(
            "Missões do ciclo em conclusão tardia (iniciadas a tempo; a pessoa "
            "ainda pode concluí-las, mas elas não podem ser reagendadas):"
        )
        linhas.extend(_linha_da_tardia(lida) for lida in tardias)
    linhas.append(_linha_de_progresso(progresso))
    return "\n".join(linhas)


def _linha_da_tardia(lida: MissaoLida) -> str:
    """Sem `#id` de proposito: o `#` nomeia a missao que a
    `reschedule_mission` recebe, e a diaria e a especial tem prazo derivado
    do ciclo, que nao se reagenda (`PrazoDerivadoError`). O limite vai em
    UTC, como o "Agora", e tambem na hora de Sao Paulo: ele e uma meia-noite
    de la, e "ontem" e o dia civil de la. E semiaberto, dai o "antes de"."""
    missao = lida.missao
    nome = (
        "diária de ontem"
        if missao.mission_type is MissionType.DIARIA
        else "missão especial"
    )
    limite = limite_da_conclusao_tardia(lida.deadline)
    # So a iniciada a tempo chega aqui (`com_inicio_a_tempo`).
    assert missao.started_at is not None
    return (
        f"- {nome}: {missao.instructions} (em andamento desde "
        f"{missao.started_at.isoformat()}; "
        f"pode ser concluída antes de {limite.astimezone(UTC).isoformat()}, "
        f"que é {limite.astimezone(FUSO_DO_CICLO).isoformat()} em São Paulo)"
    )


def _linha_da_pendente(missao: Mission) -> str:
    """O id (que a `reschedule_mission` precisa), a instrucao, o prazo, o
    estado com o inicio, e quantas vezes foi reagendada com o ultimo motivo
    (F19). A contagem e dado para planejar, nunca para culpar (persona)."""
    detalhes = [f"prazo {leitura_da_avulsa(missao).deadline.isoformat()}"]
    if missao.state is MissionState.EM_ANDAMENTO and missao.started_at is not None:
        detalhes.append(f"em andamento desde {missao.started_at.isoformat()}")
    else:
        detalhes.append("pendente")
    if missao.reschedules:
        vezes = len(missao.reschedules)
        motivo = ROTULO_DO_MOTIVO[missao.reschedules[-1].reason]
        detalhes.append(
            f"reagendada {vezes} {'vez' if vezes == 1 else 'vezes'}; "
            f"último motivo: {motivo}"
        )
    return f"- #{missao.id}: {missao.instructions} ({'; '.join(detalhes)})"


def _linha_de_progresso(progresso: Progresso) -> str:
    """Nivel, saldo e conquistas, so leitura (D15). Nenhuma ferramenta muda o
    saldo: pedir XP no chat nao altera nada (README s6)."""
    saldo = f"{progresso.xp_total:,}".replace(",", ".")
    destravadas = [c.conquista.titulo for c in progresso.conquistas if c.unlocked_at]
    conquistas = (
        f"conquistas: {', '.join(destravadas)}."
        if destravadas
        else "nenhuma conquista ainda."
    )
    return (
        f"Progresso do estudante: nível {progresso.faixa.nivel}, {saldo} XP; "
        f"{conquistas}"
    )


def _texto(mensagem: TutorMessage) -> str:
    """O texto da mensagem, com as acoes dela escritas como texto.

    A API exige um `tool_result` depois de cada `tool_use`, e o backend nunca
    devolve resultado. Escrever a proposta como texto mantem o historico bem
    formado e conta ao modelo o que de fato aconteceu com ela.
    """
    partes = [mensagem.content]
    partes.extend(_texto_da_acao(acao) for acao in mensagem.actions)
    return "\n\n".join(parte for parte in partes if parte)


def _texto_da_acao(acao: TutorAction) -> str:
    """A acao antiga como texto, POR TIPO (F19): lida como criacao, uma
    proposta de reagendamento apareceria ao modelo como "Proposta de missao"
    com a instrucao do retrato."""
    if acao.kind is TipoDeAcao.REAGENDAR_MISSAO:
        motivo = str(acao.payload.get("reason"))
        rotulo = _ROTULO_POR_VALOR.get(motivo, motivo)
        return (
            f"[Proposta de reagendamento da missão #{acao.payload.get('mission_id')} "
            f"para {acao.payload.get('new_deadline')} ({rotulo}) "
            f"-- {acao.state.value}]"
        )
    # So ids de MISSAO levam `#` (I2 da revisao da T7): e o `#` da lista de
    # pendentes e o que a `reschedule_mission` recebe. O id da acao com `#`
    # faria "a missao que voce criou" virar o `mission_id` errado.
    criada = (
        f" -> missão #{acao.mission_id}"
        if acao.state is EstadoDaAcao.EXECUTADA and acao.mission_id is not None
        else ""
    )
    return (
        f"[Proposta de missão (ação {acao.id}): "
        f"{acao.payload.get('instructions', '')} -- {acao.state.value}{criada}]"
    )


def _mensagens(historico: Sequence[TutorMessage]) -> tuple[MensagemDoTurno, ...]:
    """Converte, funde papeis seguidos, descarta respostas no inicio e
    mensagens sem texto nenhum.

    Uma `completa` sem texto e sem acao existe: e o `message_stop` que chega
    sem nunca emitir um bloco (a guarda do `Fim` cobre o corte de transporte, nao o
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
