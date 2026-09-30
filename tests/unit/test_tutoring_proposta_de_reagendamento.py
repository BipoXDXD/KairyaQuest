"""A entrada de `reschedule_mission`: o que o backend aceita do modelo (F15)."""

import json
from datetime import UTC, datetime
from typing import Any

import pytest
from pydantic import ValidationError

from focusquest.modules.missions.domain import MotivoDoReagendamento
from focusquest.modules.tutoring.anthropic_provider import (
    DESCRICAO_DO_REAGENDAMENTO,
    esquema_do_reagendamento,
)
from focusquest.modules.tutoring.schemas import (
    CAMPOS_DO_RETRATO,
    RescheduleProposal,
    RetratoDoReagendamento,
)

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
        {"previous_deadline": "2026-10-01T18:00:00-03:00"},
        # Coercoes que o modelo nao quis dizer (M10 da revisao da T6): `true`
        # viraria a missao #1; um numero viraria um instante UTC.
        {"mission_id": True},
        {"mission_id": "12"},
        {"mission_id": 12.0},
        {"new_deadline": 1790000000},
        {"new_deadline": 1790000000.5},
        {"new_deadline": True},
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


def test_o_prazo_ja_como_instante_continua_valendo() -> None:
    """A recusa de numero nao pode recusar o `datetime` que o proprio backend
    constroi (a revalidacao do payload e os testes montam assim)."""
    instante = datetime(2026, 10, 5, 21, 0, tzinfo=UTC)
    proposta = RescheduleProposal.model_validate(VALIDA | {"new_deadline": instante})
    assert proposta.new_deadline == instante


def test_o_retrato_nunca_e_campo_da_entrada_do_modelo() -> None:
    """F16: `instructions` e `previous_deadline` sao escritos pelo backend. Se
    um dia virassem campo do `RescheduleProposal`, o modelo passaria a
    escolhe-los -- e a revalidacao da confirmacao, que tira o retrato antes de
    validar, deixaria de conferir o que o modelo mandou."""
    assert CAMPOS_DO_RETRATO == ("instructions", "previous_deadline")
    assert set(CAMPOS_DO_RETRATO).isdisjoint(RescheduleProposal.model_fields)
    # E o retrato que o backend grava tem exatamente esses campos.
    assert tuple(RetratoDoReagendamento.model_fields) == CAMPOS_DO_RETRATO


def test_a_descricao_nao_restringe_a_pendente() -> None:
    """F8 permite reagendar a `em_andamento` (M11 da revisao da T6)."""
    assert "pendente" not in DESCRICAO_DO_REAGENDAMENTO
    assert "ainda não concluída" in DESCRICAO_DO_REAGENDAMENTO
