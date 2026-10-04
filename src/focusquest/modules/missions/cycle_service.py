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
    dia_de,
    dias_da_semana,
    dias_para_o_marco,
    disponibilidade_da_diaria,
    disponibilidade_da_especial,
    fim_da_janela_da_especial,
    fim_do_dia,
    marco_da_semana,
    marco_mais_recente,
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
    )
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


def _ler_diaria(missao: Mission, plano: WeeklyPlan, hoje: date) -> MissaoLida:
    dia = dia_da_diaria(missao)
    if dia > hoje:
        raise MissaoNaoEncontradaError(
            f"missao {missao.id} e a diaria de {dia}, ainda nao revelada"
        )
    estado = DiaDoPlano(
        concluida=missao.state is MissionState.CONCLUIDA,
        plano_criado_em=dia_de(plano.created_at),
    )
    return MissaoLida(
        missao, fim_do_dia(dia), disponibilidade_da_diaria(dia, estado, hoje)
    )


def _ler_especial(missao: Mission, marco: date, agora: datetime) -> MissaoLida:
    return MissaoLida(
        missao,
        fim_da_janela_da_especial(marco),
        disponibilidade_da_especial(
            marco, missao.state is MissionState.CONCLUIDA, agora
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
        return _ler_diaria(missao, plano, dia_de(agora))
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
        lida = _ler_diaria(diarias[dia], plano, hoje)
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
    especiais: dict[date, Mission], historico: Historico, agora: datetime
) -> MissaoLida | None:
    """A especial do marco mais recente, enquanto a janela dela estiver aberta
    (spec, "A especial no Quartel-General"). Usa o mesmo snapshot das diarias.
    """
    marco = marco_mais_recente(historico, dia_de(agora))
    if marco is None or agora >= fim_da_janela_da_especial(marco):
        return None
    return _ler_especial(especiais[segunda_da_semana(marco)], marco, agora)


def ler_ciclo(session: Session, user_id: int, *, clock: Clock) -> CicloLido:
    """O dia inteiro deriva de um unico SELECT, com o relogio lido uma vez.

    Valores de colunas evitam identidades ORM antigas na Session do chamador.
    As Mission devolvidas sao copias transitorias do snapshot, nao entidades
    gerenciadas: refresh/expire posteriores nao alteram esta leitura. O
    autoflush normal preserva as alteracoes proprias pendentes, sem commit,
    locks ou mudanca de isolamento. Se o chamador desabilitar autoflush, deve
    fazer flush das alteracoes que deseja incluir neste snapshot.

    Inclui todas as semanas (o historico precisa delas) e as oito missoes de
    cada plano, sem filtros prematuros de especiais por janela.
    """
    agora = clock()
    hoje = dia_de(agora)
    linhas = (
        session.execute(
            select(
                Mission.__table__,
                WeeklyPlan.created_at.label("plano_criado_em"),
                WeeklyPlan.week_start.label("semana"),
            )
            .join(WeeklyPlan, Mission.plan_id == WeeklyPlan.id)
            .where(
                Mission.user_id == user_id,
                Mission.mission_type.in_((MissionType.DIARIA, MissionType.ESPECIAL)),
            )
        )
        .mappings()
        .all()
    )

    historico: dict[date, DiaDoPlano] = {}
    diarias: dict[date, Mission] = {}
    especiais: dict[date, Mission] = {}
    for linha in linhas:
        missao = Mission(
            **{coluna.key: linha[coluna.key] for coluna in Mission.__table__.columns}
        )
        if missao.mission_type is MissionType.DIARIA:
            dia = dia_da_diaria(missao)
            diarias[dia] = missao
            historico[dia] = DiaDoPlano(
                concluida=missao.state is MissionState.CONCLUIDA,
                plano_criado_em=dia_de(linha["plano_criado_em"]),
            )
        else:
            especiais[linha["semana"]] = missao

    atual = sequencia(historico, hoje)
    de_hoje = diarias.get(hoje)
    return CicloLido(
        hoje=hoje,
        missao=None
        if de_hoje is None
        else MissaoLida(
            de_hoje,
            fim_do_dia(hoje),
            disponibilidade_da_diaria(hoje, historico[hoje], hoje),
        ),
        sequencia=atual,
        dias_para_o_marco=dias_para_o_marco(atual),
        especial=_especial_vigente(especiais, historico, agora),
    )
