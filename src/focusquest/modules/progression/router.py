"""Transporte HTTP da progressao: uma rota, so leitura (D14)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from focusquest.core.database import get_session
from focusquest.modules.missions.router import USUARIO_UNICO
from focusquest.modules.progression.schemas import ProgressRead
from focusquest.modules.progression.service import ler_progresso

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.get("")
def progresso(session: Annotated[Session, Depends(get_session)]) -> ProgressRead:
    """Saldo, nivel e o catalogo de conquistas. Sem `commit`: e leitura."""
    return ProgressRead.do_progresso(ler_progresso(session, USUARIO_UNICO))
