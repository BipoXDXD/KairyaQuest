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
