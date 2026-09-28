"""Casos de uso da progressao: o credito na conclusao, a recompensa e a leitura.

Como em `missions.service`, nada aqui commita: quem abre a transacao a fecha.
Direcao unica (spec, "Servico"): este modulo LE modelos e regras de `missions`
e o modelo de acao da `tutoring`, e nao importa nenhum `service` delas.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from focusquest.modules.missions.cycle_service import carregar_historico
from focusquest.modules.missions.domain import MissionState, xp_da_missao
from focusquest.modules.missions.models import Mission, User
from focusquest.modules.progression.domain import (
    CATALOGO,
    CONQUISTA_POR_CODIGO,
    Codigo,
    Conquista,
    FaixaDoNivel,
    FatosDoUsuario,
    conquistas_satisfeitas,
    faixa_do_nivel,
    maior_sequencia,
    nivel_do_saldo,
)
from focusquest.modules.progression.models import (
    FONTE_CONCLUSAO,
    UserAchievement,
    XpEntry,
)
from focusquest.modules.tutoring.domain import EstadoDaAcao, TipoDeAcao
from focusquest.modules.tutoring.models import TutorAction


@dataclass(frozen=True)
class Recompensa:
    xp_awarded: int
    xp_total: int
    level_before: int
    level_after: int
    achievements_unlocked: tuple[Conquista, ...]


@dataclass(frozen=True)
class ConquistaNoPainel:
    conquista: Conquista
    unlocked_at: datetime | None


@dataclass(frozen=True)
class Progresso:
    xp_total: int
    faixa: FaixaDoNivel
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
                    code=conquista.codigo.value,
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
    da_tifa = session.scalar(
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
        concluiu_missao_da_tifa=bool(da_tifa),
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
    antes = session.scalar(
        select(func.coalesce(func.sum(XpEntry.amount), 0)).where(
            XpEntry.user_id == entrada.user_id, XpEntry.id < entrada.id
        )
    )
    codigos = set(
        session.scalars(
            select(UserAchievement.code).where(
                UserAchievement.xp_entry_id == entrada.id
            )
        )
    )
    total = (antes or 0) + entrada.amount
    return Recompensa(
        xp_awarded=entrada.amount,
        xp_total=total,
        level_before=nivel_do_saldo(antes or 0),
        level_after=nivel_do_saldo(total),
        achievements_unlocked=tuple(c for c in CATALOGO if c.codigo.value in codigos),
    )


def ler_progresso(session: Session, user_id: int) -> Progresso:
    """Saldo, faixa do nivel e o catalogo inteiro com a data ou nulo. So leitura."""
    total = session.scalar(
        select(func.coalesce(func.sum(XpEntry.amount), 0)).where(
            XpEntry.user_id == user_id
        )
    )
    datas = {
        Codigo(codigo): quando
        for codigo, quando in session.execute(
            select(UserAchievement.code, UserAchievement.unlocked_at).where(
                UserAchievement.user_id == user_id
            )
        ).tuples()
    }
    return Progresso(
        xp_total=total or 0,
        faixa=faixa_do_nivel(total or 0),
        conquistas=tuple(
            ConquistaNoPainel(CONQUISTA_POR_CODIGO[c.codigo], datas.get(c.codigo))
            for c in CATALOGO
        ),
    )
