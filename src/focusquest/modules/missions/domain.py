"""Regras da missao, independentes de framework e de persistencia."""

from datetime import datetime, timedelta
from enum import StrEnum


class MissionState(StrEnum):
    """Estados possiveis de uma missao.

    CONCLUIDA e terminal. Isso nao e economia de estados: e o que faz
    "reenvios nao duplicam conclusoes" (README s8) vir da estrutura em vez
    de depender de codigo defensivo lembrar de checar.
    """

    PENDENTE = "pendente"
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDA = "concluida"


class TransicaoIlegalError(Exception):
    """Transicao de estado que as regras nao permitem."""


_TRANSICOES: dict[MissionState, frozenset[MissionState]] = {
    MissionState.PENDENTE: frozenset(
        {MissionState.EM_ANDAMENTO, MissionState.CONCLUIDA}
    ),
    MissionState.EM_ANDAMENTO: frozenset({MissionState.CONCLUIDA}),
    MissionState.CONCLUIDA: frozenset(),
}


def validar_transicao(atual: MissionState, destino: MissionState) -> None:
    """Valida a transicao. Levanta TransicaoIlegalError explicando o bloqueio."""
    if destino not in _TRANSICOES[atual]:
        permitidos = sorted(e.value for e in _TRANSICOES[atual])
        alvo = ", ".join(permitidos) if permitidos else "nenhum estado"
        raise TransicaoIlegalError(
            f"nao e possivel ir de '{atual.value}' para '{destino.value}'; "
            f"a partir de '{atual.value}' so se pode ir para: {alvo}"
        )


def duracao_real(
    started_at: datetime | None, completed_at: datetime | None
) -> timedelta | None:
    """Duracao real, derivada dos instantes.

    Nao e armazenada: um campo a mais seria mais um lugar para discordar do
    par (started_at, completed_at). Mesmo motivo do XP.
    """
    if started_at is None or completed_at is None:
        return None
    return completed_at - started_at


# Constantes nomeadas para que trocar a curva seja uma linha, nao uma
# refatoracao. O usuario vai revisar estes dois numeros.
XP_BASE = 20
XP_INCREMENTO = 10


def xp_para_dificuldade(dificuldade: int) -> int:
    """XP concedido por uma missao, derivado da dificuldade.

    A curva e quadratica com piso. O piso (XP_BASE) garante que a missao
    facil -- a que destrava o habito -- nunca valha quase nada. O termo
    quadratico garante que encarar o dificil compense, sem explodir:
    dificuldade 1 vale 20, dificuldade 5 vale 220, uma razao de 11x que e
    significativa sem ser absurda. Uma curva linear tornaria missoes
    faceis a forma mais eficiente de ganhar XP por hora, que e o incentivo
    errado num app de estudos.

    XP_BASE e XP_INCREMENTO sao o ponto de ajuste: mudar esses dois numeros
    altera retroativamente o XP de missoes antigas, ja que o XP e derivado
    da dificuldade em vez de armazenado. Essa e a consequencia aceita de
    nao persistir o XP.
    """
    if dificuldade < 1:
        raise ValueError(f"dificuldade precisa ser >= 1, recebido {dificuldade}")
    return XP_BASE + XP_INCREMENTO * dificuldade * (dificuldade - 1)


class MissionType(StrEnum):
    """O tipo da missao (spec do ciclo diario, decisao C4).

    A avulsa e a missao do 1a, com prazo proprio. A diaria e a especial nascem
    do plano semanal, e o prazo delas e DERIVADO (C10), nunca gravado. O nome
    e `mission_type`, e nao `kind`, porque `mission_operations.kind` ja existe
    com outro sentido.
    """

    AVULSA = "avulsa"
    DIARIA = "diaria"
    ESPECIAL = "especial"


# C9: a especial esta sempre na dificuldade maxima e vale o triplo dela --
# "o bonus vale o triplo das missoes dificeis", confirmado pelo dono em
# 2026-09-25. A dificuldade e a mesma de `DIFICULDADE_MAXIMA` (a borda, em
# schemas.py); um teste de unidade amarra as duas.
DIFICULDADE_DA_ESPECIAL = 5
MULTIPLICADOR_DA_ESPECIAL = 3


def xp_da_missao(tipo: MissionType, dificuldade: int) -> int:
    """XP da missao, derivado do tipo e da dificuldade -- nunca armazenado (A4)."""
    xp = xp_para_dificuldade(dificuldade)
    if tipo is MissionType.ESPECIAL:
        return xp * MULTIPLICADOR_DA_ESPECIAL
    return xp


class Veredito(StrEnum):
    """O nivel da rubrica fixa da avaliacao (E6). Dado, nao texto de tela."""

    ATENDE = "atende"
    PARCIAL = "parcial"
    NAO_ATENDE = "nao_atende"


class EstadoDaAvaliacao(StrEnum):
    """O ciclo de vida de uma avaliacao (E9): gravada `avaliando` antes de
    chamar o modelo, e so anunciada depois de `concluida` ou `falhou`."""

    AVALIANDO = "avaliando"
    CONCLUIDA = "concluida"
    FALHOU = "falhou"


class FalhaDaAvaliacao(StrEnum):
    """O `error_code` de uma tentativa que falhou (E13). Os dois primeiros tem
    o mesmo valor dos codigos do stream da conversa (`CodigoDoStream`)."""

    PROVEDOR_INDISPONIVEL = "provedor_indisponivel"
    TEMPO_ESGOTADO = "tempo_esgotado"
    AVALIACAO_INVALIDA = "avaliacao_invalida"


class Verificacao(StrEnum):
    """Como a conclusao foi verificada (E4). DERIVADA, nunca gravada. A
    avaliacao da Tifa nao e um terceiro valor aqui: ela e mostrada a parte,
    como interpretacao do modelo, sobre uma conclusao `com_evidencia`."""

    AUTODECLARADA = "autodeclarada"
    COM_EVIDENCIA = "com_evidencia"


def verificacao_da_missao(
    estado: MissionState, tem_evidencia: bool
) -> Verificacao | None:
    """`None` enquanto a missao nao foi concluida: nao ha o que verificar."""
    if estado is not MissionState.CONCLUIDA:
        if tem_evidencia:
            raise ValueError("evidencia gravada numa missao nao concluida")
        return None
    return Verificacao.COM_EVIDENCIA if tem_evidencia else Verificacao.AUTODECLARADA


# CONCLUIDA e terminal (E8): uma avaliacao concluida por missao, para sempre.
# FALHOU volta a AVALIANDO numa tentativa nova; a orfa passa por FALHOU antes.
_TRANSICOES_DA_AVALIACAO: dict[EstadoDaAvaliacao, frozenset[EstadoDaAvaliacao]] = {
    EstadoDaAvaliacao.AVALIANDO: frozenset(
        {EstadoDaAvaliacao.CONCLUIDA, EstadoDaAvaliacao.FALHOU}
    ),
    EstadoDaAvaliacao.FALHOU: frozenset({EstadoDaAvaliacao.AVALIANDO}),
    EstadoDaAvaliacao.CONCLUIDA: frozenset(),
}


def validar_transicao_da_avaliacao(
    atual: EstadoDaAvaliacao, destino: EstadoDaAvaliacao
) -> None:
    """Mesmo erro e mesma forma de mensagem da missao (`transicao_ilegal`)."""
    if destino not in _TRANSICOES_DA_AVALIACAO[atual]:
        permitidos = sorted(e.value for e in _TRANSICOES_DA_AVALIACAO[atual])
        alvo = ", ".join(permitidos) if permitidos else "nenhum estado"
        raise TransicaoIlegalError(
            f"nao e possivel ir de '{atual.value}' para '{destino.value}'; "
            f"a partir de '{atual.value}' so se pode ir para: {alvo}"
        )


class TipoDeOperacao(StrEnum):
    """O `kind` de `mission_operations`: QUAL operacao a chave nomeou. A
    UNIQUE e sobre `operation_id` sozinho, entao uma chave gasta num tipo esta
    gasta nos outros (ver `CONCLUSAO` em service.py)."""

    CONCLUSAO = "complete"
    INICIO = "start"
    REAGENDAMENTO = "reschedule"


class MotivoDoReagendamento(StrEnum):
    """Por que o prazo mudou (README s5). Fechado de proposito (F10): a maquina
    distingue, e texto livre seria mais um dado nao confiavel no prompt."""

    DIFICULDADE = "dificuldade"
    FALTA_DE_TEMPO = "falta_de_tempo"
    MUDANCA_DE_PRIORIDADE = "mudanca_de_prioridade"


class OrigemDoReagendamento(StrEnum):
    """Quem pediu: a pessoa pela tela, ou a Tifa por proposta confirmada."""

    USUARIO = "usuario"
    TIFA = "tifa"


class ProblemaDoNovoPrazo(StrEnum):
    """Por que um novo prazo nao serve. O servico traduz cada um no erro dele."""

    NO_PASSADO = "no_passado"
    INALTERADO = "inalterado"


def problema_do_novo_prazo(
    novo: datetime, atual: datetime, agora: datetime
) -> ProblemaDoNovoPrazo | None:
    """O que impede `novo` de ser o prazo, ou `None` (F9).

    O passado vem primeiro: um prazo vencido igual ao atual e, antes de tudo,
    um prazo vencido -- e a mensagem que ajuda a pessoa. Antecipar e permitido.
    Instantes comparam como instantes: o mesmo momento em `Z` e em `-03:00` e
    o mesmo prazo.
    """
    if novo.tzinfo is None or atual.tzinfo is None or agora.tzinfo is None:
        raise ValueError("instante sem fuso: o prazo e um instante, nao uma hora")
    if novo <= agora:
        return ProblemaDoNovoPrazo.NO_PASSADO
    if novo == atual:
        return ProblemaDoNovoPrazo.INALTERADO
    return None


def validar_reagendamento(estado: MissionState) -> None:
    """Reagendar vale em `pendente` e `em_andamento` (F8); a concluida nao tem
    mais prazo a cumprir. Mesmo erro (e mesmo `code`) da transicao ilegal."""
    if estado is MissionState.CONCLUIDA:
        raise TransicaoIlegalError(
            "nao e possivel reagendar uma missao 'concluida'; "
            "so se reagenda o que ainda nao foi feito"
        )
