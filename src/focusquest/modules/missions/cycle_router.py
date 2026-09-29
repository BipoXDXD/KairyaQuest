"""Transporte HTTP do plano semanal e do ciclo. Mesmas regras de router.py:
contrato validado, caso de uso, commit, contrato de saida -- e nenhum erro
tratado aqui (main.py os traduz)."""

from typing import Annotated

from fastapi import APIRouter, Depends, status

from focusquest.core.clock import Clock, get_clock
from focusquest.core.database import SessaoDaRequisicao
from focusquest.core.usuario_unico import USUARIO_UNICO
from focusquest.modules.missions.cycle_schemas import (
    CurrentPlanRead,
    CycleRead,
    PlanCreate,
    PlanRead,
)
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
    ler_ciclo,
    ler_plano_atual,
)

router = APIRouter(prefix="/api", tags=["cycle"])

Relogio = Annotated[Clock, Depends(get_clock)]


@router.post("/plans", status_code=status.HTTP_201_CREATED)
def criar(dados: PlanCreate, session: SessaoDaRequisicao, clock: Relogio) -> PlanRead:
    """Cria o plano da semana. O reenvio responde 409 `plano_existente`, e nao
    um plano duplicado (README s6: falhas nao duplicam missoes)."""
    plano = criar_plano(
        session,
        user_id=USUARIO_UNICO,
        semana=dados.week_start,
        diarias=[
            NovaDiaria(
                instructions=dia.instructions,
                completion_criterion=dia.completion_criterion,
                difficulty=dia.difficulty,
                estimated_minutes=dia.estimated_minutes,
            )
            for dia in dados.days
        ],
        especial=NovaEspecial(
            instructions=dados.bonus.instructions,
            completion_criterion=dados.bonus.completion_criterion,
            estimated_minutes=dados.bonus.estimated_minutes,
        ),
        clock=clock,
    )
    session.commit()
    return PlanRead.da_leitura(plano)


@router.get("/plans/current")
def atual(session: SessaoDaRequisicao, clock: Relogio) -> CurrentPlanRead:
    plano = ler_plano_atual(session, USUARIO_UNICO, clock=clock)
    return CurrentPlanRead(plan=None if plano is None else PlanRead.da_leitura(plano))


@router.get("/cycle")
def ciclo(session: SessaoDaRequisicao, clock: Relogio) -> CycleRead:
    return CycleRead.da_leitura(ler_ciclo(session, USUARIO_UNICO, clock=clock))
