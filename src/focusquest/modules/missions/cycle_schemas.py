"""Contratos de entrada e saida do plano semanal e do ciclo.

Chaves em ingles (contrato), como em schemas.py. A forma da trilha e a MESMA
no 201 do `POST /api/plans` e no `GET /api/plans/current` (spec, Endpoints):
um 201 que mostrasse o que a conclusao por id nega com 404 seria um endpoint
afirmando a existencia do que outro nega.
"""

from datetime import date
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from focusquest.modules.missions.cycle_domain import (
    DIAS_DA_SEMANA,
    MINUTOS_DO_DIA,
    Availability,
)
from focusquest.modules.missions.cycle_service import (
    CicloLido,
    DiaLido,
    EspecialLida,
    PlanoLido,
)
from focusquest.modules.missions.schemas import DIFICULDADE_MAXIMA, MissionRead


def _segunda_feira(dia: date) -> date:
    """`week_start` e segunda-feira (C1). E validacao de forma -- nao depende
    do relogio --, entao e 422, e nao 409."""
    if dia.weekday() != 0:
        raise ValueError("week_start precisa ser uma segunda-feira")
    return dia


class DailyCreate(BaseModel):
    instructions: str = Field(min_length=1)
    completion_criterion: str = Field(min_length=1)
    difficulty: int = Field(ge=1, le=DIFICULDADE_MAXIMA)
    estimated_minutes: int = Field(gt=0, le=MINUTOS_DO_DIA)


class BonusCreate(BaseModel):
    """A especial: sem `difficulty`, que e sempre a maxima (C9). Campo
    desconhecido e 422 (decisao P5): quem manda `difficulty` fica sabendo que
    ela nao e respeitada."""

    model_config = ConfigDict(extra="forbid")

    instructions: str = Field(min_length=1)
    completion_criterion: str = Field(min_length=1)
    estimated_minutes: int = Field(gt=0, le=MINUTOS_DO_DIA)


class PlanCreate(BaseModel):
    week_start: Annotated[date, AfterValidator(_segunda_feira)]
    days: list[DailyCreate] = Field(
        min_length=DIAS_DA_SEMANA, max_length=DIAS_DA_SEMANA
    )
    bonus: BonusCreate


class DayRead(BaseModel):
    day: date
    availability: Availability
    mission: MissionRead | None

    @classmethod
    def da_leitura(cls, lido: DiaLido) -> DayRead:
        missao = None if lido.missao is None else MissionRead.da_leitura(lido.missao)
        return cls(day=lido.dia, availability=lido.availability, mission=missao)


class SpecialRead(BaseModel):
    availability: Availability
    # A sequencia atual modulo 7: o "N de 7" do proximo marco.
    progress: int
    mission: MissionRead | None

    @classmethod
    def da_leitura(cls, lida: EspecialLida) -> SpecialRead:
        missao = None if lida.missao is None else MissionRead.da_leitura(lida.missao)
        return cls(
            availability=lida.availability, progress=lida.progresso, mission=missao
        )


class PlanRead(BaseModel):
    week_start: date
    days: list[DayRead]
    special: SpecialRead

    @classmethod
    def da_leitura(cls, lido: PlanoLido) -> PlanRead:
        return cls(
            week_start=lido.semana,
            days=[DayRead.da_leitura(dia) for dia in lido.dias],
            special=SpecialRead.da_leitura(lido.especial),
        )


class CurrentPlanRead(BaseModel):
    """ "Sem plano" e estado, nao erro: `{"plan": null}` com 200."""

    plan: PlanRead | None


class CycleRead(BaseModel):
    today: date
    mission: MissionRead | None
    streak: int
    days_to_milestone: int
    special: MissionRead | None

    @classmethod
    def da_leitura(cls, lido: CicloLido) -> CycleRead:
        return cls(
            today=lido.hoje,
            mission=None
            if lido.missao is None
            else MissionRead.da_leitura(lido.missao),
            streak=lido.sequencia,
            days_to_milestone=lido.dias_para_o_marco,
            special=None
            if lido.especial is None
            else MissionRead.da_leitura(lido.especial),
        )
