"""As restricoes do ciclo, no BANCO: cada teste afirma o NOME da restricao.

Mesmo motivo de `test_missions_models.py`: `IntegrityError` sozinho tambem
seria levantado por um NOT NULL esquecido, e o teste passaria provando outra
coisa. Cada caso viola UMA restricao so -- o PostgreSQL relata so uma.
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission, WeeklyPlan

ESTUDANTE = 1
SEGUNDA = date(2026, 9, 21)
CRIADO_EM = datetime(2026, 9, 21, 15, tzinfo=UTC)


def _plano(
    session: Session, user_id: int = ESTUDANTE, semana: date = SEGUNDA
) -> WeeklyPlan:
    plano = WeeklyPlan(user_id=user_id, week_start=semana, created_at=CRIADO_EM)
    session.add(plano)
    session.flush()
    return plano


def _missao(**campos: object) -> Mission:
    base: dict[str, object] = {
        "user_id": ESTUDANTE,
        "instructions": "Ler o capitulo 3",
        "completion_criterion": "Resumo entregue",
        "difficulty": 3,
        "estimated_minutes": 60,
        "state": MissionState.PENDENTE,
    }
    base.update(campos)
    return Mission(**base)


def _diaria(plano: WeeklyPlan, dia: date = SEGUNDA, **campos: object) -> Mission:
    return _missao(
        mission_type=MissionType.DIARIA,
        plan_id=plano.id,
        day=dia,
        deadline=None,
        **campos,
    )


def _recusa(session: Session, restricao: str) -> None:
    with pytest.raises(IntegrityError) as erro:
        session.flush()
    assert restricao in str(erro.value.orig)


def test_o_plano_comeca_numa_segunda(session: Session) -> None:
    session.add(
        WeeklyPlan(
            user_id=ESTUDANTE,
            week_start=SEGUNDA + timedelta(days=1),
            created_at=CRIADO_EM,
        )
    )
    _recusa(session, "ck_weekly_plans_week_start_segunda")


def test_um_plano_por_semana(session: Session) -> None:
    _plano(session)
    session.add(WeeklyPlan(user_id=ESTUDANTE, week_start=SEGUNDA, created_at=CRIADO_EM))
    _recusa(session, "uq_weekly_plans_user_id_week_start")


def test_tipo_invalido_e_recusado(session: Session) -> None:
    """So `ck_missions_mission_type` pode cair aqui: com `plan_id` do plano
    (satisfaz `ck_missions_plano_do_tipo`, que so exige avulsa <=> sem plano)
    e `deadline`/`day` nulos (satisfazem `ck_missions_prazo_do_tipo` e
    `ck_missions_dia_do_tipo`, que so exigem avulsa <=> tem prazo e
    diaria <=> tem dia -- 'semanal' nao e nenhum dos dois, entao as duas
    igualdades valem com o lado direito falso), a logica de tres valores
    do CHECK deixa toda restricao passar, exceto a do tipo em si."""
    plano = _plano(session)
    with pytest.raises(IntegrityError) as erro:
        session.execute(
            text(
                "INSERT INTO missions (user_id, instructions, completion_criterion, "
                "difficulty, estimated_minutes, deadline, state, mission_type, "
                "plan_id) VALUES "
                "(1, 'x', 'y', 1, 30, NULL, 'pendente', 'semanal', :plan_id)"
            ),
            {"plan_id": plano.id},
        )
    assert "ck_missions_mission_type" in str(erro.value.orig)


def test_avulsa_sem_plano_e_aceita(session: Session) -> None:
    """A metade da FK composta que MATCH SIMPLE deixa passar."""
    session.add(_missao(mission_type=MissionType.AVULSA, deadline=CRIADO_EM))
    session.flush()


def test_avulsa_com_plano_e_recusada(session: Session) -> None:
    plano = _plano(session)
    session.add(
        _missao(mission_type=MissionType.AVULSA, plan_id=plano.id, deadline=CRIADO_EM)
    )
    _recusa(session, "ck_missions_plano_do_tipo")


def test_diaria_sem_plano_e_recusada(session: Session) -> None:
    session.add(_missao(mission_type=MissionType.DIARIA, day=SEGUNDA, deadline=None))
    _recusa(session, "ck_missions_plano_do_tipo")


def test_diaria_sem_dia_e_recusada(session: Session) -> None:
    plano = _plano(session)
    session.add(_diaria(plano, dia=None))  # type: ignore[arg-type]
    _recusa(session, "ck_missions_dia_do_tipo")


def test_avulsa_com_dia_e_recusada(session: Session) -> None:
    session.add(
        _missao(mission_type=MissionType.AVULSA, day=SEGUNDA, deadline=CRIADO_EM)
    )
    _recusa(session, "ck_missions_dia_do_tipo")


def test_diaria_com_prazo_gravado_e_recusada(session: Session) -> None:
    plano = _plano(session)
    session.add(
        _missao(
            mission_type=MissionType.DIARIA,
            plan_id=plano.id,
            day=SEGUNDA,
            deadline=CRIADO_EM,
        )
    )
    _recusa(session, "ck_missions_prazo_do_tipo")


def test_avulsa_sem_prazo_e_recusada(session: Session) -> None:
    session.add(_missao(mission_type=MissionType.AVULSA, deadline=None))
    _recusa(session, "ck_missions_prazo_do_tipo")


def test_especial_abaixo_da_dificuldade_maxima_e_recusada(session: Session) -> None:
    plano = _plano(session)
    session.add(
        _missao(
            mission_type=MissionType.ESPECIAL,
            plan_id=plano.id,
            difficulty=4,
            deadline=None,
        )
    )
    _recusa(session, "ck_missions_dificuldade_da_especial")


def test_diaria_acima_de_um_dia_de_estimativa_e_recusada(session: Session) -> None:
    plano = _plano(session)
    session.add(_diaria(plano, estimated_minutes=1441))
    _recusa(session, "ck_missions_estimativa_do_ciclo")


def test_duas_diarias_no_mesmo_dia_sao_recusadas(session: Session) -> None:
    plano = _plano(session)
    session.add(_diaria(plano))
    session.flush()
    session.add(_diaria(plano))
    _recusa(session, "uq_missions_plan_id_day")


def test_duas_especiais_no_mesmo_plano_sao_recusadas(session: Session) -> None:
    plano = _plano(session)
    for _ in range(2):
        session.add(
            _missao(
                mission_type=MissionType.ESPECIAL,
                plan_id=plano.id,
                difficulty=5,
                deadline=None,
            )
        )
    _recusa(session, "uq_missions_especial_por_plano")


def test_diaria_de_outro_usuario_no_plano_e_recusada(session: Session) -> None:
    """A outra metade da FK composta: o banco impede a missao de um usuario no
    plano de outro."""
    session.execute(text("INSERT INTO users (id, display_name) VALUES (2, 'Outro')"))
    plano = _plano(session)
    session.add(_diaria(plano, user_id=2))
    _recusa(session, "fk_missions_plano_do_usuario")


def test_a_missao_sem_tipo_e_recusada_pelo_banco(session: Session) -> None:
    """O server_default da 0003 serviu so ao preenchimento: sem tipo, NOT NULL."""
    with pytest.raises(IntegrityError) as erro:
        session.execute(
            text(
                "INSERT INTO missions (user_id, instructions, completion_criterion, "
                "difficulty, estimated_minutes, deadline, state) VALUES "
                "(1, 'x', 'y', 1, 30, now(), 'pendente')"
            )
        )
    assert 'null value in column "mission_type"' in str(erro.value.orig)
