"""O credito na conclusao, a recompensa reconstruida e a leitura (spec, "Servico")."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
)
from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    MissionState,
    MissionType,
    Veredito,
    xp_da_missao,
)
from focusquest.modules.missions.models import Mission, MissionEvaluation, User
from focusquest.modules.missions.service import (
    concluir_missao,
    criar_missao,
    iniciar_missao,
)
from focusquest.modules.progression.domain import PAINEL, Codigo, FaixaDoNivel
from focusquest.modules.progression.models import UserAchievement, XpEntry
from focusquest.modules.progression.service import (
    ler_progresso,
    recompensa_da_missao,
    recompensa_do_bonus,
    registrar_bonus,
)
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


def _acao_da_kairya(
    session: Session, *, cid: str, missao: Mission | None, estado: EstadoDaAcao
) -> TutorAction:
    """Cria a mensagem e a acao da Kairya, como `test_tutoring_acoes.py` faz."""
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


def test_kairya_partnership_so_com_create_mission_executada(session: Session) -> None:
    proposta = _acao_da_kairya(
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
    assert Codigo.KAIRYA_PARTNERSHIP.value not in ainda_sem

    # A acao executada criou a missao, mas ela ainda esta PENDENTE: concluir
    # OUTRA avulsa nao pode destravar a parceria (guarda Mission.state).
    pendente_da_kairya = _avulsa(session)
    _acao_da_kairya(
        session,
        cid="c-pendente",
        missao=pendente_da_kairya,
        estado=EstadoDaAcao.EXECUTADA,
    )
    _concluir(session, _avulsa(session))
    com_a_pendente = set(
        session.scalars(
            select(UserAchievement.code).where(UserAchievement.user_id == ESTUDANTE)
        )
    )
    assert pendente_da_kairya.state is MissionState.PENDENTE
    assert Codigo.KAIRYA_PARTNERSHIP.value not in com_a_pendente

    missao_da_kairya = _avulsa(session)
    _acao_da_kairya(
        session,
        cid="c-executada",
        missao=missao_da_kairya,
        estado=EstadoDaAcao.EXECUTADA,
    )
    _concluir(session, missao_da_kairya)
    depois = set(
        session.scalars(
            select(UserAchievement.code).where(UserAchievement.user_id == ESTUDANTE)
        )
    )
    assert Codigo.KAIRYA_PARTNERSHIP.value in depois


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
        c.codigo for c in PAINEL
    ]
    assert all(c.unlocked_at is None for c in progresso.conquistas)


def test_ler_progresso_com_conquistas_traz_a_data(session: Session) -> None:
    _concluir(session, _avulsa(session))
    progresso = ler_progresso(session, ESTUDANTE)
    por_codigo = {c.conquista.codigo: c.unlocked_at for c in progresso.conquistas}
    assert por_codigo[Codigo.FIRST_STEPS] == AGORA
    presentes = [codigo for codigo, quando in por_codigo.items() if quando is not None]
    assert presentes == [Codigo.FIRST_STEPS]


# --- As conquistas derivadas na leitura (F5, Tarefa 5.2) -------------------

SEMANA_1 = date(2026, 9, 21)
SEMANA_2 = date(2026, 9, 28)


def _datas_do_painel(session: Session, user_id: int = ESTUDANTE) -> dict[str, Any]:
    return {
        c.conquista.codigo.value: c.unlocked_at
        for c in ler_progresso(session, user_id).conquistas
    }


def _codigos(recompensa: Any) -> set[str]:
    return {c.codigo.value for c in recompensa.achievements_unlocked}


def _especial(session: Session, semana: date) -> Mission:
    return session.scalars(
        select(Mission).where(
            Mission.mission_type == MissionType.ESPECIAL,
            Mission.plan_id == _diaria(session, semana).plan_id,
        )
    ).one()


def _semana_completa(session: Session, semana: date) -> Mission:
    """Plano da semana, as sete diarias e a especial, tudo concluido."""
    _plano(session, semana=semana, criado=semana)
    for i in range(7):
        dia = semana + timedelta(days=i)
        _concluir(session, _diaria(session, dia), instante=ao_meio_dia(dia))
    marco = semana + timedelta(days=6)
    return _concluir(session, _especial(session, semana), instante=ao_meio_dia(marco))


def _avaliar(
    session: Session, missao: Mission, veredito: Veredito, quando: datetime
) -> None:
    session.add(
        MissionEvaluation(
            mission_id=missao.id,
            state=EstadoDaAvaliacao.CONCLUIDA,
            attempt=1,
            verdict=veredito,
            feedback="Avaliacao de teste.",
            model="modelo-falso",
            requested_at=quando,
            finished_at=quando,
        )
    )
    session.flush()


def test_weekly_trial_destrava_na_primeira_especial(session: Session) -> None:
    primeira = _semana_completa(session, SEMANA_1)
    assert primeira.completed_at is not None
    assert _datas_do_painel(session)["weekly_trial"] == primeira.completed_at
    assert "weekly_trial" in _codigos(recompensa_da_missao(session, primeira))

    segunda = _semana_completa(session, SEMANA_2)
    assert "weekly_trial" not in _codigos(recompensa_da_missao(session, segunda))
    assert _datas_do_painel(session)["weekly_trial"] == primeira.completed_at


def _concluir_a_volta(session: Session, ultimo_dia_concluido: int) -> Mission:
    """Plano criado na segunda; diaria de segunda concluida; terca a quinta
    sem conclusao; conclui a diaria do dia `ultimo_dia_concluido`."""
    _plano(session, semana=SEMANA_1, criado=SEMANA_1)
    _concluir(session, _diaria(session, SEMANA_1), instante=ao_meio_dia(SEMANA_1))
    dia = SEMANA_1 + timedelta(days=ultimo_dia_concluido)
    return _concluir(session, _diaria(session, dia), instante=ao_meio_dia(dia))


def test_comeback_com_tres_dias_sem_conclusao(session: Session) -> None:
    sexta = _concluir_a_volta(session, 4)
    assert _datas_do_painel(session)["comeback"] == ao_meio_dia(
        SEMANA_1 + timedelta(days=4)
    )
    assert "comeback" in _codigos(recompensa_da_missao(session, sexta))


def test_comeback_com_dois_dias_sem_conclusao_nao_ganha(session: Session) -> None:
    quinta = _concluir_a_volta(session, 3)
    assert _datas_do_painel(session)["comeback"] is None
    assert "comeback" not in _codigos(recompensa_da_missao(session, quinta))


def test_comeback_nao_e_revogado_pela_conclusao_tardia_de_ontem(
    session: Session,
) -> None:
    _plano(session, semana=SEMANA_1, criado=SEMANA_1)
    segunda, quinta, sexta = (SEMANA_1 + timedelta(days=i) for i in (0, 3, 4))
    _concluir(session, _diaria(session, segunda), instante=ao_meio_dia(segunda))
    diaria_de_quinta = _diaria(session, quinta)
    iniciar_missao(
        session,
        ESTUDANTE,
        diaria_de_quinta.id,
        "ini-quinta",
        clock=relogio(ao_meio_dia(quinta)),
    )
    sexta_10h = datetime(sexta.year, sexta.month, sexta.day, 13, tzinfo=UTC)
    sexta_18h = sexta_10h + timedelta(hours=8)
    diaria_de_sexta = _concluir(session, _diaria(session, sexta), instante=sexta_10h)
    antes = recompensa_da_missao(session, diaria_de_sexta)
    assert "comeback" in _codigos(antes)

    _concluir(session, diaria_de_quinta, instante=sexta_18h)

    assert _datas_do_painel(session)["comeback"] == sexta_10h
    assert recompensa_da_missao(session, diaria_de_sexta) == antes


def test_comeback_ignora_avulsa_concluida_no_intervalo(session: Session) -> None:
    """R4: so diarias contam. Sem o filtro de tipo, a avulsa de quarta partiria
    o intervalo em dois de um dia so e a volta sumiria."""
    _plano(session, semana=SEMANA_1, criado=SEMANA_1)
    quarta = SEMANA_1 + timedelta(days=2)
    sexta = SEMANA_1 + timedelta(days=4)
    _concluir(session, _diaria(session, SEMANA_1), instante=ao_meio_dia(SEMANA_1))
    _concluir(session, _avulsa(session), instante=ao_meio_dia(quarta))
    diaria_de_sexta = _concluir(
        session, _diaria(session, sexta), instante=ao_meio_dia(sexta)
    )
    assert _datas_do_painel(session)["comeback"] == ao_meio_dia(sexta)
    assert "comeback" in _codigos(recompensa_da_missao(session, diaria_de_sexta))


@pytest.mark.parametrize("hora_utc", [1, 2])
def test_comeback_usa_o_dia_de_sao_paulo_e_nao_o_de_utc(
    session: Session, hora_utc: int
) -> None:
    """Fuso (America/Sao_Paulo, UTC-3): a diaria de segunda concluida as 22h ou
    23h de segunda em SP e de terca em UTC. Em SP sobram terca, quarta e quinta
    (3 dias: ganha); em UTC sobrariam so quarta e quinta (2 dias: nao ganha)."""
    _plano(session, semana=SEMANA_1, criado=SEMANA_1)
    terca = SEMANA_1 + timedelta(days=1)
    sexta = SEMANA_1 + timedelta(days=4)
    segunda_a_noite = datetime(terca.year, terca.month, terca.day, hora_utc, tzinfo=UTC)
    _concluir(session, _diaria(session, SEMANA_1), instante=segunda_a_noite)
    _concluir(session, _diaria(session, sexta), instante=ao_meio_dia(sexta))
    assert _datas_do_painel(session)["comeback"] == ao_meio_dia(sexta)


@pytest.mark.parametrize("hora_utc", [1, 2])
def test_comeback_nao_nasce_de_conclusao_da_noite_em_sao_paulo(
    session: Session, hora_utc: int
) -> None:
    """O espelho: a diaria de quinta concluida as 22h ou 23h de quinta em SP e
    de sexta em UTC. Em SP so sobram terca e quarta (2 dias: nao ganha); em UTC
    sobrariam terca, quarta e quinta (3 dias) e a volta nasceria errada."""
    _plano(session, semana=SEMANA_1, criado=SEMANA_1)
    quinta = SEMANA_1 + timedelta(days=3)
    sexta = SEMANA_1 + timedelta(days=4)
    quinta_a_noite = datetime(sexta.year, sexta.month, sexta.day, hora_utc, tzinfo=UTC)
    _concluir(session, _diaria(session, SEMANA_1), instante=ao_meio_dia(SEMANA_1))
    _concluir(session, _diaria(session, quinta), instante=quinta_a_noite)
    assert _datas_do_painel(session)["comeback"] is None


def test_dia_sem_plano_nao_conta_como_dia_sem_conclusao(session: Session) -> None:
    _plano(session, semana=SEMANA_1, criado=SEMANA_1)
    sexta = SEMANA_1 + timedelta(days=4)
    _concluir(session, _diaria(session, sexta), instante=ao_meio_dia(sexta))
    # A semana seguinte fica sem plano; o plano da outra nasce numa quinta.
    semana_3 = SEMANA_1 + timedelta(days=14)
    quinta = semana_3 + timedelta(days=3)
    _plano(session, semana=semana_3, criado=quinta)
    _concluir(session, _diaria(session, quinta), instante=ao_meio_dia(quinta))
    assert _datas_do_painel(session)["comeback"] is None


def test_sem_conclusao_anterior_nao_ha_volta(session: Session) -> None:
    _plano(session, semana=SEMANA_1, criado=SEMANA_1)
    sexta = SEMANA_1 + timedelta(days=4)
    _concluir(session, _diaria(session, sexta), instante=ao_meio_dia(sexta))
    assert _datas_do_painel(session)["comeback"] is None


def test_first_pass_na_primeira_avaliacao_atende(session: Session) -> None:
    parcial, atende = _avulsa(session), _avulsa(session)
    _concluir(session, parcial)
    _concluir(session, atende)
    _avaliar(session, parcial, Veredito.PARCIAL, AGORA)
    assert _datas_do_painel(session)["first_pass"] is None

    quando = AGORA + timedelta(hours=1)
    _avaliar(session, atende, Veredito.ATENDE, quando)
    assert _datas_do_painel(session)["first_pass"] == quando
    registrar_bonus(session, atende, Veredito.ATENDE, quando)
    recompensa = recompensa_do_bonus(session, atende)
    assert recompensa is not None
    assert _codigos(recompensa) == {"first_pass"}


def test_derivadas_so_anunciam_a_primeira_vez(session: Session) -> None:
    primeira = _avulsa(session)
    segunda = _avulsa(session)
    _concluir(session, primeira)
    _concluir(session, segunda)
    _avaliar(session, primeira, Veredito.ATENDE, AGORA)
    _avaliar(session, segunda, Veredito.ATENDE, AGORA + timedelta(hours=1))
    registrar_bonus(session, segunda, Veredito.ATENDE, AGORA)
    recompensa = recompensa_do_bonus(session, segunda)
    assert recompensa is not None
    assert recompensa.achievements_unlocked == ()
    assert _datas_do_painel(session)["first_pass"] == AGORA

    registrar_bonus(session, primeira, Veredito.ATENDE, AGORA)
    anunciada = recompensa_do_bonus(session, primeira)
    assert anunciada is not None
    assert _codigos(anunciada) == {"first_pass"}


def test_derivadas_contam_so_o_usuario(session: Session) -> None:
    _registrar_outro_usuario(session)
    semana_a, semana_b = date(2026, 9, 7), date(2026, 9, 14)
    # O estudante tem plano nos mesmos dias do outro, sem concluir nada: sem o
    # filtro de dono nas diarias concluidas, a volta do OUTRO apareceria aqui.
    _plano(session, semana=semana_b, criado=semana_b)
    for semana in (semana_a, semana_b):
        criar_plano(
            session,
            user_id=OUTRO,
            semana=semana,
            diarias=[NovaDiaria(f"D{i}", "c", 1, 30) for i in range(7)],
            especial=NovaEspecial("E", "c", 60),
            clock=relogio(ao_meio_dia(semana)),
        )

    def concluir_do_outro(missao: Mission, instante: datetime) -> Mission:
        return concluir_missao(
            session, OUTRO, missao.id, f"op-outro-{missao.id}", clock=relogio(instante)
        )

    def diaria_do_outro(dia: date) -> Mission:
        return session.scalars(
            select(Mission).where(
                Mission.user_id == OUTRO,
                Mission.mission_type == MissionType.DIARIA,
                Mission.day == dia,
            )
        ).one()

    for i in range(7):
        dia = semana_a + timedelta(days=i)
        concluir_do_outro(diaria_do_outro(dia), ao_meio_dia(dia))
    especial = session.scalars(
        select(Mission).where(
            Mission.user_id == OUTRO,
            Mission.mission_type == MissionType.ESPECIAL,
            Mission.plan_id == diaria_do_outro(semana_a).plan_id,
        )
    ).one()
    concluir_do_outro(especial, ao_meio_dia(semana_a + timedelta(days=6)))
    for i in (0, 4):
        dia = semana_b + timedelta(days=i)
        concluir_do_outro(diaria_do_outro(dia), ao_meio_dia(dia))
    alheia = criar_missao(
        session,
        user_id=OUTRO,
        instructions="Missao alheia",
        completion_criterion="Nao e da sua conta",
        difficulty=1,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=30),
    )
    concluir_do_outro(alheia, AGORA)
    _avaliar(session, alheia, Veredito.ATENDE, AGORA)

    assert all(
        v is not None
        for k, v in _datas_do_painel(session, OUTRO).items()
        if k in {"first_pass", "weekly_trial", "comeback"}
    )
    _concluir(session, _avulsa(session))
    datas = _datas_do_painel(session)
    assert [datas[k] for k in ("first_pass", "weekly_trial", "comeback")] == [None] * 3


def test_as_derivadas_nunca_sao_gravadas(session: Session) -> None:
    _semana_completa(session, SEMANA_1)
    # Semana 2: segunda e sexta concluidas, terca a quinta sem conclusao.
    _plano(session, semana=SEMANA_2, criado=SEMANA_2)
    for i in (0, 4):
        dia = SEMANA_2 + timedelta(days=i)
        _concluir(session, _diaria(session, dia), instante=ao_meio_dia(dia))
    avulsa = _avulsa(session)
    _concluir(session, avulsa)
    _avaliar(session, avulsa, Veredito.ATENDE, AGORA)
    registrar_bonus(session, avulsa, Veredito.ATENDE, AGORA)

    datas = _datas_do_painel(session)
    assert all(datas[k] is not None for k in ("first_pass", "weekly_trial", "comeback"))
    gravadas = set(session.scalars(select(UserAchievement.code)))
    assert not gravadas & {"first_pass", "weekly_trial", "comeback"}
