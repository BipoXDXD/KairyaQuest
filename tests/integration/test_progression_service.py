"""O credito na conclusao, a recompensa reconstruida e a leitura (spec, "Servico")."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
)
from focusquest.modules.missions.domain import MissionType, xp_da_missao
from focusquest.modules.missions.models import Mission, User
from focusquest.modules.missions.service import concluir_missao, criar_missao
from focusquest.modules.progression.domain import CATALOGO, Codigo, FaixaDoNivel
from focusquest.modules.progression.models import UserAchievement, XpEntry
from focusquest.modules.progression.service import ler_progresso, recompensa_da_missao
from focusquest.modules.tutoring.domain import (
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage

ESTUDANTE = 1
OUTRO = 2
AGORA = datetime(2026, 9, 21, 15, tzinfo=UTC)


def relogio(instante: datetime) -> Callable[[], datetime]:
    return lambda: instante


def ao_meio_dia(dia: date) -> datetime:
    return datetime(dia.year, dia.month, dia.day, 15, tzinfo=UTC)


def _avulsa(session: Session, dificuldade: int = 2) -> Mission:
    return criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo entregue",
        difficulty=dificuldade,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=30),
    )


def _concluir(session: Session, missao: Mission, instante: datetime = AGORA) -> Mission:
    return concluir_missao(
        session, ESTUDANTE, missao.id, f"op-{missao.id}", clock=relogio(instante)
    )


def _plano(session: Session, *, semana: date, criado: date) -> None:
    criar_plano(
        session,
        user_id=ESTUDANTE,
        semana=semana,
        diarias=[NovaDiaria(f"D{i}", "c", 1, 30) for i in range(7)],
        especial=NovaEspecial("E", "c", 60),
        clock=relogio(ao_meio_dia(criado)),
    )


def _diaria(session: Session, dia: date) -> Mission:
    return session.scalars(
        select(Mission).where(
            Mission.mission_type == MissionType.DIARIA, Mission.day == dia
        )
    ).one()


def _registrar_outro_usuario(session: Session) -> None:
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()


def _acao_da_tifa(
    session: Session, *, cid: str, missao: Mission | None, estado: EstadoDaAcao
) -> TutorAction:
    """Cria a mensagem e a acao da Tifa, como `test_tutoring_acoes.py` faz."""
    pergunta = TutorMessage(
        user_id=ESTUDANTE,
        role=Papel.USUARIO,
        content="me da uma missao",
        status=StatusDaMensagem.COMPLETA,
        client_message_id=cid,
        created_at=AGORA,
    )
    session.add(pergunta)
    session.flush()
    resposta = TutorMessage(
        user_id=ESTUDANTE,
        role=Papel.TUTORA,
        content="toma",
        status=StatusDaMensagem.COMPLETA,
        reply_to_id=pergunta.id,
        created_at=AGORA,
    )
    session.add(resposta)
    session.flush()
    campos: dict[str, Any] = {
        "message_id": resposta.id,
        "kind": TipoDeAcao.CRIAR_MISSAO,
        "payload": {},
        "state": estado,
        "created_at": AGORA,
    }
    if estado is not EstadoDaAcao.PROPOSTA:
        campos["decided_at"] = AGORA
    if missao is not None:
        campos["mission_id"] = missao.id
    acao = TutorAction(**campos)
    session.add(acao)
    session.flush()
    return acao


def test_concluir_avulsa_lanca_o_xp_congelado_e_destrava_first_steps(
    session: Session,
) -> None:
    missao = _concluir(session, _avulsa(session, dificuldade=3))
    entrada = session.scalars(
        select(XpEntry).where(XpEntry.mission_id == missao.id)
    ).one()
    assert (entrada.amount, entrada.source, entrada.credited_at) == (
        80,
        "mission_completed",
        AGORA,
    )
    recompensa = recompensa_da_missao(session, missao)
    assert recompensa.xp_awarded == 80
    assert recompensa.xp_total == 80
    assert (recompensa.level_before, recompensa.level_after) == (1, 1)
    assert [c.codigo for c in recompensa.achievements_unlocked] == [Codigo.FIRST_STEPS]


def test_a_especial_lanca_660(session: Session) -> None:
    semana = date(2026, 9, 21)
    _plano(session, semana=semana, criado=semana)
    for i in range(7):
        dia = semana + timedelta(days=i)
        _concluir(session, _diaria(session, dia), instante=ao_meio_dia(dia))
    especial = session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)
    ).one()
    marco = semana + timedelta(days=6)
    missao = _concluir(session, especial, instante=ao_meio_dia(marco))
    entrada = session.scalars(
        select(XpEntry).where(XpEntry.mission_id == missao.id)
    ).one()
    assert entrada.amount == 660


def test_reenvio_antigo_devolve_a_recompensa_daquele_momento(session: Session) -> None:
    a = _concluir(session, _avulsa(session, dificuldade=5))
    recompensa_antes = recompensa_da_missao(session, a)

    _concluir(session, _avulsa(session, dificuldade=3))
    reenvio = _concluir(session, a)
    recompensa_depois = recompensa_da_missao(session, reenvio)

    assert recompensa_antes == recompensa_depois
    assert recompensa_depois.xp_total == 220
    assert (recompensa_depois.level_before, recompensa_depois.level_after) == (1, 2)
    assert [c.codigo for c in recompensa_depois.achievements_unlocked] == [
        Codigo.FIRST_STEPS
    ]

    contagem = session.scalar(
        select(func.count()).select_from(XpEntry).where(XpEntry.mission_id == a.id)
    )
    assert contagem == 1


def test_a_sequencia_quebrada_mantem_streak_7_e_o_xp(session: Session) -> None:
    semana1 = date(2026, 9, 14)
    semana2 = date(2026, 9, 21)
    _plano(session, semana=semana1, criado=semana1)
    _plano(session, semana=semana2, criado=semana2)

    for i in range(7):
        dia = semana1 + timedelta(days=i)
        _concluir(session, _diaria(session, dia), instante=ao_meio_dia(dia))

    # A segunda-feira da segunda semana fica sem concluir -- a sequencia quebra.
    terca = semana2 + timedelta(days=1)
    quarta = semana2 + timedelta(days=2)
    _concluir(session, _diaria(session, terca), instante=ao_meio_dia(terca))
    _concluir(session, _diaria(session, quarta), instante=ao_meio_dia(quarta))

    destravadas = set(
        session.scalars(
            select(UserAchievement.code).where(UserAchievement.user_id == ESTUDANTE)
        )
    )
    assert Codigo.STREAK_7.value in destravadas
    assert Codigo.STREAK_30.value not in destravadas

    total = session.scalar(
        select(func.coalesce(func.sum(XpEntry.amount), 0)).where(
            XpEntry.user_id == ESTUDANTE
        )
    )
    assert total == 9 * 20


def test_tifa_partnership_so_com_create_mission_executada(session: Session) -> None:
    proposta = _acao_da_tifa(
        session, cid="c-proposta", missao=None, estado=EstadoDaAcao.PROPOSTA
    )
    assert proposta.state is EstadoDaAcao.PROPOSTA
    missao_da_proposta = _avulsa(session)
    _concluir(session, missao_da_proposta)
    ainda_sem = set(
        session.scalars(
            select(UserAchievement.code).where(UserAchievement.user_id == ESTUDANTE)
        )
    )
    assert Codigo.TIFA_PARTNERSHIP.value not in ainda_sem

    missao_da_tifa = _avulsa(session)
    _acao_da_tifa(
        session, cid="c-executada", missao=missao_da_tifa, estado=EstadoDaAcao.EXECUTADA
    )
    _concluir(session, missao_da_tifa)
    depois = set(
        session.scalars(
            select(UserAchievement.code).where(UserAchievement.user_id == ESTUDANTE)
        )
    )
    assert Codigo.TIFA_PARTNERSHIP.value in depois


def test_fatos_contam_so_o_usuario(session: Session) -> None:
    """As conclusoes de OUTRO usuario nao contam para o veterano do
    estudante: nove missoes alheias mais a primeira DO ESTUDANTE somam dez
    GLOBALMENTE, mas o estudante mesmo tem so uma -- `veteran_10` nao pode
    destravar so por causa do total alheio."""
    _registrar_outro_usuario(session)
    for i in range(9):
        alheia = criar_missao(
            session,
            user_id=OUTRO,
            instructions=f"Missao alheia {i}",
            completion_criterion="Nao e da sua conta",
            difficulty=1,
            estimated_minutes=30,
            deadline=AGORA + timedelta(days=30),
        )
        concluir_missao(
            session, OUTRO, alheia.id, f"op-outro-{i}", clock=relogio(AGORA)
        )

    missao = _avulsa(session)
    _concluir(session, missao)

    destravadas = set(
        session.scalars(
            select(UserAchievement.code).where(UserAchievement.user_id == ESTUDANTE)
        )
    )
    assert Codigo.FIRST_STEPS.value in destravadas
    assert Codigo.VETERAN_10.value not in destravadas

    progresso = ler_progresso(session, ESTUDANTE)
    assert progresso.xp_total == xp_da_missao(MissionType.AVULSA, 2)


def test_ler_progresso_sem_conclusoes(session: Session) -> None:
    progresso = ler_progresso(session, ESTUDANTE)
    assert progresso.xp_total == 0
    assert progresso.faixa == FaixaDoNivel(1, 0, 100)
    assert [c.conquista.codigo for c in progresso.conquistas] == [
        c.codigo for c in CATALOGO
    ]
    assert all(c.unlocked_at is None for c in progresso.conquistas)


def test_ler_progresso_com_conquistas_traz_a_data(session: Session) -> None:
    _concluir(session, _avulsa(session))
    progresso = ler_progresso(session, ESTUDANTE)
    por_codigo = {c.conquista.codigo: c.unlocked_at for c in progresso.conquistas}
    assert por_codigo[Codigo.FIRST_STEPS] == AGORA
    presentes = [codigo for codigo, quando in por_codigo.items() if quando is not None]
    assert presentes == [Codigo.FIRST_STEPS]
