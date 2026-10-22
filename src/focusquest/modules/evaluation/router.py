"""Transporte HTTP da avaliacao: `POST /api/missions/{id}/evaluation` (E5).

Como os outros routers: recebe, chama o caso de uso e devolve o contrato.
Nenhum erro e tratado aqui -- `main.py` traduz todos. Nao usa a sessao da
requisicao: a avaliacao abre as proprias transacoes (E9), e por isso a rota
recebe a engine e monta a fabrica, como o stream da tutoria.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy import Engine
from sqlalchemy.orm import sessionmaker

from focusquest.core.clock import Clock, get_clock
from focusquest.core.database import get_engine
from focusquest.core.errors import ProvedorNaoConfiguradoError
from focusquest.core.usuario_unico import USUARIO_UNICO
from focusquest.modules.evaluation.schemas import EvaluationResultRead
from focusquest.modules.evaluation.service import avaliar_missao
from focusquest.modules.missions.schemas import (
    MAIOR_INTEIRO_DA_COLUNA,
    EvaluationSummaryRead,
)
from focusquest.modules.progression.schemas import RewardRead
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.service import Tutoria

router = APIRouter(prefix="/api/missions", tags=["evaluation"])

# O mesmo teto e o mesmo piso do `IdDaMissao` de `missions/router.py`, pelo
# mesmo motivo: fora da faixa da coluna e 422 na borda, nao 500 no banco.
IdDaMissao = Annotated[int, Path(ge=1, le=MAIOR_INTEIRO_DA_COLUNA)]


@router.post("/{mission_id}/evaluation")
def avaliar(
    mission_id: IdDaMissao,
    tutoria: Annotated[Tutoria | None, Depends(get_tutoria)],
    engine: Annotated[Engine, Depends(get_engine)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> EvaluationResultRead:
    """Pede a avaliacao da Kairya (E5). Sem chave, 503 antes de tocar no banco:
    a avaliacao ja concluida continua visivel pelo `MissionRead`. As falhas
    ja estao gravadas quando o erro sobe (E13)."""
    if tutoria is None:
        raise ProvedorNaoConfiguradoError("a Kairya esta sem provedor configurado")
    fabrica = sessionmaker(bind=engine, expire_on_commit=False)
    resultado = avaliar_missao(
        fabrica, tutoria, user_id=USUARIO_UNICO, mission_id=mission_id, clock=clock
    )
    return EvaluationResultRead(
        evaluation=EvaluationSummaryRead.da_avaliacao(resultado.avaliacao),
        reward=None
        if resultado.recompensa is None
        else RewardRead.da_recompensa(resultado.recompensa),
    )
