"""Aplicacao FastAPI do FocusQuest."""

from typing import Annotated

from fastapi import Depends, FastAPI, Response, status
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
def ready(
    engine: Annotated[Engine, Depends(get_engine)], response: Response
) -> dict[str, str]:
    """Readiness. Abre a `connection` e consulta de verdade: um readiness que
    nao consulta mente sobre estar pronto.

    O status sai por `response.status_code` em vez de um `JSONResponse`: o
    tipo de retorno continua sendo `dict[str, str]`, que e o que o mypy
    confere e o que o schema do OpenAPI publica. Anotar o retorno como
    `JSONResponse | dict[str, str]` nao e opcao -- o FastAPI recusa a rota na
    importacao, com "Invalid args for response field".

    O corpo e em ingles de proposito. `/ready` e contrato de API, lido por
    orquestrador e por monitoramento; o texto em portugues que a pessoa le
    pertence ao frontend, que traduz o estado.
    """
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable", "database": "unavailable"}
    return {"status": "ok", "database": "ok"}
