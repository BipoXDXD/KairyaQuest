"""O relogio controlavel da API do E2E, ausente do pacote de producao.

O cenario do navegador precisa atravessar a meia-noite de Sao Paulo
(pendencia 116), e esperar a meia-noite de verdade nao e opcao. A troca
acontece so aqui, no harness: o app de producao continua com `get_clock`
devolvendo o relogio real, e nenhuma regra de negocio sabe que existe outro.

Por que um app EXTERNO que monta o de producao, e nao `include_router` no
proprio `focusquest.main.app`: o app de producao e um objeto do modulo, e o
pytest o importa. Registrar a rota nele faria o processo que importasse este
arquivo ter a rota no app de "producao" -- exatamente o que
`test_relogio_sem_controle_em_producao.py` existe para impedir. O override de
`get_clock` sim vai no app de producao, pelo mesmo caminho que
`tests/integration/e2e_app.py` ja usa para a tutoria.
"""

import threading
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Body, FastAPI, Response, status
from pydantic import AwareDatetime, BaseModel, ConfigDict

from focusquest.core.clock import Clock, get_clock, system_now
from integration.reset_do_e2e import (
    ContaPedidos,
    RastreadorDePedidos,
    roteador_do_reset,
)

# O prefixo de controle do harness. Fora de `/api`: o `vite preview` do E2E so
# repassa `/api` para a API, entao o navegador nao alcanca esta rota pela
# origem da tela -- so o processo do Playwright, que fala direto com a porta da
# API. Exportado para o teste de producao procurar ESTE caminho, e nao uma
# copia escrita a mao que poderia divergir.
ROTA_DO_RELOGIO = "/_e2e/clock"


class RelogioDoE2E:
    """O relogio real ate o harness fixar um instante; real de novo ao soltar.

    Fixo, e nao andando a partir do instante fixado: o cenario move o relogio
    em saltos explicitos, e um relogio que anda faria o resultado depender de
    quanto tempo o navegador levou entre um passo e outro.

    A trava existe porque o uvicorn serve rotas sincronas numa threadpool: a
    rota de controle e uma rota de negocio podem rodar ao mesmo tempo.
    """

    def __init__(self) -> None:
        self._trava = threading.Lock()
        self._fixo: datetime | None = None

    def __call__(self) -> datetime:
        with self._trava:
            fixo = self._fixo
        return system_now() if fixo is None else fixo

    def fixar(self, instante: datetime) -> None:
        if instante.utcoffset() is None:
            raise ValueError("instante sem fuso: o relogio da aplicacao tem fuso")
        with self._trava:
            self._fixo = instante

    def soltar(self) -> None:
        with self._trava:
            self._fixo = None


class InstanteFixado(BaseModel):
    """O corpo do `PUT`: so o instante, com fuso obrigatorio."""

    model_config = ConfigDict(extra="forbid")

    now: AwareDatetime


def roteador_do_relogio(relogio: RelogioDoE2E) -> APIRouter:
    """As duas operacoes do harness: fixar o instante e voltar ao real."""
    router = APIRouter()

    @router.put(ROTA_DO_RELOGIO)
    def fixar(dados: Annotated[InstanteFixado, Body()]) -> InstanteFixado:
        relogio.fixar(dados.now)
        return InstanteFixado(now=relogio())

    @router.delete(ROTA_DO_RELOGIO, status_code=status.HTTP_204_NO_CONTENT)
    def soltar() -> Response:
        relogio.soltar()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router


def montar_app_do_e2e(
    producao: FastAPI, relogio: RelogioDoE2E, *, falso_url: str | None = None
) -> FastAPI:
    """O app que o uvicorn do E2E serve: as rotas de controle e, sob elas, o
    app de producao inteiro, com o relogio dele trocado por `relogio`.

    Com `falso_url`, o app tambem conta os pedidos em andamento e publica o
    reset do E2E (`integration/reset_do_e2e.py`), que espera a API ficar
    ociosa antes de reiniciar o servidor falso naquele endereco.

    O ciclo de vida e o do app de producao: montado (`mount`), ele nao
    receberia o evento de partida, e o log nao seria configurado.
    """

    def relogio_controlavel() -> Clock:
        return relogio

    producao.dependency_overrides[get_clock] = relogio_controlavel
    externo = FastAPI(lifespan=producao.router.lifespan_context)
    externo.include_router(roteador_do_relogio(relogio))
    if falso_url is not None:
        rastreador = RastreadorDePedidos()
        externo.add_middleware(ContaPedidos, rastreador=rastreador)
        externo.include_router(roteador_do_reset(rastreador, falso_url))
    externo.mount("/", producao)
    return externo
