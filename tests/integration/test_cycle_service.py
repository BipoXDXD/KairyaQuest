"""Os casos de uso do ciclo contra PostgreSQL real, com relogio fixo."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.core.errors import (
    MissaoNaoEncontradaError,
    PlanoExistenteError,
    SemanaDistanteError,
    SemanaEncerradaError,
)
from focusquest.modules.missions.cycle_domain import Availability, fim_do_dia
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    PlanoLido,
    criar_plano,
    ler_ciclo,
    ler_missao,
    ler_plano_atual,
)
from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission, WeeklyPlan
from focusquest.modules.missions.service import (
    concluir_missao,
    criar_missao,
    iniciar_missao,
)

ESTUDANTE = 1
SEGUNDA = date(2026, 9, 21)
UMA_SEMANA = timedelta(days=7)


def ao_meio_dia(dia: date) -> datetime:
    """12:00 em Sao Paulo (15:00 UTC; SP nao tem horario de verao desde 2019)."""
    return datetime(dia.year, dia.month, dia.day, 15, tzinfo=UTC)


QUARTA_MEIO_DIA = ao_meio_dia(SEGUNDA + timedelta(days=2))


def relogio(instante: datetime) -> Callable[[], datetime]:
    return lambda: instante


def _diarias(quantas: int = 7) -> list[NovaDiaria]:
    return [
        NovaDiaria(f"Diaria {i}", f"Criterio {i}", difficulty=2, estimated_minutes=30)
        for i in range(quantas)
    ]


ESPECIAL = NovaEspecial("Prova simulada", "Nota registrada", estimated_minutes=120)


def _criar(
    session: Session, semana: date = SEGUNDA, agora: datetime = QUARTA_MEIO_DIA
) -> PlanoLido:
    return criar_plano(
        session,
        user_id=ESTUDANTE,
        semana=semana,
        diarias=_diarias(),
        especial=ESPECIAL,
        clock=relogio(agora),
    )


def _diaria_do_dia(session: Session, dia: date) -> Mission:
    return session.scalars(
        select(Mission).where(
            Mission.mission_type == MissionType.DIARIA, Mission.day == dia
        )
    ).one()


def _concluir_no_dia(session: Session, dia: date) -> None:
    concluir_missao(
        session,
        ESTUDANTE,
        _diaria_do_dia(session, dia).id,
        f"op-{dia}",
        clock=relogio(ao_meio_dia(dia)),
    )


def test_criar_grava_sete_diarias_e_uma_especial(session: Session) -> None:
    _criar(session)
    plano = session.scalars(select(WeeklyPlan)).one()
    missoes = session.scalars(select(Mission).where(Mission.plan_id == plano.id)).all()

    assert plano.created_at == QUARTA_MEIO_DIA
    diarias = sorted(
        (m for m in missoes if m.mission_type is MissionType.DIARIA),
        key=lambda m: m.day or SEGUNDA,
    )
    assert [m.day for m in diarias] == [SEGUNDA + timedelta(days=i) for i in range(7)]
    (especial,) = [m for m in missoes if m.mission_type is MissionType.ESPECIAL]
    assert especial.difficulty == 5
    assert especial.day is None
    assert all(m.deadline is None and m.state is MissionState.PENDENTE for m in missoes)


def test_o_plano_lido_revela_so_ate_hoje(session: Session) -> None:
    """Criado na quarta: segunda e terca `fora_do_plano` COM conteudo, quarta
    disponivel, quinta a domingo como bau fechado (sem missao)."""
    lido = _criar(session)

    assert [d.availability for d in lido.dias] == [
        Availability.FORA_DO_PLANO,
        Availability.FORA_DO_PLANO,
        Availability.DISPONIVEL,
        Availability.BLOQUEADA,
        Availability.BLOQUEADA,
        Availability.BLOQUEADA,
        Availability.BLOQUEADA,
    ]
    assert all(d.missao is not None for d in lido.dias[:3])
    assert all(d.missao is None for d in lido.dias[3:])
    quarta = lido.dias[2].missao
    assert quarta is not None
    assert quarta.deadline == fim_do_dia(SEGUNDA + timedelta(days=2))
    assert lido.especial.availability is Availability.BLOQUEADA
    assert lido.especial.missao is None
    assert lido.especial.progresso == 0


def test_plano_da_semana_seguinte_vem_todo_fechado(session: Session) -> None:
    lido = _criar(session, semana=SEGUNDA + UMA_SEMANA)
    assert all(
        d.availability is Availability.BLOQUEADA and d.missao is None for d in lido.dias
    )


def test_semana_alem_da_seguinte_e_distante(session: Session) -> None:
    with pytest.raises(SemanaDistanteError):
        _criar(session, semana=SEGUNDA + 2 * UMA_SEMANA)


def test_semana_passada_esta_encerrada(session: Session) -> None:
    with pytest.raises(SemanaEncerradaError):
        _criar(session, semana=SEGUNDA - UMA_SEMANA)


@pytest.mark.parametrize(
    ("agora", "aceita"),
    [
        # Domingo 27, 23:59:59 em SP: a semana de 21 ainda esta aberta.
        (datetime(2026, 9, 28, 2, 59, 59, tzinfo=UTC), True),
        # Segunda 28, 00:00 em SP: acabou.
        (datetime(2026, 9, 28, 3, 0, 0, tzinfo=UTC), False),
    ],
)
def test_a_semana_encerra_na_meia_noite_de_domingo(
    session: Session, agora: datetime, aceita: bool
) -> None:
    if aceita:
        _criar(session, agora=agora)
    else:
        with pytest.raises(SemanaEncerradaError):
            _criar(session, agora=agora)


def test_plano_repetido_e_recusado(session: Session) -> None:
    _criar(session)
    with pytest.raises(PlanoExistenteError):
        _criar(session)


def test_outra_violacao_nao_e_traduzida_como_plano_existente(session: Session) -> None:
    """Uma terca viola o CHECK da segunda-feira, e nao a UNIQUE: o erro sobe cru."""
    with pytest.raises(IntegrityError) as erro:
        _criar(session, semana=SEGUNDA + timedelta(days=1))
    assert "ck_weekly_plans_week_start_segunda" in str(erro.value.orig)


def test_plano_sem_sete_diarias_e_recusado_pelo_servico(session: Session) -> None:
    """Os 7 dias sao garantidos SO pelo servico (spec, Modelo de dados)."""
    with pytest.raises(ValueError, match="7 diarias"):
        criar_plano(
            session,
            user_id=ESTUDANTE,
            semana=SEGUNDA,
            diarias=_diarias(6),
            especial=ESPECIAL,
            clock=relogio(QUARTA_MEIO_DIA),
        )
    assert session.scalar(select(func.count()).select_from(WeeklyPlan)) == 0


def test_ler_plano_atual(session: Session) -> None:
    assert ler_plano_atual(session, ESTUDANTE, clock=relogio(QUARTA_MEIO_DIA)) is None
    _criar(session)
    lido = ler_plano_atual(session, ESTUDANTE, clock=relogio(QUARTA_MEIO_DIA))
    assert lido is not None
    assert lido.semana == SEGUNDA


def test_ciclo_sem_plano(session: Session) -> None:
    ciclo = ler_ciclo(session, ESTUDANTE, clock=relogio(QUARTA_MEIO_DIA))
    assert (
        ciclo.hoje,
        ciclo.missao,
        ciclo.sequencia,
        ciclo.dias_para_o_marco,
        ciclo.especial,
    ) == (
        SEGUNDA + timedelta(days=2),
        None,
        0,
        7,
        None,
    )


def test_ciclo_com_a_missao_de_hoje_antes_e_depois_de_concluir(
    session: Session,
) -> None:
    _criar(session)
    antes = ler_ciclo(session, ESTUDANTE, clock=relogio(QUARTA_MEIO_DIA))
    assert antes.missao is not None
    assert antes.missao.availability is Availability.DISPONIVEL

    _concluir_no_dia(session, SEGUNDA + timedelta(days=2))
    depois = ler_ciclo(session, ESTUDANTE, clock=relogio(QUARTA_MEIO_DIA))
    assert depois.missao is not None
    assert depois.missao.availability is Availability.CONCLUIDA
    assert (depois.sequencia, depois.dias_para_o_marco) == (1, 6)


def _semana_inteira(session: Session) -> None:
    """Plano criado na segunda, com as 7 diarias concluidas cada uma no seu dia."""
    _criar(session, agora=ao_meio_dia(SEGUNDA))
    for i in range(7):
        _concluir_no_dia(session, SEGUNDA + timedelta(days=i))


def test_a_especial_aparece_no_marco_e_fica_ate_o_fim_do_dia_seguinte(
    session: Session,
) -> None:
    _semana_inteira(session)
    domingo = SEGUNDA + timedelta(days=6)

    no_domingo = ler_ciclo(session, ESTUDANTE, clock=relogio(ao_meio_dia(domingo)))
    assert no_domingo.sequencia == 7
    assert no_domingo.especial is not None
    assert no_domingo.especial.availability is Availability.DISPONIVEL

    segunda_seguinte = ler_ciclo(
        session, ESTUDANTE, clock=relogio(ao_meio_dia(SEGUNDA + UMA_SEMANA))
    )
    assert segunda_seguinte.especial is not None

    # Terca 29, 00:00 em SP: a janela fechou, e `special` some do ciclo.
    fechada = ler_ciclo(
        session, ESTUDANTE, clock=relogio(datetime(2026, 9, 29, 3, tzinfo=UTC))
    )
    assert fechada.especial is None


def test_especial_concluida_aparece_como_concluida_dentro_da_janela(
    session: Session,
) -> None:
    _semana_inteira(session)
    domingo = SEGUNDA + timedelta(days=6)
    especial = session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)
    ).one()
    concluir_missao(
        session,
        ESTUDANTE,
        especial.id,
        "op-especial",
        clock=relogio(ao_meio_dia(domingo)),
    )

    ciclo = ler_ciclo(
        session, ESTUDANTE, clock=relogio(ao_meio_dia(SEGUNDA + UMA_SEMANA))
    )
    assert ciclo.especial is not None
    assert ciclo.especial.availability is Availability.CONCLUIDA


def test_marco_no_domingo_e_a_trilha_da_semana_seguinte_em_zero_de_sete(
    session: Session,
) -> None:
    """O "caso concreto" da spec: na segunda de S+1, o ciclo mostra a especial
    de S e a trilha de S+1 mostra o marcador em 0 de 7. As duas sao verdade."""
    _semana_inteira(session)
    segunda_seguinte = SEGUNDA + UMA_SEMANA
    _criar(session, semana=segunda_seguinte, agora=ao_meio_dia(segunda_seguinte))

    ciclo = ler_ciclo(session, ESTUDANTE, clock=relogio(ao_meio_dia(segunda_seguinte)))
    trilha = ler_plano_atual(
        session, ESTUDANTE, clock=relogio(ao_meio_dia(segunda_seguinte))
    )

    assert ciclo.especial is not None
    assert trilha is not None
    assert trilha.especial.availability is Availability.BLOQUEADA
    assert trilha.especial.progresso == 0


def test_a_trilha_mostra_a_especial_revelada_depois_do_marco(session: Session) -> None:
    _semana_inteira(session)
    trilha = ler_plano_atual(
        session, ESTUDANTE, clock=relogio(ao_meio_dia(SEGUNDA + timedelta(days=6)))
    )
    assert trilha is not None
    assert trilha.especial.availability is Availability.DISPONIVEL
    assert trilha.especial.missao is not None


def test_ler_diaria_futura_responde_como_inexistente(session: Session) -> None:
    _criar(session)
    with pytest.raises(MissaoNaoEncontradaError):
        ler_missao(
            session,
            _diaria_do_dia(session, SEGUNDA + timedelta(days=5)),
            QUARTA_MEIO_DIA,
        )


def test_ler_especial_bloqueada_responde_como_inexistente(session: Session) -> None:
    _criar(session)
    especial = session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)
    ).one()
    with pytest.raises(MissaoNaoEncontradaError):
        ler_missao(session, especial, QUARTA_MEIO_DIA)


def test_ler_missao_encaminha_a_avulsa_para_leitura_da_avulsa(session: Session) -> None:
    """`ler_missao` tambem atende a avulsa (o tipo do incremento 1a): o
    despacho por tipo cobre os tres, e nao so diaria e especial."""
    avulsa = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo entregue",
        difficulty=2,
        estimated_minutes=45,
        deadline=QUARTA_MEIO_DIA,
    )
    lida = ler_missao(session, avulsa, QUARTA_MEIO_DIA)
    assert (lida.deadline, lida.availability) == (
        QUARTA_MEIO_DIA,
        Availability.DISPONIVEL,
    )


def test_ler_especial_revelada_responde_pelo_mesmo_caminho_da_trilha(
    session: Session,
) -> None:
    """Depois do marco, `ler_missao` na especial devolve a leitura normal, e
    nao o 404 de nao revelada -- e o mesmo caso da trilha (Task 4 a usa)."""
    _semana_inteira(session)
    especial = session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)
    ).one()
    domingo = SEGUNDA + timedelta(days=6)
    lida = ler_missao(session, especial, ao_meio_dia(domingo))
    assert lida.availability is Availability.DISPONIVEL


# --- F25: conclusao tardia da missao iniciada a tempo ----------------------

QUARTA = SEGUNDA + timedelta(days=2)
QUINTA = SEGUNDA + timedelta(days=3)


def _as(dia: date, hora: int, minuto: int = 0) -> datetime:
    """`hora:minuto` em Sao Paulo (UTC-3) no `dia`."""
    return datetime(dia.year, dia.month, dia.day, tzinfo=UTC) + timedelta(
        hours=hora + 3, minutes=minuto
    )


def _iniciar_as(session: Session, missao: Mission, agora: datetime) -> None:
    iniciar_missao(
        session, ESTUDANTE, missao.id, f"op-i-{missao.id}", clock=relogio(agora)
    )


def test_o_ciclo_mostra_a_diaria_de_ontem_iniciada_a_tempo(session: Session) -> None:
    _criar(session)
    quarta = _diaria_do_dia(session, QUARTA)
    _iniciar_as(session, quarta, _as(QUARTA, 23, 50))

    madrugada = ler_ciclo(session, ESTUDANTE, clock=relogio(_as(QUINTA, 0, 10)))
    assert madrugada.missao is not None
    assert madrugada.missao.missao.day == QUINTA
    assert madrugada.diaria_de_ontem is not None
    assert madrugada.diaria_de_ontem.missao.id == quarta.id
    assert madrugada.diaria_de_ontem.availability is Availability.DISPONIVEL
    assert madrugada.diaria_de_ontem.deadline == fim_do_dia(QUARTA)

    concluir_missao(
        session, ESTUDANTE, quarta.id, "op-tardia", clock=relogio(_as(QUINTA, 0, 10))
    )
    # O refresh que segue a conclusao nao tira o cartao da tela.
    noite = ler_ciclo(session, ESTUDANTE, clock=relogio(_as(QUINTA, 23, 59)))
    assert noite.diaria_de_ontem is not None
    assert noite.diaria_de_ontem.availability is Availability.CONCLUIDA
    assert noite.sequencia == 1

    # Sexta: "ontem" e quinta, pendente -- nada tardio a mostrar.
    sexta = ler_ciclo(session, ESTUDANTE, clock=relogio(_as(QUINTA, 24, 0)))
    assert sexta.diaria_de_ontem is None


def test_a_diaria_de_ontem_sem_inicio_ou_feita_a_tempo_nao_aparece(
    session: Session,
) -> None:
    _criar(session)
    pendente = ler_ciclo(session, ESTUDANTE, clock=relogio(_as(QUINTA, 0, 10)))
    assert pendente.diaria_de_ontem is None

    _concluir_no_dia(session, QUARTA)
    a_tempo = ler_ciclo(session, ESTUDANTE, clock=relogio(_as(QUINTA, 0, 10)))
    assert a_tempo.diaria_de_ontem is None


def test_a_diaria_de_ontem_iniciada_a_tempo_perde_o_prazo_no_limite(
    session: Session,
) -> None:
    """Iniciada e nunca concluida: no limite (fim do dia seguinte) volta a ser
    perdida, na trilha, e some do Quartel-General."""
    _criar(session)
    _iniciar_as(session, _diaria_do_dia(session, QUARTA), _as(QUARTA, 23, 50))

    trilha = ler_plano_atual(session, ESTUDANTE, clock=relogio(_as(QUINTA, 23, 59)))
    assert trilha is not None
    assert trilha.dias[2].availability is Availability.DISPONIVEL

    depois = ler_plano_atual(session, ESTUDANTE, clock=relogio(_as(QUINTA, 24, 0)))
    assert depois is not None
    assert depois.dias[2].availability is Availability.PERDIDA


def test_a_diaria_de_domingo_iniciada_a_tempo_aparece_na_segunda(
    session: Session,
) -> None:
    """A virada da semana nao muda nada: "ontem" e o domingo da semana
    anterior."""
    _criar(session, agora=ao_meio_dia(SEGUNDA))
    domingo = _diaria_do_dia(session, SEGUNDA + timedelta(days=6))
    _iniciar_as(session, domingo, _as(SEGUNDA + timedelta(days=6), 23, 50))
    ciclo = ler_ciclo(
        session, ESTUDANTE, clock=relogio(_as(SEGUNDA + UMA_SEMANA, 0, 10))
    )
    assert ciclo.diaria_de_ontem is not None
    assert ciclo.diaria_de_ontem.missao.id == domingo.id


def test_a_especial_iniciada_na_janela_continua_no_ciclo_ate_o_limite(
    session: Session,
) -> None:
    """Marco no domingo 27: a janela fecha terca 29 00:00; iniciada na
    segunda as 23:50, a especial continua no ciclo ate quarta 30 00:00."""
    _semana_inteira(session)
    especial = session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)
    ).one()
    segunda_seguinte = SEGUNDA + UMA_SEMANA
    terca = segunda_seguinte + timedelta(days=1)
    _iniciar_as(session, especial, _as(segunda_seguinte, 23, 50))

    na_terca = ler_ciclo(session, ESTUDANTE, clock=relogio(_as(terca, 10)))
    assert na_terca.especial is not None
    assert na_terca.especial.availability is Availability.DISPONIVEL

    concluir_missao(
        session, ESTUDANTE, especial.id, "op-e-tardia", clock=relogio(_as(terca, 10))
    )
    assert especial.state is MissionState.CONCLUIDA
    concluida = ler_ciclo(session, ESTUDANTE, clock=relogio(_as(terca, 23, 59)))
    assert concluida.especial is not None
    assert concluida.especial.availability is Availability.CONCLUIDA

    no_limite = ler_ciclo(session, ESTUDANTE, clock=relogio(_as(terca, 24, 0)))
    assert no_limite.especial is None


def test_a_especial_iniciada_na_janela_e_nao_concluida_some_no_limite(
    session: Session,
) -> None:
    _semana_inteira(session)
    especial = session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)
    ).one()
    segunda_seguinte = SEGUNDA + UMA_SEMANA
    _iniciar_as(session, especial, _as(segunda_seguinte, 23, 50))
    no_limite = ler_ciclo(
        session,
        ESTUDANTE,
        clock=relogio(_as(segunda_seguinte + timedelta(days=1), 24, 0)),
    )
    assert no_limite.especial is None
