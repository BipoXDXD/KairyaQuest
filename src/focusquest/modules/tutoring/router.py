"""Transporte HTTP da tutoria. Nenhuma rota trata erro: `main.py` traduz."""

from collections.abc import Generator
from typing import Annotated

from fastapi import APIRouter, Depends, Path
from fastapi.responses import StreamingResponse
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.clock import Clock, get_clock
from focusquest.core.database import get_engine, get_session
from focusquest.core.errors import PrazoExpiradoError, ProvedorNaoConfiguradoError
from focusquest.modules.missions.router import USUARIO_UNICO
from focusquest.modules.missions.schemas import MAIOR_INTEIRO_DA_COLUNA, MissionRead
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.schemas import (
    ActionConfirm,
    ActionRead,
    ConfirmRead,
    DeltaRead,
    ErrorRead,
    MessageCreate,
    MessageRead,
    RejectRead,
    StatusRead,
)
from focusquest.modules.tutoring.service import (
    EventoDoTurno,
    PerguntaGravada,
    PrazoExpirado,
    RespostaConcluida,
    RespostaFalhou,
    Tutoria,
    confirmar_acao,
    listar_mensagens,
    preparar_turno,
    rejeitar_acao,
    transmitir,
)
from focusquest.modules.tutoring.sse import evento_sse, fechando_ao_cancelar

router = APIRouter(prefix="/api/tutoring", tags=["tutoring"])

SessaoDaRequisicao = Annotated[Session, Depends(get_session)]
TutoriaConfigurada = Annotated[Tutoria | None, Depends(get_tutoria)]
Relogio = Annotated[Clock, Depends(get_clock)]
IdDaAcao = Annotated[int, Path(ge=1, le=MAIOR_INTEIRO_DA_COLUNA)]


@router.get("/status")
def status(tutoria: TutoriaConfigurada) -> StatusRead:
    return StatusRead(available=tutoria is not None)


@router.get("/messages")
def listar(session: SessaoDaRequisicao) -> list[MessageRead]:
    return [
        MessageRead.model_validate(m) for m in listar_mensagens(session, USUARIO_UNICO)
    ]


@router.post("/messages")
def enviar(
    dados: MessageCreate,
    tutoria: TutoriaConfigurada,
    engine: Annotated[Engine, Depends(get_engine)],
    clock: Relogio,
) -> StreamingResponse:
    """Prepara e COMMITA antes de abrir o stream; so entao transmite.

    Os erros da preparacao (sem chave, 409) saem como JSON comum, antes de
    qualquer byte do stream, e nada foi gravado. A transmissao usa sessoes
    proprias, nunca a da requisicao (medicao M2).
    """
    if tutoria is None:
        raise ProvedorNaoConfiguradoError("a Tifa esta sem provedor configurado")
    fabrica = sessionmaker(bind=engine, expire_on_commit=False)
    with fabrica() as session:
        preparo = preparar_turno(
            session,
            user_id=USUARIO_UNICO,
            client_message_id=dados.client_message_id,
            conteudo=dados.content,
            tutoria=tutoria,
            clock=clock,
        )
        session.commit()
    eventos = transmitir(fabrica, preparo, tutoria, clock=clock)
    return StreamingResponse(
        fechando_ao_cancelar(_em_sse(eventos)), media_type="text/event-stream"
    )


def _em_sse(eventos: Generator[EventoDoTurno]) -> Generator[str]:
    """Traduz os eventos do servico para o formato do contrato.

    O `finally` repassa o fechamento: fechar este gerador (o que o invoucro
    `fechando_ao_cancelar` faz na desconexao) precisa chegar ao `transmitir`,
    que grava `interrompida`. Um `for` sobre outro gerador nao faz isso
    sozinho, de forma IMEDIATA e DETERMINISTICA -- sem este `finally`, o
    fechamento so chegaria la se algo mais (o SO notando o socket do cliente
    morto, ou o CPython destruindo um generator sem referencia) abandonasse a
    cadeia primeiro.

    MEDIDO (fix round 1/5 da Task 7): este `finally` e o invoucro
    `fechando_ao_cancelar` se cobrem -- removendo UM dos dois isoladamente,
    ou os DOIS juntos, `tests/integration/test_tutoring_desconexao.py`
    continua passando nesta maquina, porque a falha da escrita no socket
    morto (3 a 11s depois, medido) aciona sozinha a finalizacao automatica do
    CPython. Ver a docstring de `fechando_ao_cancelar` em `sse.py` para a
    medicao completa. Este `finally` fica mesmo assim: e a garantia que nao
    depende de quanto tempo o SO leva para notar a desconexao.
    """
    try:
        for evento in eventos:
            if isinstance(evento, PerguntaGravada):
                dados = MessageRead.model_validate(evento.mensagem)
                yield evento_sse("user_message", dados.model_dump_json())
            elif isinstance(evento, RespostaConcluida):
                dados = MessageRead.model_validate(evento.mensagem)
                yield evento_sse("done", dados.model_dump_json())
            elif isinstance(evento, RespostaFalhou):
                erro = ErrorRead(code=evento.codigo)
                yield evento_sse("error", erro.model_dump_json())
            else:
                trecho = DeltaRead(text=evento.texto)
                yield evento_sse("delta", trecho.model_dump_json())
    finally:
        eventos.close()


@router.post("/actions/{action_id}/confirm")
def confirmar(
    action_id: IdDaAcao,
    dados: ActionConfirm,
    session: SessaoDaRequisicao,
    clock: Relogio,
) -> ConfirmRead:
    """Confirma a proposta. O prazo expirado e GRAVADO e so depois vira 422:
    o commit vem antes de levantar, ou a falha morreria com a transacao."""
    resultado = confirmar_acao(
        session, USUARIO_UNICO, action_id, dados.operation_id, clock=clock
    )
    session.commit()
    if isinstance(resultado, PrazoExpirado):
        raise PrazoExpiradoError("o prazo proposto ja passou; peca outra proposta")
    return ConfirmRead(
        action=ActionRead.model_validate(resultado.acao),
        mission=MissionRead.model_validate(resultado.missao),
    )


@router.post("/actions/{action_id}/reject")
def recusar(
    action_id: IdDaAcao, session: SessaoDaRequisicao, clock: Relogio
) -> RejectRead:
    acao = rejeitar_acao(session, USUARIO_UNICO, action_id, clock=clock)
    session.commit()
    return RejectRead(action=ActionRead.model_validate(acao))
