"""O reset do E2E: nenhum pedido do cenario anterior sobrevive ao reset.

O defeito (pendencia P-e2e-flaky-1, a cascata do cenario (c)): um cenario que
estoura o proprio tempo deixa um pedido a meio caminho -- ja na API, ainda
nao no servidor falso. O cenario seguinte reiniciava SO o falso, e o pedido
atrasado chegava ao falso DEPOIS do reset: encontrava o roteiro vazio, a
avaliacao gravava `falhou` no banco compartilhado, e o quadro de missoes do
cenario seguinte passava a exibir um "Tentar de novo" que nao era dele.

O falso sozinho nao tem como saber a qual cenario um pedido pertence; a API,
sim, sabe quais pedidos ainda estao em andamento nela. Por isso o reset mora
aqui, na entrada do E2E, e nao so no falso: `POST /_e2e/reset` faz, em ordem,

1. libera o que o falso segura (`/_control/release`): quem esperava um
   `hold_after_events` do cenario anterior prossegue com o roteiro dele;
2. espera a API ficar ociosa: todo pedido em andamento termina, ainda contra o
   roteiro do cenario que o originou, porque o falso ainda nao foi reiniciado;
3. so entao reinicia o falso (`/_control/reset`): roteiro vazio, sem pedidos
   recebidos.

Fica fora do app de producao pelo mesmo motivo do relogio
(`integration/relogio_do_e2e.py`): `test_relogio_sem_controle_em_producao.py`
confere que nenhuma rota `/_e2e/*` existe la.

Janela que sobra, por desenho: um pedido ainda no navegador ou no proxy do
`vite preview`, que nao chegou a API. O Playwright so inicia o reset do
cenario seguinte depois de fechar a pagina do anterior, o que aborta o que
ainda nao saiu do navegador.
"""

import asyncio
import contextlib

import httpx
from fastapi import APIRouter, Response, status
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

ROTA_DO_RESET = "/_e2e/reset"

# Teto da espera pela API ociosa. Nao e uma espera por tempo: um pedido normal
# termina muito antes. Passar disso e uma API presa, e o reset reprova com o
# numero de pedidos que restaram, em vez de deixar o cenario seguinte
# contaminado.
LIMITE_DA_OCIOSIDADE_SEGUNDOS = 25.0
# O falso responde o controle na hora; um teto maior so esconderia um falso morto.
LIMITE_DO_CONTROLE_SEGUNDOS = 10.0


class RastreadorDePedidos:
    """Quantos pedidos HTTP estao em andamento na API do E2E.

    Contado no laco de eventos, sem `await` entre ler e mudar o contador: nao
    precisa de trava. Uma rota sincrona roda na threadpool, mas a entrada e a
    saida dela sao observadas daqui, no `await` do app, que so retorna quando
    o thread termina.
    """

    def __init__(self) -> None:
        self._em_voo = 0
        self._ocioso = asyncio.Event()
        self._ocioso.set()

    @property
    def em_voo(self) -> int:
        return self._em_voo

    def entrar(self) -> None:
        self._em_voo += 1
        self._ocioso.clear()

    def sair(self) -> None:
        self._em_voo -= 1
        if self._em_voo == 0:
            self._ocioso.set()

    async def esperar_ociosidade(self, limite_segundos: float) -> int:
        """Espera nao haver pedido em andamento e devolve quantos restam:
        0 se ficou ocioso, mais que 0 se o limite estourou."""
        # O estouro nao e erro aqui: quem chama decide pelo que restou.
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self._ocioso.wait(), limite_segundos)
        return self._em_voo


class ContaPedidos:
    """Middleware ASGI puro: conta cada pedido HTTP ate a resposta terminar.

    Puro, e nao `BaseHTTPMiddleware`: este devolve o controle antes de a
    resposta em streaming (a da tutoria) acabar e esconderia o pedido em voo.
    O proprio reset nao conta -- ele e quem espera.
    """

    def __init__(self, app: ASGIApp, *, rastreador: RastreadorDePedidos) -> None:
        self._app = app
        self._rastreador = rastreador

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] == ROTA_DO_RESET:
            await self._app(scope, receive, send)
            return
        self._rastreador.entrar()
        try:
            await self._app(scope, receive, send)
        finally:
            self._rastreador.sair()


def roteador_do_reset(rastreador: RastreadorDePedidos, falso_url: str) -> APIRouter:
    """A rota que reinicia o E2E inteiro, na ordem do docstring do modulo."""
    router = APIRouter()

    @router.post(ROTA_DO_RESET, status_code=status.HTTP_204_NO_CONTENT)
    async def reiniciar() -> Response:
        async with httpx.AsyncClient(
            base_url=falso_url, timeout=LIMITE_DO_CONTROLE_SEGUNDOS
        ) as falso:
            (await falso.post("/_control/release")).raise_for_status()
            restantes = await rastreador.esperar_ociosidade(
                LIMITE_DA_OCIOSIDADE_SEGUNDOS
            )
            if restantes:
                return JSONResponse(
                    {"em_voo": restantes}, status_code=status.HTTP_409_CONFLICT
                )
            (await falso.post("/_control/reset")).raise_for_status()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
