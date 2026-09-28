"""Aplicacao FastAPI do FocusQuest: montagem do app e traducao de erros.

A traducao de erro de dominio para status HTTP mora aqui, em um lugar so.
Espalha-la pelas rotas faria cada endpoint novo ter a chance de esquecer um
caso -- e o caso esquecido sai como 500, que e a resposta que este projeto nao
aceita dar para um bloqueio previsto (README s8: "explique bloqueios").
"""

import logging
from enum import StrEnum
from typing import Annotated

from fastapi import Depends, FastAPI, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from focusquest.core.database import get_engine
from focusquest.core.errors import (
    AcaoNaoEncontradaError,
    AvaliacaoEmAndamentoError,
    MensagemEmAndamentoError,
    MissaoExpiradaError,
    MissaoNaoEncontradaError,
    NaoPertenceAoUsuarioError,
    OperacaoReutilizadaError,
    PlanoExistenteError,
    PrazoExpiradoError,
    ProvedorNaoConfiguradoError,
    SemanaDistanteError,
    SemanaEncerradaError,
    SemEvidenciaError,
)
from focusquest.modules.evaluation.errors import AvaliacaoFalhouError
from focusquest.modules.evaluation.router import router as evaluation_router
from focusquest.modules.missions.cycle_router import router as cycle_router
from focusquest.modules.missions.domain import FalhaDaAvaliacao, TransicaoIlegalError
from focusquest.modules.missions.router import router as missions_router
from focusquest.modules.progression.router import router as progression_router
from focusquest.modules.tutoring.router import router as tutoring_router

_log = logging.getLogger(__name__)

app = FastAPI(title="FocusQuest")
app.include_router(missions_router)
app.include_router(cycle_router)
app.include_router(progression_router)
app.include_router(tutoring_router)
app.include_router(evaluation_router)

# O corpo dos DOIS caminhos de 404, escrito uma vez. Ele e o mesmo de
# proposito: ver `_nao_pertence`.
NAO_ENCONTRADA = "missao nao encontrada"

# O corpo do 404 de acao inexistente (ou alheia), pelo mesmo motivo do
# `NAO_ENCONTRADA` da missao: um so lugar onde ele esta escrito.
ACAO_NAO_ENCONTRADA = "acao nao encontrada"


class CodigoDeErro(StrEnum):
    """O `code` legivel por maquina de cada erro de dominio (decisao C12).

    O cliente DECIDE pelo `code`, e nunca pela prosa do `detail`: a prosa e
    para quem depura, nao tem acento e pode mudar de redacao sem aviso. Os dois
    409 desta API pedem acoes OPOSTAS do cliente -- nada a repetir na transicao
    ilegal, identificador novo no reuso --, e so o `code` os separa.

    Os VALORES sao contrato e estao em portugues porque a spec os fixou assim,
    como os valores do estado da missao; o frontend os repete num tipo proprio.
    Mora aqui, e nao nas classes de erro do dominio, porque e traducao para
    HTTP -- e a traducao inteira mora neste arquivo. Posto na excecao, o codigo
    obrigaria `NaoPertenceAoUsuarioError` a carregar `missao_nao_encontrada`,
    que e mentira no dominio e so e verdade na resposta.

    Tem so os codigos que algum handler devolve: um membro sem handler seria
    contrato publicado que nenhum caminho alcanca.
    """

    MISSAO_NAO_ENCONTRADA = "missao_nao_encontrada"
    TRANSICAO_ILEGAL = "transicao_ilegal"
    OPERACAO_REUTILIZADA = "operacao_reutilizada"
    PROVEDOR_NAO_CONFIGURADO = "provedor_nao_configurado"
    MENSAGEM_EM_ANDAMENTO = "mensagem_em_andamento"
    ACAO_NAO_ENCONTRADA = "acao_nao_encontrada"
    PRAZO_EXPIRADO = "prazo_expirado"
    MISSAO_EXPIRADA = "missao_expirada"
    PLANO_EXISTENTE = "plano_existente"
    SEMANA_ENCERRADA = "semana_encerrada"
    SEMANA_DISTANTE = "semana_distante"
    SEM_EVIDENCIA = "sem_evidencia"
    AVALIACAO_EM_ANDAMENTO = "avaliacao_em_andamento"
    # Os dois seguintes tem o MESMO valor do `CodigoDoStream` da conversa
    # (spec, "Erros"); `test_os_codigos_http_da_avaliacao_tem_o_valor_do_stream`
    # confere que nao divergem.
    PROVEDOR_INDISPONIVEL = "provedor_indisponivel"
    TEMPO_ESGOTADO = "tempo_esgotado"
    AVALIACAO_INVALIDA = "avaliacao_invalida"


def _erro(status_code: int, detalhe: str, codigo: CodigoDeErro) -> JSONResponse:
    """A forma de todo corpo de erro de dominio: `{"detail": ..., "code": ...}`.

    As chaves sao em ingles porque payload e contrato, como em `/ready`; e a
    prosa e `detail` -- e nao um nome proprio -- porque e a chave que o proprio
    FastAPI usa no 422 de validacao. O 422 continua no formato nativo, sem
    `code`: ele diz QUAL campo corrigir, e o `loc` ja e legivel por maquina.

    `codigo` e obrigatorio, sem valor padrao: um handler novo que esquecesse o
    `code` reprovaria no mypy, e nao na tela.
    """
    return JSONResponse(
        status_code=status_code, content={"detail": detalhe, "code": codigo}
    )


@app.exception_handler(MissaoNaoEncontradaError)
def _nao_encontrada(request: Request, exc: MissaoNaoEncontradaError) -> JSONResponse:
    """404 para o identificador que nao existe.

    O corpo nao repete a mensagem do dominio, que nomeia a missao pedida: ele
    tem de ser identico ao de `_nao_pertence` (ver la), e o id ja esta na URL
    que o proprio cliente montou. O motivo completo vai para o log.
    """
    _log.info("missao nao encontrada: %s", exc)
    return _erro(
        status.HTTP_404_NOT_FOUND, NAO_ENCONTRADA, CodigoDeErro.MISSAO_NAO_ENCONTRADA
    )


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
    # O MESMO `code` do 404 de inexistente, e nao um `nao_pertence` proprio:
    # um codigo distinto seria o 403 escrito de outro jeito.
    return _erro(
        status.HTTP_404_NOT_FOUND, NAO_ENCONTRADA, CodigoDeErro.MISSAO_NAO_ENCONTRADA
    )


@app.exception_handler(TransicaoIlegalError)
def _transicao_ilegal(request: Request, exc: TransicaoIlegalError) -> JSONResponse:
    """409: a requisicao esta correta, o ESTADO do recurso e que a recusa.

    Aqui a mensagem do dominio vai inteira para o corpo, e deve ir: ela diz de
    onde para onde nao se pode ir e quais destinos sobram, sobre um recurso que
    o cliente ja tem direito de ver. E o "explique bloqueios" do README s8.
    """
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.TRANSICAO_ILEGAL)


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
       servidor e que bloqueia" --, e o `code` os separa.

    A mensagem vem do servico, que a escreveu sem revelar nada da outra
    operacao (nem a missao, nem o tipo). Repeti-la aqui e seguro por
    construcao, nao por sorte.
    """
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.OPERACAO_REUTILIZADA)


@app.exception_handler(ProvedorNaoConfiguradoError)
def _sem_provedor(request: Request, exc: ProvedorNaoConfiguradoError) -> JSONResponse:
    """503: o servico existe e o resto do app funciona; falta configuracao."""
    return _erro(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        str(exc),
        CodigoDeErro.PROVEDOR_NAO_CONFIGURADO,
    )


@app.exception_handler(MensagemEmAndamentoError)
def _em_andamento(request: Request, exc: MensagemEmAndamentoError) -> JSONResponse:
    """409: a conversa ja esta gerando uma resposta. O cliente espera."""
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.MENSAGEM_EM_ANDAMENTO)


@app.exception_handler(AcaoNaoEncontradaError)
def _acao_nao_encontrada(request: Request, exc: AcaoNaoEncontradaError) -> JSONResponse:
    """404 com corpo fixo, como a missao: o motivo verdadeiro (inexistente ou
    alheia) vai para o log, nunca para a resposta."""
    _log.info("acao nao encontrada: %s", exc)
    return _erro(
        status.HTTP_404_NOT_FOUND, ACAO_NAO_ENCONTRADA, CodigoDeErro.ACAO_NAO_ENCONTRADA
    )


@app.exception_handler(PrazoExpiradoError)
def _prazo_expirado(request: Request, exc: PrazoExpiradoError) -> JSONResponse:
    """422: o pedido e valido, mas o conteudo da proposta (o prazo) nao pode
    mais ser executado. A falha ja foi gravada na acao."""
    return _erro(
        status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc), CodigoDeErro.PRAZO_EXPIRADO
    )


@app.exception_handler(MissaoExpiradaError)
def _missao_expirada(request: Request, exc: MissaoExpiradaError) -> JSONResponse:
    """409: o pedido esta certo, o relogio e que recusa. Nada a repetir."""
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.MISSAO_EXPIRADA)


@app.exception_handler(PlanoExistenteError)
def _plano_existente(request: Request, exc: PlanoExistenteError) -> JSONResponse:
    """409: o cliente confirma o que existe com `GET /api/plans/current`."""
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.PLANO_EXISTENTE)


@app.exception_handler(SemanaEncerradaError)
def _semana_encerrada(request: Request, exc: SemanaEncerradaError) -> JSONResponse:
    """409, e nao 422: depende do relogio, e regra de relogio nao e validacao
    de schema (spec, Erros)."""
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.SEMANA_ENCERRADA)


@app.exception_handler(SemanaDistanteError)
def _semana_distante(request: Request, exc: SemanaDistanteError) -> JSONResponse:
    """409 pelo mesmo motivo de `_semana_encerrada`."""
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.SEMANA_DISTANTE)


@app.exception_handler(SemEvidenciaError)
def _sem_evidencia(request: Request, exc: SemEvidenciaError) -> JSONResponse:
    """409: a missao existe e e visivel; o estado dela (sem evidencia, ou nao
    concluida) e que recusa a avaliacao."""
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.SEM_EVIDENCIA)


@app.exception_handler(AvaliacaoEmAndamentoError)
def _avaliacao_em_andamento(
    request: Request, exc: AvaliacaoEmAndamentoError
) -> JSONResponse:
    """409: outra tentativa esta avaliando esta missao. O cliente espera."""
    return _erro(
        status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.AVALIACAO_EM_ANDAMENTO
    )


# O status de cada falha da avaliacao (E13). 502 quando o problema esta do
# outro lado (o provedor falhou, ou respondeu fora do esquema), 504 quando foi
# o tempo. Os tres dizem ao cliente "nenhum bonus aconteceu" sem ler o corpo.
_STATUS_DA_FALHA: dict[FalhaDaAvaliacao, int] = {
    FalhaDaAvaliacao.PROVEDOR_INDISPONIVEL: status.HTTP_502_BAD_GATEWAY,
    FalhaDaAvaliacao.TEMPO_ESGOTADO: status.HTTP_504_GATEWAY_TIMEOUT,
    FalhaDaAvaliacao.AVALIACAO_INVALIDA: status.HTTP_502_BAD_GATEWAY,
}


@app.exception_handler(AvaliacaoFalhouError)
def _avaliacao_falhou(request: Request, exc: AvaliacaoFalhouError) -> JSONResponse:
    """A falha ja gravada na avaliacao, com o `code` igual ao `error_code` da
    linha: a tela traduz os dois pelo mesmo mapa."""
    return _erro(_STATUS_DA_FALHA[exc.falha], str(exc), CodigoDeErro(exc.falha.value))


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
