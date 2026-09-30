"""A entrada de `reschedule_mission`: o que o backend aceita do modelo (F15)."""

import json
from typing import Any

import pytest
from pydantic import ValidationError

from focusquest.modules.missions.domain import MotivoDoReagendamento
from focusquest.modules.tutoring.anthropic_provider import esquema_do_reagendamento
from focusquest.modules.tutoring.schemas import RescheduleProposal

VALIDA = {
    "mission_id": 12,
    "new_deadline": "2026-10-05T18:00:00-03:00",
    "reason": "dificuldade",
}


def test_a_entrada_valida() -> None:
    proposta = RescheduleProposal.model_validate(VALIDA)
    assert proposta.reason is MotivoDoReagendamento.DIFICULDADE


@pytest.mark.parametrize(
    "ajuste",
    [
        {"mission_id": 0},
        {"mission_id": 2**31},
        {"new_deadline": "2026-10-05T18:00:00"},
        {"reason": "outro"},
        {"instructions": "o modelo tentando escrever o retrato"},
    ],
)
def test_a_entrada_invalida(ajuste: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        RescheduleProposal.model_validate(VALIDA | ajuste)


def test_o_esquema_nomeia_os_tres_motivos_e_nao_leva_docstring() -> None:
    """O enum sai em linha ou por `$ref` (o Pydantic escolhe); nas duas formas
    os tres valores precisam estar la. E nenhuma `description`: as docstrings do
    schema e do enum sao de manutencao, nao servem ao modelo (M8)."""
    texto = json.dumps(esquema_do_reagendamento())
    for motivo in MotivoDoReagendamento:
        assert f'"{motivo.value}"' in texto
    assert '"description"' not in texto
