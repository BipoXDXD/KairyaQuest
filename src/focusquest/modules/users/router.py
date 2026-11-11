"""Transporte HTTP de `/api/me`: ler e gravar o idioma do usuario."""

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute

from focusquest.core.database import SessaoDaRequisicao
from focusquest.core.errors import CampoDesconhecidoError
from focusquest.core.usuario_unico import USUARIO_UNICO
from focusquest.modules.users.schemas import MeRead, MeUpdate
from focusquest.modules.users.service import atualizar_idioma, ler_me

# O tipo de erro do Pydantic para campo fora do modelo com `extra="forbid"`.
EXTRA_PROIBIDO = "extra_forbidden"


class RotaQueRecusaCampoExtra(APIRoute):
    """Troca o 422 por `CampoDesconhecidoError` quando o corpo tem campo extra.

    O handler global de `RequestValidationError` continua devolvendo 422 para
    toda a API; so as rotas deste router distinguem o campo extra. A rota nao
    monta a resposta: levanta o erro de dominio e `main.py` o traduz em 400,
    como todo o resto da traducao HTTP. Com campo extra e valor invalido no
    mesmo corpo, vence o 400: o cliente tira o campo primeiro.
    """

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        original = super().get_route_handler()

        async def recusar_campo_extra(request: Request) -> Response:
            try:
                return await original(request)
            except RequestValidationError as erro:
                if any(e["type"] == EXTRA_PROIBIDO for e in erro.errors()):
                    raise CampoDesconhecidoError("campo desconhecido") from erro
                raise

        return recusar_campo_extra


router = APIRouter(prefix="/api/me", tags=["me"], route_class=RotaQueRecusaCampoExtra)


@router.get("")
def ler(session: SessaoDaRequisicao) -> MeRead:
    """Nome e idioma. Sem `commit`: e leitura."""
    return ler_me(session, USUARIO_UNICO)


@router.patch(
    "",
    responses={
        400: {"description": "Campo desconhecido no corpo (`campo_desconhecido`)."},
        422: {"description": "Idioma fora da lista, ou corpo que nao e objeto."},
    },
)
def atualizar(corpo: MeUpdate, session: SessaoDaRequisicao) -> MeRead:
    """Grava o idioma escolhido. Repetir o mesmo valor devolve o mesmo corpo."""
    me = atualizar_idioma(session, USUARIO_UNICO, corpo.locale)
    session.commit()
    return me
