"""Casos de uso da progressao: o credito na conclusao, a recompensa e a leitura.

Como em `missions.service`, nada aqui commita: quem abre a transacao a fecha.
Direcao unica (spec, "Servico"): este modulo LE modelos e regras de `missions`
e o modelo de acao da `tutoring`, e nao importa nenhum `service` delas.
"""

from collections.abc import Set as AbstractSet
from dataclasses import dataclass
from datetime import datetime
from typing import cast

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from focusquest.modules.missions.cycle_domain import dia_de
from focusquest.modules.missions.cycle_service import carregar_historico
from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    MissionState,
    MissionType,
    Veredito,
    xp_da_missao,
)
from focusquest.modules.missions.models import (
    Mission,
    MissionEvaluation,
)
from focusquest.modules.progression.domain import (
    CATALOGO,
    PAINEL,
    CodigoDerivado,
    ConquistaDoPainel,
    FaixaDoNivel,
    FatosDoUsuario,
    Rank,
    bonus_da_avaliacao,
    conquistas_satisfeitas,
    faixa_do_nivel,
    indice_da_volta,
    maior_sequencia,
    nivel_do_saldo,
    rank_do_nivel,
)
from focusquest.modules.progression.models import (
    FONTE_BONUS,
    FONTE_CONCLUSAO,
    UserAchievement,
    XpEntry,
)
from focusquest.modules.tutoring.domain import EstadoDaAcao, TipoDeAcao
from focusquest.modules.tutoring.models import TutorAction
from focusquest.modules.users.models import User


@dataclass(frozen=True)
class Recompensa:
    xp_awarded: int
    xp_total: int
    level_before: int
    level_after: int
    achievements_unlocked: tuple[ConquistaDoPainel, ...]


@dataclass(frozen=True)
class ConquistaNoPainel:
    conquista: ConquistaDoPainel
    unlocked_at: datetime | None


@dataclass(frozen=True)
class Progresso:
    xp_total: int
    faixa: FaixaDoNivel
    rank: Rank
    conquistas: tuple[ConquistaNoPainel, ...]


def registrar_conclusao(session: Session, missao: Mission, agora: datetime) -> None:
    """Credita o XP da missao recem-concluida e destrava as conquistas novas.

    Chamada por `concluir_missao` com a MISSAO JA TRAVADA e ja concluida (o
    `flush` da operacao ja aconteceu -- decisao P1 do plano). Tudo na mesma
    transacao da conclusao (D3): se algo falhar, a missao nao fica concluida.
    """
    _travar_usuario(session, missao.user_id)
    entrada = _inserir_lancamento(session, missao, agora)
    satisfeitas = conquistas_satisfeitas(_fatos(session, missao.user_id))
    ja = set(
        session.scalars(
            select(UserAchievement.code).where(
                UserAchievement.user_id == missao.user_id
            )
        )
    )
    for conquista in CATALOGO:
        if conquista.codigo in satisfeitas and conquista.codigo not in ja:
            session.add(
                UserAchievement(
                    user_id=missao.user_id,
                    code=conquista.codigo,
                    unlocked_at=agora,
                    xp_entry_id=entrada.id,
                )
            )
    session.flush()


def _travar_usuario(session: Session, user_id: int) -> None:
    """FOR NO KEY UPDATE na linha do usuario (D12, P2), sempre DEPOIS da missao.

    Serializa duas conclusoes do mesmo usuario -- a avaliacao das conquistas
    acontece uma de cada vez -- sem bloquear o FOR KEY SHARE que todo INSERT
    com chave estrangeira para `users` toma.
    """
    session.execute(
        select(User.id).where(User.id == user_id).with_for_update(key_share=True)
    ).one()


def _inserir_lancamento(session: Session, missao: Mission, agora: datetime) -> XpEntry:
    entrada = XpEntry(
        user_id=missao.user_id,
        mission_id=missao.id,
        amount=xp_da_missao(missao.mission_type, missao.difficulty),
        source=FONTE_CONCLUSAO,
        credited_at=agora,
    )
    session.add(entrada)
    session.flush()
    return entrada


def _fatos(session: Session, user_id: int) -> FatosDoUsuario:
    concluidas = session.scalar(
        select(func.count())
        .select_from(Mission)
        .where(Mission.user_id == user_id, Mission.state == MissionState.CONCLUIDA)
    )
    da_kairya = session.scalar(
        select(func.count())
        .select_from(TutorAction)
        .join(Mission, Mission.id == TutorAction.mission_id)
        .where(
            Mission.user_id == user_id,
            Mission.state == MissionState.CONCLUIDA,
            TutorAction.kind == TipoDeAcao.CRIAR_MISSAO,
            TutorAction.state == EstadoDaAcao.EXECUTADA,
        )
    )
    return FatosDoUsuario(
        missoes_concluidas=concluidas or 0,
        maior_sequencia=maior_sequencia(carregar_historico(session, user_id)),
        concluiu_missao_da_kairya=bool(da_kairya),
    )


def recompensa_da_missao(session: Session, missao: Mission) -> Recompensa:
    """A recompensa da conclusao de `missao`, reconstruida do banco (D10).

    Um caminho so para o primeiro envio e para o reenvio: o corpo do reenvio
    e identico ao original POR CONSTRUCAO. O `xp_total` e o saldo DAQUELE
    momento -- a soma dos lancamentos anteriores a este mais ele --, nao o
    atual.
    """
    entrada = session.scalars(
        select(XpEntry).where(
            XpEntry.mission_id == missao.id, XpEntry.source == FONTE_CONCLUSAO
        )
    ).one()
    antes = _saldo_antes(session, entrada)
    codigos = set(
        session.scalars(
            select(UserAchievement.code).where(
                UserAchievement.xp_entry_id == entrada.id
            )
        )
    )
    derivadas = _anunciadas_pela_missao(
        session,
        missao,
        {CodigoDerivado.WEEKLY_TRIAL, CodigoDerivado.COMEBACK},
    )
    total = antes + entrada.amount
    return Recompensa(
        xp_awarded=entrada.amount,
        xp_total=total,
        level_before=nivel_do_saldo(antes),
        level_after=nivel_do_saldo(total),
        achievements_unlocked=_no_painel(codigos | derivadas),
    )


def registrar_bonus(
    session: Session, missao: Mission, veredito: Veredito, agora: datetime
) -> None:
    """O bonus da avaliacao (E7), na transacao que grava o veredito, com a
    missao ja travada; trava o usuario depois dela (D12). Nao avalia conquistas:
    nenhum fato do catalogo PERSISTIDO muda com o bonus (E15); a `first_pass`
    e derivada na leitura e nasce da avaliacao, nao daqui."""
    valor = bonus_da_avaliacao(
        veredito, xp_da_missao(missao.mission_type, missao.difficulty)
    )
    if valor == 0:
        return
    _travar_usuario(session, missao.user_id)
    session.add(
        XpEntry(
            user_id=missao.user_id,
            mission_id=missao.id,
            amount=valor,
            source=FONTE_BONUS,
            credited_at=agora,
        )
    )
    session.flush()


def recompensa_do_bonus(session: Session, missao: Mission) -> Recompensa | None:
    """O bonus reconstruido do banco (o desenho da D10), ou None sem bonus.

    Como `recompensa_da_missao`: o `xp_total` e o saldo DAQUELE momento, e o
    pedido repetido devolve o mesmo corpo por construcao. So anuncia a
    `first_pass` (R5, R7): o bonus nao destrava nenhuma conquista persistida (E15).
    """
    entrada = session.scalars(
        select(XpEntry).where(
            XpEntry.mission_id == missao.id, XpEntry.source == FONTE_BONUS
        )
    ).one_or_none()
    if entrada is None:
        return None
    antes = _saldo_antes(session, entrada)
    derivadas = _anunciadas_pela_missao(session, missao, {CodigoDerivado.FIRST_PASS})
    total = antes + entrada.amount
    return Recompensa(
        xp_awarded=entrada.amount,
        xp_total=total,
        level_before=nivel_do_saldo(antes),
        level_after=nivel_do_saldo(total),
        achievements_unlocked=_no_painel(derivadas),
    )


def _no_painel(codigos: AbstractSet[str]) -> tuple[ConquistaDoPainel, ...]:
    """As conquistas de `codigos`, na ordem do painel."""
    return tuple(c for c in PAINEL if c.codigo in codigos)


def _anunciadas_pela_missao(
    session: Session, missao: Mission, candidatas: AbstractSet[CodigoDerivado]
) -> set[str]:
    """Os codigos derivados de `candidatas` cuja PRIMEIRA vez (R4-R6) foi
    causada por `missao`: so ela os anuncia, nunca a segunda especial nem a
    segunda avaliacao `atende`."""
    desbloqueios = _desbloqueios_derivados(session, missao.user_id)
    return {
        codigo.value
        for codigo in candidatas
        if codigo in desbloqueios and desbloqueios[codigo].mission_id == missao.id
    }


def _saldo_antes(session: Session, entrada: XpEntry) -> int:
    """A soma dos lancamentos do usuario anteriores a `entrada` (por `id`)."""
    antes = session.scalar(
        select(func.coalesce(func.sum(XpEntry.amount), 0)).where(
            XpEntry.user_id == entrada.user_id, XpEntry.id < entrada.id
        )
    )
    return antes or 0


def ler_progresso(session: Session, user_id: int) -> Progresso:
    """Saldo, faixa do nivel e o catalogo inteiro com a data ou nulo. So leitura."""
    # READ COMMITTED fixa um snapshot por comando. Duas consultas poderiam
    # combinar saldo anterior com conquistas de uma conclusao ja commitada.
    # O agregado sem GROUP BY e o LEFT JOIN preservam a linha sem conquistas;
    # somar antes da juncao evita multiplicar XP pelo numero de conquistas.
    saldo = (
        select(func.coalesce(func.sum(XpEntry.amount), 0).label("xp_total"))
        .where(XpEntry.user_id == user_id)
        .subquery()
    )
    linhas = session.execute(
        select(saldo.c.xp_total, UserAchievement.code, UserAchievement.unlocked_at)
        .select_from(saldo)
        .outerjoin(UserAchievement, UserAchievement.user_id == user_id)
    ).all()
    total = linhas[0].xp_total
    faixa = faixa_do_nivel(total)
    datas: dict[str, datetime] = {
        codigo: quando for _, codigo, quando in linhas if codigo is not None
    }
    # R8: as derivadas vem em comandos a parte, no mesmo request.
    datas |= {
        codigo.value: d.unlocked_at
        for codigo, d in _desbloqueios_derivados(session, user_id).items()
    }
    return Progresso(
        xp_total=total,
        faixa=faixa,
        rank=rank_do_nivel(faixa.nivel),
        conquistas=tuple(ConquistaNoPainel(c, datas.get(c.codigo)) for c in PAINEL),
    )


@dataclass(frozen=True)
class DesbloqueioDerivado:
    unlocked_at: datetime
    mission_id: int


def _desbloqueios_derivados(
    session: Session, user_id: int
) -> dict[CodigoDerivado, DesbloqueioDerivado]:
    """Quando e por qual missao cada conquista derivada foi ganha (R4-R6).

    Nunca gravadas: cada regra e uma consulta sobre fatos que ja existem, e o
    primeiro desbloqueio e estavel (as listas so crescem no fim).
    """
    achados: dict[CodigoDerivado, DesbloqueioDerivado] = {}

    # R5: a primeira avaliacao `atende`; o instante e o fim dela.
    avaliacao = session.execute(
        select(MissionEvaluation.finished_at, MissionEvaluation.mission_id)
        .join(Mission, Mission.id == MissionEvaluation.mission_id)
        .where(
            Mission.user_id == user_id,
            MissionEvaluation.state == EstadoDaAvaliacao.CONCLUIDA,
            MissionEvaluation.verdict == Veredito.ATENDE,
        )
        .order_by(MissionEvaluation.finished_at, MissionEvaluation.id)
        .limit(1)
    ).first()
    if avaliacao is not None:
        # O CHECK da avaliacao concluida garante o `finished_at`.
        achados[CodigoDerivado.FIRST_PASS] = DesbloqueioDerivado(
            cast(datetime, avaliacao.finished_at), avaliacao.mission_id
        )

    # R6: a primeira especial concluida.
    especial = session.execute(
        _concluidas_do_tipo(user_id, MissionType.ESPECIAL).limit(1)
    ).first()
    if especial is not None:
        achados[CodigoDerivado.WEEKLY_TRIAL] = DesbloqueioDerivado(
            cast(datetime, especial.completed_at), especial.id
        )

    # R4: a primeira diaria concluida depois de 3 dias planejados sem conclusao.
    diarias = session.execute(_concluidas_do_tipo(user_id, MissionType.DIARIA)).all()
    planejados = {
        dia
        for dia, estado in carregar_historico(session, user_id).items()
        if dia >= estado.plano_criado_em
    }
    volta = indice_da_volta(
        [dia_de(cast(datetime, d.completed_at)) for d in diarias], planejados
    )
    if volta is not None:
        achados[CodigoDerivado.COMEBACK] = DesbloqueioDerivado(
            cast(datetime, diarias[volta].completed_at), diarias[volta].id
        )
    return achados


def _concluidas_do_tipo(
    user_id: int, tipo: MissionType
) -> Select[int, datetime | None]:
    """As missoes concluidas do usuario do tipo, da mais antiga a mais nova."""
    return (
        select(Mission.id, Mission.completed_at)
        .where(
            Mission.user_id == user_id,
            Mission.mission_type == tipo,
            Mission.state == MissionState.CONCLUIDA,
            # `missions` nao tem CHECK de `completed_at` na concluida: o filtro
            # e o que sustenta os `cast` de quem le a coluna.
            Mission.completed_at.is_not(None),
        )
        .order_by(Mission.completed_at, Mission.id)
    )
