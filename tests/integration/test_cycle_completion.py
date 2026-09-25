"""A ordem da conclusao do ciclo (spec, "Regras do ciclo", Ordem da conclusao):
trava, relogio, ocultacao, reenvio, regra do dia, transicao."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from focusquest.core.errors import MissaoExpiradaError, MissaoNaoEncontradaError
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
)
from focusquest.modules.missions.domain import (
    MissionState,
    MissionType,
    TransicaoIlegalError,
)
from focusquest.modules.missions.models import Mission, MissionOperation
from focusquest.modules.missions.service import (
    concluir_missao,
    criar_missao,
    listar_missoes,
)

ESTUDANTE = 1
SEGUNDA = date(2026, 9, 21)
QUARTA = SEGUNDA + timedelta(days=2)


def ao_meio_dia(dia: date) -> datetime:
    return datetime(dia.year, dia.month, dia.day, 15, tzinfo=UTC)


def relogio(instante: datetime) -> Callable[[], datetime]:
    return lambda: instante


def _plano(session: Session, semana: date = SEGUNDA, criado: date = QUARTA) -> None:
    criar_plano(
        session,
        user_id=ESTUDANTE,
        semana=semana,
        diarias=[NovaDiaria(f"D{i}", "c", 2, 30) for i in range(7)],
        especial=NovaEspecial("E", "c", 60),
        clock=relogio(ao_meio_dia(criado)),
    )


def _diaria(session: Session, dia: date) -> Mission:
    return session.scalars(
        select(Mission).where(
            Mission.mission_type == MissionType.DIARIA, Mission.day == dia
        )
    ).one()


def _concluir(
    session: Session, missao: Mission, operacao: str, agora: datetime
) -> Mission:
    return concluir_missao(
        session, ESTUDANTE, missao.id, operacao, clock=relogio(agora)
    )


def test_conclui_a_diaria_de_hoje(session: Session) -> None:
    _plano(session)
    missao = _concluir(session, _diaria(session, QUARTA), "op", ao_meio_dia(QUARTA))
    assert missao.state is MissionState.CONCLUIDA
    assert missao.completed_at == ao_meio_dia(QUARTA)


@pytest.mark.parametrize("dias_a_frente", [1, 7])
def test_diaria_ainda_nao_revelada_responde_como_inexistente(
    session: Session, dias_a_frente: int
) -> None:
    _plano(session)
    _plano(session, semana=SEGUNDA + timedelta(days=7))
    with pytest.raises(MissaoNaoEncontradaError):
        _concluir(
            session,
            _diaria(session, QUARTA + timedelta(days=dias_a_frente)),
            "op",
            ao_meio_dia(QUARTA),
        )


def test_especial_bloqueada_responde_como_inexistente(session: Session) -> None:
    _plano(session)
    especial = session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)
    ).one()
    with pytest.raises(MissaoNaoEncontradaError):
        _concluir(session, especial, "op", ao_meio_dia(QUARTA))


def test_diaria_de_ontem_esta_expirada(session: Session) -> None:
    _plano(session)
    with pytest.raises(MissaoExpiradaError):
        _concluir(
            session,
            _diaria(session, QUARTA),
            "op",
            ao_meio_dia(QUARTA + timedelta(days=1)),
        )


def test_dia_fora_do_plano_e_expirado(session: Session) -> None:
    """Plano criado na quarta: a segunda aparece, mas nao pode ser feita."""
    _plano(session)
    with pytest.raises(MissaoExpiradaError):
        _concluir(session, _diaria(session, SEGUNDA), "op", ao_meio_dia(QUARTA))


def test_reenvio_depois_da_meia_noite_devolve_a_mesma_conclusao(
    session: Session,
) -> None:
    _plano(session)
    diaria = _diaria(session, QUARTA)
    antes = datetime(2026, 9, 24, 2, 59, 59, tzinfo=UTC)  # quarta 23:59:59 em SP
    depois = datetime(2026, 9, 24, 3, 0, 1, tzinfo=UTC)  # quinta 00:00:01 em SP
    _concluir(session, diaria, "op-da-virada", antes)

    reenvio = _concluir(session, diaria, "op-da-virada", depois)

    assert reenvio.completed_at == antes
    operacoes = session.scalar(
        select(func.count())
        .select_from(MissionOperation)
        .where(MissionOperation.mission_id == diaria.id)
    )
    assert operacoes == 1


def test_operacao_nova_sobre_diaria_concluida_e_transicao_ilegal_em_qualquer_dia(
    session: Session,
) -> None:
    """ "Ja foi feita" informa melhor do que "expirou" (spec)."""
    _plano(session)
    diaria = _diaria(session, QUARTA)
    _concluir(session, diaria, "op-1", ao_meio_dia(QUARTA))
    with pytest.raises(TransicaoIlegalError):
        _concluir(session, diaria, "op-2", ao_meio_dia(QUARTA + timedelta(days=1)))


@pytest.mark.parametrize(
    "cenario",
    ["diaria_de_dia_futuro", "especial_bloqueada", "diaria_de_semana_seguinte"],
)
def test_a_ocultacao_vem_antes_do_reuso(session: Session, cenario: str) -> None:
    """Uma chave gasta em outra missao, mandada ao id de uma missao oculta, tem
    de dar o 404 de "nao existe" -- o 409 de reuso revelaria que ela existe.

    Testado nos tres jeitos de ocultacao que C11 preve: a diaria de um dia
    futuro NA MESMA semana, a especial ainda bloqueada (sem marco) e a diaria
    de uma semana futura, que so existe porque o plano dela ja foi criado.
    """
    _plano(session)
    avulsa = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="a",
        completion_criterion="c",
        difficulty=1,
        estimated_minutes=10,
        deadline=ao_meio_dia(QUARTA),
    )
    _concluir(session, avulsa, "op-gasta", ao_meio_dia(QUARTA))

    if cenario == "diaria_de_dia_futuro":
        missao_oculta = _diaria(session, QUARTA + timedelta(days=1))
    elif cenario == "especial_bloqueada":
        missao_oculta = session.scalars(
            select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)
        ).one()
    else:
        semana_seguinte = SEGUNDA + timedelta(days=7)
        _plano(session, semana=semana_seguinte)
        missao_oculta = session.scalars(
            select(Mission).where(
                Mission.mission_type == MissionType.DIARIA,
                Mission.day == semana_seguinte,
            )
        ).one()

    with pytest.raises(MissaoNaoEncontradaError):
        _concluir(session, missao_oculta, "op-gasta", ao_meio_dia(QUARTA))


def test_especial_fora_da_janela_esta_expirada(session: Session) -> None:
    _plano(session, criado=SEGUNDA)
    for i in range(7):
        dia = SEGUNDA + timedelta(days=i)
        _concluir(session, _diaria(session, dia), f"op-{i}", ao_meio_dia(dia))
    especial = session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)
    ).one()
    fechada = datetime(2026, 9, 29, 3, tzinfo=UTC)  # terca 00:00 em SP
    with pytest.raises(MissaoExpiradaError):
        _concluir(session, especial, "op-e", fechada)


def test_conclui_a_especial_dentro_da_janela(session: Session) -> None:
    """O caminho positivo que falta ao lado de `test_especial_fora_da_janela...`:
    a semana inteira concluida destrava a especial, e ela pode ser concluida
    de verdade -- estado e instante gravados, como qualquer outra missao."""
    _plano(session, criado=SEGUNDA)
    for i in range(7):
        dia = SEGUNDA + timedelta(days=i)
        _concluir(session, _diaria(session, dia), f"op-{i}", ao_meio_dia(dia))
    especial = session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)
    ).one()
    marco = SEGUNDA + timedelta(days=6)  # domingo: setima diaria seguida
    dentro_da_janela = ao_meio_dia(marco)
    missao = _concluir(session, especial, "op-especial", dentro_da_janela)
    assert missao.state is MissionState.CONCLUIDA
    assert missao.completed_at == dentro_da_janela


def test_a_avulsa_nao_tem_regra_de_dia(session: Session) -> None:
    """Prazo no passado nunca bloqueou a avulsa (desde o 1a) e continua sem bloquear."""
    avulsa = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="a",
        completion_criterion="c",
        difficulty=1,
        estimated_minutes=10,
        deadline=ao_meio_dia(SEGUNDA),
    )
    assert (
        _concluir(session, avulsa, "op", ao_meio_dia(QUARTA)).state
        is MissionState.CONCLUIDA
    )


def test_a_listagem_devolve_so_avulsas(session: Session) -> None:
    _plano(session)
    avulsa = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="a",
        completion_criterion="c",
        difficulty=1,
        estimated_minutes=10,
        deadline=ao_meio_dia(QUARTA),
    )
    assert [m.id for m in listar_missoes(session, ESTUDANTE)] == [avulsa.id]
