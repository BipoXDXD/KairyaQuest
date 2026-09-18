"""Aplicacao FastAPI do FocusQuest."""

from typing import Annotated, Any

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url

app = FastAPI(title="FocusQuest")

_engine: Engine | None = None


def get_engine() -> Engine:
    """Engine compartilhada, criada na primeira chamada.

    Os testes substituem esta dependencia; por isso ela e uma funcao e nao
    uma variavel de modulo lida diretamente.
    """
    global _engine
    if _engine is None:
        _engine = create_engine_from_url(Settings().database_url)
    return _engine


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness. NAO toca no banco: um liveness que consulta o banco derruba
    o processo toda vez que o banco pisca."""
    return {"status": "ok"}


@app.get("/ready")
def ready(engine: Annotated[Engine, Depends(get_engine)]) -> Any:
    """Readiness. Abre conexao e consulta de verdade: um readiness que nao
    consulta mente sobre estar pronto."""
    try:
        with engine.connect() as conexao:
            conexao.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse(
            status_code=503,
            content={"status": "indisponivel", "database": "indisponivel"},
        )
    return {"status": "ok", "database": "ok"}
