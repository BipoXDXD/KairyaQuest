"""Transporte HTTP da progressao: uma rota, so leitura (D14)."""

from fastapi import APIRouter

from focusquest.core.database import SessaoDaRequisicao
from focusquest.core.usuario_unico import USUARIO_UNICO
from focusquest.modules.progression.schemas import ProgressRead
from focusquest.modules.progression.service import ler_progresso

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.get("")
def progresso(session: SessaoDaRequisicao) -> ProgressRead:
    """Saldo, nivel e o catalogo de conquistas. Sem `commit`: e leitura."""
    return ProgressRead.do_progresso(ler_progresso(session, USUARIO_UNICO))
