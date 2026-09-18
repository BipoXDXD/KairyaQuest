"""Aplicacao FastAPI do FocusQuest: montagem do app e traducao de erros.

A traducao de erro de dominio para status HTTP mora aqui, em um lugar so.
Espalha-la pelas rotas faria cada endpoint novo ter a chance de esquecer um
caso -- e o caso esquecido sai como 500, que e a resposta que este projeto nao
aceita dar para um bloqueio previsto (README s8: "explique bloqueios").
"""

import logging
from typing import Annotated

from fastapi import Depends, FastAPI, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from focusquest.core.database import get_engine
from focusquest.core.errors import (
    MissaoNaoEncontradaError,
    NaoPertenceAoUsuarioError,
    OperacaoReutilizadaError,
)
from focusquest.modules.missions.domain import TransicaoIlegalError
from focusquest.modules.missions.router import router as missions_router

_log = logging.getLogger(__name__)

app = FastAPI(title="FocusQuest")
app.include_router(missions_router)

# O corpo dos DOIS caminhos de 404, escrito uma vez. Ele e o mesmo de
# proposito: ver `_nao_pertence`.
NAO_ENCONTRADA = "missao nao encontrada"


def _erro(status_code: int, detalhe: str) -> JSONResponse:
    """A forma de todo corpo de erro desta API: `{"detail": ...}`.

    A chave e em ingles porque payload e contrato, como em `/ready`; e e
    `detail` -- e nao um nome proprio -- porque e a chave que o proprio FastAPI
    usa no 422 de validacao. Duas formas de erro no mesmo servico obrigariam o
    cliente a tratar as duas.
    """
    return JSONResponse(status_code=status_code, content={"detail": detalhe})


@app.exception_handler(MissaoNaoEncontradaError)
def _nao_encontrada(request: Request, exc: MissaoNaoEncontradaError) -> JSONResponse:
    """404 para o identificador que nao existe.

    O corpo nao repete a mensagem do dominio, que nomeia a missao pedida: ele
    tem de ser identico ao de `_nao_pertence` (ver la), e o id ja esta na URL
    que o proprio cliente montou. O motivo completo vai para o log.
    """
    _log.info("missao nao encontrada: %s", exc)
    return _erro(status.HTTP_404_NOT_FOUND, NAO_ENCONTRADA)


@app.exception_handler(NaoPertenceAoUsuarioError)
def _nao_pertence(request: Request, exc: NaoPertenceAoUsuarioError) -> JSONResponse:
    """404, e nao 403 -- e com o MESMO corpo do 404 de "nao existe".

    Responder 403 diria "existe, mas nao e seu", e isso e informacao sobre um
    recurso que quem pediu nao foi autorizado a ver. O mesmo vazamento
    aconteceria por baixo de um 404 cujo corpo explicasse o motivo verdadeiro,
    e e por isso que as duas respostas sao iguais em vez de apenas
    compartilharem o status.

    Com usuario unico isto e teorico. E onde o habito se estabelece: o dia em
    que houver autenticacao nao e o dia de descobrir que a API distingue os
    dois casos.

    A distincao nao se perde -- ela muda de lado. Vai para o log em WARNING,
    porque e a unica das duas que pode ser tentativa de acesso indevido, e
    `NaoPertenceAoUsuarioError` existe como tipo separado exatamente para que
    quem opera consiga diferenciar "id que nunca existiu" de "id negado".
    """
    _log.warning("acesso negado a missao de outro usuario: %s", exc)
    return _erro(status.HTTP_404_NOT_FOUND, NAO_ENCONTRADA)


@app.exception_handler(TransicaoIlegalError)
def _transicao_ilegal(request: Request, exc: TransicaoIlegalError) -> JSONResponse:
    """409: a requisicao esta correta, o ESTADO do recurso e que a recusa.

    Aqui a mensagem do dominio vai inteira para o corpo, e deve ir: ela diz de
    onde para onde nao se pode ir e quais destinos sobram, sobre um recurso que
    o cliente ja tem direito de ver. E o "explique bloqueios" do README s8.
    """
    return _erro(status.HTTP_409_CONFLICT, str(exc))


@app.exception_handler(OperacaoReutilizadaError)
def _operacao_reutilizada(
    request: Request, exc: OperacaoReutilizadaError
) -> JSONResponse:
    """409, e nao 422. A escolha tem tres razoes, na ordem em que pesaram:

    1. **O conflito e com o estado do servidor, nao com o pedido.** O corpo
       recebido e valido e seria aceito sem alteracao nenhuma com um
       identificador novo; o que impede e uma linha que ja existe em
       `mission_operations`. E a definicao de 409 -- conflito com o estado
       atual do recurso --, e nao a de 422, que fala de conteudo que o servidor
       nao consegue processar.
    2. **422 ja tem dono nesta API.** E o status que o FastAPI devolve para
       erro de validacao de schema. Reusa-lo aqui faria "seu JSON esta errado"
       e "sua chave esta gasta" serem indistinguiveis pelo status, e a acao do
       cliente e oposta nos dois casos: corrigir o corpo contra gerar um
       identificador novo e repetir o MESMO corpo.
    3. **Coincidir com a transicao ilegal e coerente.** Os dois 409 dizem a
       mesma coisa ao cliente -- "o pedido esta bem formado, o estado do
       servidor e que bloqueia" --, e os corpos os separam.

    A mensagem vem do servico, que a escreveu sem revelar nada da outra
    operacao (nem a missao, nem o tipo). Repeti-la aqui e seguro por
    construcao, nao por sorte.
    """
    return _erro(status.HTTP_409_CONFLICT, str(exc))


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
