"""Casos de uso do ciclo diario: criar o plano da semana e ler o ciclo.

Como `service.py`, nada aqui conhece HTTP e nada commita: quem abre a
transacao e quem a fecha. A leitura e sempre DERIVADA (decisao C2): o que esta
revelado, disponivel, perdido ou expirado sai do relogio, do plano e das
conclusoes, e nunca de uma coluna.

A ocultacao (C11) mora em `ler_missao`: o que ainda nao foi revelado levanta
`MissaoNaoEncontradaError`, o MESMO erro de "nao existe". A conclusao usa a
mesma funcao, e e isso que impede a leitura e a conclusao de discordarem
sobre o que existe (decisao P6 do plano do B).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.core.clock import Clock
from focusquest.core.errors import (
    MissaoNaoEncontradaError,
    PlanoExistenteError,
    SemanaDistanteError,
    SemanaEncerradaError,
)
from focusquest.modules.missions.cycle_domain import (
    DIAS_DA_SEMANA,
    DIAS_POR_MARCO,
    Availability,
    DiaDoPlano,
    Historico,
    com_inicio_a_tempo,
    dia_de,
    dias_da_semana,
    dias_para_o_marco,
    disponibilidade_da_diaria,
    disponibilidade_da_especial,
    fim_da_janela_da_especial,
    fim_do_dia,
    marco_da_semana,
    marco_mais_recente,
    na_conclusao_tardia,
    segunda_da_semana,
    sequencia,
)
from focusquest.modules.missions.domain import (
    DIFICULDADE_DA_ESPECIAL,
    MissionState,
    MissionType,
)
from focusquest.modules.missions.models import Mission, WeeklyPlan

# O nome da restricao do plano repetido: reconhece QUAL IntegrityError e o
# 409, pelo mesmo motivo de `UNICIDADE_DA_OPERACAO` em service.py.
UNICIDADE_DA_SEMANA = "uq_weekly_plans_user_id_week_start"


@dataclass(frozen=True)
class NovaDiaria:
    instructions: str
    completion_criterion: str
    difficulty: int
    estimated_minutes: int


@dataclass(frozen=True)
class NovaEspecial:
    """Sem dificuldade: a especial esta sempre na maxima (C9)."""

    instructions: str
    completion_criterion: str
    estimated_minutes: int


@dataclass(frozen=True)
class MissaoLida:
    """A missao com o que e derivado dela: o prazo e a disponibilidade."""

    missao: Mission
    deadline: datetime
    availability: Availability


@dataclass(frozen=True)
class DiaLido:
    """Um dia da trilha. Dia futuro e bau fechado: `missao` e None (B3)."""

    dia: date
    availability: Availability
    missao: MissaoLida | None


@dataclass(frozen=True)
class EspecialLida:
    """A especial da trilha. Bloqueada, e um marcador sem missao."""

    availability: Availability
    progresso: int
    missao: MissaoLida | None


@dataclass(frozen=True)
class PlanoLido:
    semana: date
    dias: list[DiaLido]
    especial: EspecialLida


@dataclass(frozen=True)
class CicloLido:
    hoje: date
    missao: MissaoLida | None
    sequencia: int
    dias_para_o_marco: int
    especial: MissaoLida | None
    # F25: a diaria de ontem, iniciada a tempo, enquanto pode ser concluida
    # com atraso (e, depois de concluida com atraso, ate o limite).
    diaria_de_ontem: MissaoLida | None


def dia_da_diaria(missao: Mission) -> date:
    """O dia de uma diaria. Nulo seria o esquema divergindo do CHECK."""
    if missao.day is None:
        raise RuntimeError(
            f"missao {missao.id} sem dia: o CHECK ck_missions_dia_do_tipo foi violado"
        )
    return missao.day


def leitura_da_avulsa(missao: Mission) -> MissaoLida:
    """A avulsa lida: o prazo e o da coluna, e a disponibilidade so distingue
    concluida (decisao P3 do plano do B) -- a avulsa nao tem regra de dia."""
    if missao.deadline is None:
        raise RuntimeError(
            f"missao {missao.id} sem prazo: o CHECK ck_missions_prazo_do_tipo "
            "foi violado"
        )
    if missao.state is MissionState.CONCLUIDA:
        return MissaoLida(missao, missao.deadline, Availability.CONCLUIDA)
    return MissaoLida(missao, missao.deadline, Availability.DISPONIVEL)


def carregar_historico(session: Session, user_id: int) -> dict[date, DiaDoPlano]:
    """Os dias planejados do usuario, de todas as semanas.

    Le o historico inteiro a cada calculo (custo declarado da C2). Com usuario
    unico e 7 linhas por semana, nao pesa.
    """
    linhas = session.execute(
        select(Mission, WeeklyPlan.created_at)
        .join(WeeklyPlan, Mission.plan_id == WeeklyPlan.id)
        .where(Mission.user_id == user_id, Mission.mission_type == MissionType.DIARIA)
    ).tuples()
    return {
        dia_da_diaria(missao): DiaDoPlano(
            concluida=missao.state is MissionState.CONCLUIDA,
            plano_criado_em=dia_de(criado_em),
        )
        for missao, criado_em in linhas
    }


def _plano_da_missao(session: Session, missao: Mission) -> WeeklyPlan:
    # `.one()`: a FK composta garante o plano; a falta dele e divergencia.
    return session.scalars(
        select(WeeklyPlan).where(WeeklyPlan.id == missao.plan_id)
    ).one()


def _ler_diaria(missao: Mission, plano: WeeklyPlan, agora: datetime) -> MissaoLida:
    hoje = dia_de(agora)
    dia = dia_da_diaria(missao)
    if dia > hoje:
        raise MissaoNaoEncontradaError(
            f"missao {missao.id} e a diaria de {dia}, ainda nao revelada"
        )
    estado = DiaDoPlano(
        concluida=missao.state is MissionState.CONCLUIDA,
        plano_criado_em=dia_de(plano.created_at),
    )
    prazo = fim_do_dia(dia)
    return MissaoLida(
        missao,
        prazo,
        com_inicio_a_tempo(
            disponibilidade_da_diaria(dia, estado, hoje),
            prazo,
            missao.started_at,
            agora,
        ),
    )


def _ler_especial(missao: Mission, marco: date, agora: datetime) -> MissaoLida:
    prazo = fim_da_janela_da_especial(marco)
    return MissaoLida(
        missao,
        prazo,
        com_inicio_a_tempo(
            disponibilidade_da_especial(
                marco, missao.state is MissionState.CONCLUIDA, agora
            ),
            prazo,
            missao.started_at,
            agora,
        ),
    )


def ler_missao(session: Session, missao: Mission, agora: datetime) -> MissaoLida:
    """A missao lida, ou `MissaoNaoEncontradaError` se ainda nao foi revelada.

    Nao revelado (C11): a diaria de um dia futuro (inclusive de uma semana
    futura) e a especial sem marco. Os dois respondem o mesmo 404 de "nao
    existe" -- a distincao vai so para a mensagem, que o handler registra no
    log e nao devolve.
    """
    if missao.mission_type is MissionType.AVULSA:
        return leitura_da_avulsa(missao)
    plano = _plano_da_missao(session, missao)
    if missao.mission_type is MissionType.DIARIA:
        return _ler_diaria(missao, plano, agora)
    marco = marco_da_semana(
        carregar_historico(session, missao.user_id), plano.week_start
    )
    if marco is None:
        raise MissaoNaoEncontradaError(
            f"missao {missao.id} e uma especial ainda bloqueada"
        )
    return _ler_especial(missao, marco, agora)


def criar_plano(
    session: Session,
    *,
    user_id: int,
    semana: date,
    diarias: Sequence[NovaDiaria],
    especial: NovaEspecial,
    clock: Clock,
) -> PlanoLido:
    """Cria o plano da semana e devolve na forma da trilha.

    A ordem das recusas importa: `semana_distante` vem ANTES de qualquer
    aritmetica sobre `semana`, porque e ela que impede o estouro de uma semana
    no ano 9999. So depois dela e seguro somar dias a `semana`.
    """
    if len(diarias) != DIAS_DA_SEMANA:
        raise ValueError(
            f"o plano precisa de {DIAS_DA_SEMANA} diarias, recebeu {len(diarias)}"
        )
    agora = clock()
    hoje = dia_de(agora)
    segunda_atual = segunda_da_semana(hoje)
    if semana > segunda_atual + timedelta(days=DIAS_DA_SEMANA):
        raise SemanaDistanteError(
            f"a semana de {semana} fica alem da seguinte a atual ({segunda_atual})"
        )
    if semana + timedelta(days=DIAS_DA_SEMANA - 1) < hoje:
        raise SemanaEncerradaError(f"a semana de {semana} ja terminou")

    plano = WeeklyPlan(user_id=user_id, week_start=semana, created_at=agora)
    session.add(plano)
    try:
        session.flush()
    except IntegrityError as erro:
        if UNICIDADE_DA_SEMANA not in str(erro.orig):
            raise
        raise PlanoExistenteError(
            f"ja existe plano para a semana de {semana}"
        ) from erro

    for indice, nova in enumerate(diarias):
        session.add(
            Mission(
                user_id=user_id,
                mission_type=MissionType.DIARIA,
                plan_id=plano.id,
                day=semana + timedelta(days=indice),
                instructions=nova.instructions,
                completion_criterion=nova.completion_criterion,
                difficulty=nova.difficulty,
                estimated_minutes=nova.estimated_minutes,
                deadline=None,
                state=MissionState.PENDENTE,
            )
        )
    session.add(
        Mission(
            user_id=user_id,
            mission_type=MissionType.ESPECIAL,
            plan_id=plano.id,
            day=None,
            instructions=especial.instructions,
            completion_criterion=especial.completion_criterion,
            difficulty=DIFICULDADE_DA_ESPECIAL,
            estimated_minutes=especial.estimated_minutes,
            deadline=None,
            state=MissionState.PENDENTE,
        )
    )
    session.flush()
    return _ler_plano(session, plano, agora)


def _ler_plano(session: Session, plano: WeeklyPlan, agora: datetime) -> PlanoLido:
    hoje = dia_de(agora)
    diarias: dict[date, Mission] = {}
    especiais: list[Mission] = []
    for missao in session.scalars(select(Mission).where(Mission.plan_id == plano.id)):
        if missao.mission_type is MissionType.DIARIA:
            diarias[dia_da_diaria(missao)] = missao
        else:
            especiais.append(missao)
    # Exatamente uma: o indice unico parcial garante no maximo uma, e o
    # servico cria sempre uma. O desempacotamento falha alto se nao for.
    (especial,) = especiais

    dias: list[DiaLido] = []
    for dia in dias_da_semana(plano.week_start):
        if dia > hoje:
            dias.append(DiaLido(dia, Availability.BLOQUEADA, None))
            continue
        lida = _ler_diaria(diarias[dia], plano, agora)
        dias.append(DiaLido(dia, lida.availability, lida))

    historico = carregar_historico(session, plano.user_id)
    progresso = sequencia(historico, hoje) % DIAS_POR_MARCO
    marco = marco_da_semana(historico, plano.week_start)
    if marco is None:
        return PlanoLido(
            plano.week_start,
            dias,
            EspecialLida(Availability.BLOQUEADA, progresso, None),
        )
    lida_especial = _ler_especial(especial, marco, agora)
    return PlanoLido(
        plano.week_start,
        dias,
        EspecialLida(lida_especial.availability, progresso, lida_especial),
    )


def ler_plano_atual(
    session: Session, user_id: int, *, clock: Clock
) -> PlanoLido | None:
    """O plano da semana atual, ou None: "sem plano" e estado, nao erro."""
    agora = clock()
    plano = session.scalar(
        select(WeeklyPlan).where(
            WeeklyPlan.user_id == user_id,
            WeeklyPlan.week_start == segunda_da_semana(dia_de(agora)),
        )
    )
    if plano is None:
        return None
    return _ler_plano(session, plano, agora)


def _especial_vigente(
    session: Session, user_id: int, historico: Historico, agora: datetime
) -> MissaoLida | None:
    """A especial do marco mais recente, enquanto a janela dela estiver aberta
    (spec, "A especial no Quartel-General") -- ou, depois dela, enquanto
    estiver na conclusao tardia da F25 (iniciada na janela). O limite da F25
    (fim do dia seguinte ao fim da janela) ainda cabe na semana que
    `marco_mais_recente` olha: o marco mais tardio, no domingo, tem o limite
    na quarta seguinte."""
    marco = marco_mais_recente(historico, dia_de(agora))
    if marco is None:
        return None
    especial = session.scalars(
        select(Mission)
        .join(WeeklyPlan, Mission.plan_id == WeeklyPlan.id)
        .where(
            Mission.user_id == user_id,
            Mission.mission_type == MissionType.ESPECIAL,
            WeeklyPlan.week_start == segunda_da_semana(marco),
        )
    ).one()
    lida = _ler_especial(especial, marco, agora)
    if agora < lida.deadline or _tardia(lida, agora):
        return lida
    return None


def _tardia(lida: MissaoLida, agora: datetime) -> bool:
    return na_conclusao_tardia(
        lida.deadline, lida.availability, lida.missao.completed_at, agora
    )


def _diaria_de_ontem(
    session: Session, user_id: int, hoje: date, agora: datetime
) -> MissaoLida | None:
    """F25: a diaria de ontem, se ela esta na conclusao tardia. So a de
    ontem: o limite da F25 e o fim do dia seguinte ao dia da diaria, entao
    nunca ha mais de uma."""
    de_ontem = session.scalar(
        select(Mission).where(
            Mission.user_id == user_id,
            Mission.mission_type == MissionType.DIARIA,
            Mission.day == hoje - timedelta(days=1),
        )
    )
    if de_ontem is None:
        return None
    lida = ler_missao(session, de_ontem, agora)
    return lida if _tardia(lida, agora) else None


def ler_ciclo(session: Session, user_id: int, *, clock: Clock) -> CicloLido:
    """O dia: a missao de hoje, a sequencia, a especial vigente e a diaria de
    ontem em conclusao tardia (F25)."""
    agora = clock()
    hoje = dia_de(agora)
    historico = carregar_historico(session, user_id)
    atual = sequencia(historico, hoje)
    de_hoje = session.scalar(
        select(Mission).where(
            Mission.user_id == user_id,
            Mission.mission_type == MissionType.DIARIA,
            Mission.day == hoje,
        )
    )
    return CicloLido(
        hoje=hoje,
        missao=None if de_hoje is None else ler_missao(session, de_hoje, agora),
        sequencia=atual,
        dias_para_o_marco=dias_para_o_marco(atual),
        especial=_especial_vigente(session, user_id, historico, agora),
        diaria_de_ontem=_diaria_de_ontem(session, user_id, hoje, agora),
    )
