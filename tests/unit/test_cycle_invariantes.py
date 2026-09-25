"""As duas conferencias de invariante do servico do ciclo.

Nenhum caminho da API as alcanca -- os CHECK do banco impedem o dado --, e
por isso elas sao provadas com objetos em memoria: um ramo que so existe para
o dia em que o esquema divergir ainda e um ramo, e precisa de teste.
"""

from datetime import UTC, date, datetime

import pytest

from focusquest.modules.missions.cycle_domain import Availability
from focusquest.modules.missions.cycle_service import dia_da_diaria, leitura_da_avulsa
from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission

PRAZO = datetime(2026, 9, 30, 15, tzinfo=UTC)


def _missao(**campos: object) -> Mission:
    base: dict[str, object] = {
        "id": 7,
        "user_id": 1,
        "instructions": "x",
        "completion_criterion": "y",
        "difficulty": 2,
        "estimated_minutes": 30,
        "state": MissionState.PENDENTE,
    }
    base.update(campos)
    return Mission(**base)


def test_diaria_sem_dia_e_divergencia_do_esquema() -> None:
    with pytest.raises(RuntimeError, match="ck_missions_dia_do_tipo"):
        dia_da_diaria(_missao(mission_type=MissionType.DIARIA, day=None))


def test_dia_da_diaria() -> None:
    assert dia_da_diaria(
        _missao(mission_type=MissionType.DIARIA, day=date(2026, 9, 21))
    ) == date(2026, 9, 21)


def test_avulsa_sem_prazo_e_divergencia_do_esquema() -> None:
    with pytest.raises(RuntimeError, match="ck_missions_prazo_do_tipo"):
        leitura_da_avulsa(_missao(mission_type=MissionType.AVULSA, deadline=None))


@pytest.mark.parametrize(
    ("estado", "esperada"),
    [
        (MissionState.PENDENTE, Availability.DISPONIVEL),
        (MissionState.EM_ANDAMENTO, Availability.DISPONIVEL),
        (MissionState.CONCLUIDA, Availability.CONCLUIDA),
    ],
)
def test_a_avulsa_so_distingue_concluida(
    estado: MissionState, esperada: Availability
) -> None:
    lida = leitura_da_avulsa(
        _missao(mission_type=MissionType.AVULSA, deadline=PRAZO, state=estado)
    )
    assert (lida.deadline, lida.availability) == (PRAZO, esperada)
