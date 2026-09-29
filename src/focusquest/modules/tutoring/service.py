"""Casos de uso da tutoria: a conversa com a Tifa e as acoes dela.

O envio de uma pergunta tem DUAS fases, e a divisao e o que torna o stream
seguro:

1. `preparar_turno`, numa transacao curta que o chamador commita ANTES de
   abrir o stream: recolhe orfaos, trava o usuario, grava a pergunta e a
   resposta `gerando`. Nenhuma transacao fica aberta durante a geracao.
2. `transmitir`, um gerador que chama o provedor e grava o final em sessoes
   PROPRIAS. Ele nao pode usar a sessao da requisicao: na desconexao, a
   dependencia `get_session` fecha antes do `finally` do gerador (medido).

Nenhuma funcao daqui conhece HTTP, e nenhuma conhece o SDK.
"""

from collections.abc import Callable, Generator
from dataclasses import dataclass
from datetime import datetime, timedelta

from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.core.clock import Clock
from focusquest.core.errors import (
    AcaoNaoEncontradaError,
    MensagemEmAndamentoError,
    OperacaoReutilizadaError,
)
from focusquest.modules.missions.domain import MissionState
from focusquest.modules.missions.models import Mission, User
from focusquest.modules.missions.schemas import MissionCreate
from focusquest.modules.missions.service import criar_missao, listar_missoes
from focusquest.modules.progression.service import ler_progresso
from focusquest.modules.tutoring.context import montar_turno
from focusquest.modules.tutoring.domain import (
    PRAZO_EXPIRADO,
    CodigoDoStream,
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
    validar_transicao_da_acao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.persona import PERSONA
from focusquest.modules.tutoring.provider import (
    Delta,
    Proposta,
    Provedor,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)

# A folga sobre o limite da resposta antes de uma `gerando` virar orfa. O
# limite total so e conferido quando um evento chega: um
# provedor que nao emite nada fica preso ao timeout POR ESPERA do SDK, nao a
# este numero. A folga cobre a gravacao final e o relogio de maquinas
# diferentes.
FOLGA_DO_ORFAO = timedelta(seconds=30)

# Quantas mensagens o GET devolve. Sem paginacao no 1b (spec, "Fora").
MENSAGENS_NA_TELA = 50


@dataclass(frozen=True)
class Tutoria:
    """O provedor, os dois numeros que o servico usa e o nome do modelo, vindos
    do `Settings`. O `modelo` e o que a avaliacao grava como quem interpretou
    (spec, `mission_evaluations.model`): o adaptador o usa, mas o `Protocol`
    do provedor nao o expoe, e a gravacao nao pode depender de adaptador."""

    provedor: Provedor
    historico: int
    limite: timedelta
    modelo: str


@dataclass(frozen=True)
class JaRespondida:
    """Reenvio de uma pergunta que ja tem resposta completa: nao chama o modelo."""

    pergunta: TutorMessage
    resposta: TutorMessage


@dataclass(frozen=True)
class ParaGerar:
    pergunta: TutorMessage
    resposta_id: int
    turno: Turno


@dataclass(frozen=True)
class PerguntaGravada:
    mensagem: TutorMessage


@dataclass(frozen=True)
class Trecho:
    texto: str


@dataclass(frozen=True)
class RespostaConcluida:
    mensagem: TutorMessage


@dataclass(frozen=True)
class RespostaFalhou:
    codigo: CodigoDoStream


EventoDoTurno = PerguntaGravada | Trecho | RespostaConcluida | RespostaFalhou


def preparar_turno(
    session: Session,
    *,
    user_id: int,
    client_message_id: str,
    conteudo: str,
    tutoria: Tutoria,
    clock: Clock,
) -> JaRespondida | ParaGerar:
    """Decide o que o POST vai fazer e grava o necessario. Nao commita.

    A trava na linha do USUARIO vem primeiro e e o ponto de serializacao da
    conversa: duas perguntas simultaneas entram uma de cada vez, e a segunda
    ve a `gerando` da primeira. O indice parcial do banco e a garantia de
    ultimo recurso; a trava e o que faz a recusa sair como erro de dominio.
    A hora e lida depois da trava, pelo mesmo motivo da conclusao (C13).
    """
    session.execute(select(User.id).where(User.id == user_id).with_for_update())
    agora = clock()
    _recolher_orfaos(session, user_id, agora - tutoria.limite - FOLGA_DO_ORFAO)

    pergunta = session.scalar(
        select(TutorMessage).where(TutorMessage.client_message_id == client_message_id)
    )
    if pergunta is not None:
        if pergunta.user_id != user_id or pergunta.content != conteudo:
            raise OperacaoReutilizadaError(
                f"o identificador de mensagem '{client_message_id}' ja pertence a "
                "outra mensagem; envie um identificador novo"
            )
        completa = session.scalar(
            select(TutorMessage).where(
                TutorMessage.reply_to_id == pergunta.id,
                TutorMessage.status == StatusDaMensagem.COMPLETA,
            )
        )
        if completa is not None:
            return JaRespondida(pergunta=pergunta, resposta=completa)

    em_andamento = session.scalar(
        select(TutorMessage.id).where(
            TutorMessage.user_id == user_id,
            TutorMessage.status == StatusDaMensagem.GERANDO,
        )
    )
    if em_andamento is not None:
        raise MensagemEmAndamentoError("ja existe uma resposta da Tifa sendo gerada")

    if pergunta is None:
        pergunta = TutorMessage(
            user_id=user_id,
            role=Papel.USUARIO,
            content=conteudo,
            status=StatusDaMensagem.COMPLETA,
            client_message_id=client_message_id,
            created_at=agora,
        )
        session.add(pergunta)
        session.flush()
    resposta = TutorMessage(
        user_id=user_id,
        role=Papel.TUTORA,
        content="",
        status=StatusDaMensagem.GERANDO,
        reply_to_id=pergunta.id,
        created_at=agora,
    )
    session.add(resposta)
    session.flush()

    turno = montar_turno(
        persona=PERSONA,
        agora=agora,
        pendentes=[
            missao
            for missao in listar_missoes(session, user_id)
            if missao.state is not MissionState.CONCLUIDA
        ],
        progresso=ler_progresso(session, user_id),
        historico=_historico(session, user_id, tutoria.historico),
    )
    return ParaGerar(pergunta=pergunta, resposta_id=resposta.id, turno=turno)


def transmitir(
    fabrica: Callable[[], Session],
    preparo: JaRespondida | ParaGerar,
    tutoria: Tutoria,
    *,
    clock: Clock,
) -> Generator[EventoDoTurno]:
    """Os eventos do turno, gravando o final ANTES de emiti-lo.

    O `RespostaConcluida` sai depois do commit, e o `RespostaFalhou` depois de
    a falha estar gravada: o cliente nunca age sobre algo que o banco nao tem.

    `close()` no meio -- o que a desconexao do cliente faz, pelo invoucro da
    rota -- grava `interrompida` com o texto parcial e SEM acao, e fecha o
    stream do provedor. Um erro inesperado tem o mesmo destino: resultado
    desconhecido, que o cliente resolve com "Tentar de novo". A guarda cobre
    desde o primeiro yield: fechar exatamente ali, antes de qualquer `Trecho`,
    tambem grava `interrompida` -- nao fica pendurada como `gerando` ate o
    recolhimento de orfaos.
    """
    if isinstance(preparo, JaRespondida):
        yield PerguntaGravada(preparo.pergunta)
        yield RespostaConcluida(preparo.resposta)
        return

    partes: list[str] = []
    proposta: dict[str, object] | None = None
    terminou = False
    codigo: CodigoDoStream | None = None
    try:
        yield PerguntaGravada(preparo.pergunta)
        eventos = tutoria.provedor.responder(preparo.turno)
        inicio = clock()
        try:
            for evento in eventos:
                if isinstance(evento, Delta):
                    partes.append(evento.texto)
                    yield Trecho(evento.texto)
                elif isinstance(evento, Proposta):
                    proposta = evento.entrada
                else:
                    terminou = True
                # Limite TOTAL, pelo relogio injetavel.
                if clock() - inicio > tutoria.limite:
                    raise TempoEsgotadoError("a resposta passou do limite total")
        finally:
            eventos.close()
    except TempoEsgotadoError:
        codigo = CodigoDoStream.TEMPO_ESGOTADO
    except ProvedorIndisponivelError:
        codigo = CodigoDoStream.PROVEDOR_INDISPONIVEL
    except BaseException:
        _encerrar(
            fabrica, preparo.resposta_id, "".join(partes), StatusDaMensagem.INTERROMPIDA
        )
        raise

    texto = "".join(partes)
    dados: MissionCreate | None = None
    if codigo is None and not terminou:
        # O corte que o SDK nao denuncia: sem `Fim`, a resposta nao terminou.
        codigo = CodigoDoStream.PROVEDOR_INDISPONIVEL
    if codigo is None and proposta is not None:
        try:
            dados = MissionCreate.model_validate(proposta)
        except ValidationError:
            codigo = CodigoDoStream.PROPOSTA_INVALIDA

    if codigo is not None:
        _encerrar(fabrica, preparo.resposta_id, texto, StatusDaMensagem.FALHOU, codigo)
        yield RespostaFalhou(codigo)
        return

    concluida = _completar(fabrica, preparo.resposta_id, texto, dados, clock())
    if concluida is None:
        # Recolhida como orfa enquanto gerava: ela ja esta `interrompida`.
        yield RespostaFalhou(CodigoDoStream.TEMPO_ESGOTADO)
        return
    yield RespostaConcluida(concluida)


# O nome da restricao unica do identificador de confirmacao: e por ele que o
# IntegrityError do conflito e reconhecido (o mesmo cuidado do `missions`).
UNICIDADE_DA_CONFIRMACAO = "uq_tutor_actions_operation_id"


@dataclass(frozen=True)
class Executada:
    acao: TutorAction
    missao: Mission


@dataclass(frozen=True)
class PrazoExpirado:
    """O prazo proposto ja passou. A acao foi GRAVADA como `falhou`: o
    chamador commita e so depois traduz em 422."""

    acao: TutorAction


def confirmar_acao(
    session: Session,
    user_id: int,
    action_id: int,
    operation_id: str,
    *,
    clock: Clock,
) -> Executada | PrazoExpirado:
    """Confirma a proposta: cria a missao e executa a acao, na mesma transacao.

    Mesma ordem da conclusao da missao: TRAVA primeiro, hora e idempotencia
    depois. O reenvio do mesmo `operation_id` devolve o resultado de antes; um
    `operation_id` gasto em outra acao e chave gasta; uma acao ja decidida,
    com chave nova, e transicao ilegal.
    """
    acao = _buscar_acao(session, user_id, action_id)
    agora = clock()

    if acao.operation_id == operation_id:
        return _resultado_anterior(session, acao)
    if (
        session.scalar(
            select(TutorAction.id).where(TutorAction.operation_id == operation_id)
        )
        is not None
    ):
        raise OperacaoReutilizadaError(_reuso_da_confirmacao(operation_id))

    validar_transicao_da_acao(acao.state, EstadoDaAcao.EXECUTADA)
    dados = MissionCreate.model_validate(acao.payload)
    try:
        if dados.deadline <= agora:
            # `operation_id` e `decided_at` entram JUNTO com o `state`, nunca
            # antes: gravar os dois com a acao ainda `proposta` violaria o
            # CHECK `ck_tutor_actions_decisao_datada` no flush interno do
            # `criar_missao`, que roda antes de `acao.state` mudar.
            acao.state = EstadoDaAcao.FALHOU
            acao.error_code = PRAZO_EXPIRADO
            acao.operation_id = operation_id
            acao.decided_at = agora
            session.flush()
            return PrazoExpirado(acao)
        missao = criar_missao(
            session,
            user_id=user_id,
            instructions=dados.instructions,
            completion_criterion=dados.completion_criterion,
            difficulty=dados.difficulty,
            estimated_minutes=dados.estimated_minutes,
            deadline=dados.deadline,
        )
        acao.state = EstadoDaAcao.EXECUTADA
        acao.mission_id = missao.id
        acao.operation_id = operation_id
        acao.decided_at = agora
        session.flush()
    except IntegrityError as erro:
        # A janela que a trava NAO fecha: duas acoes diferentes com a mesma
        # chave nao disputam trava nenhuma. Quem recusa e a UNIQUE.
        if UNICIDADE_DA_CONFIRMACAO not in str(erro.orig):
            raise
        raise OperacaoReutilizadaError(_reuso_da_confirmacao(operation_id)) from erro
    return Executada(acao, missao)


def rejeitar_acao(
    session: Session, user_id: int, action_id: int, *, clock: Clock
) -> TutorAction:
    """Recusa a proposta. Recusar de novo devolve a mesma recusa, com o
    instante da primeira."""
    acao = _buscar_acao(session, user_id, action_id)
    if acao.state is EstadoDaAcao.RECUSADA:
        return acao
    validar_transicao_da_acao(acao.state, EstadoDaAcao.RECUSADA)
    acao.state = EstadoDaAcao.RECUSADA
    acao.decided_at = clock()
    session.flush()
    return acao


def listar_mensagens(session: Session, user_id: int) -> list[TutorMessage]:
    """As ultimas `MENSAGENS_NA_TELA` mensagens, em ordem cronologica, com as
    acoes embutidas (`selectin` no relacionamento)."""
    recentes = session.scalars(
        select(TutorMessage)
        .where(TutorMessage.user_id == user_id)
        .order_by(TutorMessage.id.desc())
        .limit(MENSAGENS_NA_TELA)
    ).all()
    return list(reversed(recentes))


def _recolher_orfaos(session: Session, user_id: int, antes_de: datetime) -> None:
    """Marca como `interrompida` a `gerando` velha demais para estar viva.

    Sem isto, um processo morto no meio de uma resposta travaria a conversa
    para sempre: o indice parcial nao deixa nascer outra `gerando`.
    """
    session.execute(
        update(TutorMessage)
        .where(
            TutorMessage.user_id == user_id,
            TutorMessage.status == StatusDaMensagem.GERANDO,
            TutorMessage.created_at < antes_de,
        )
        .values(status=StatusDaMensagem.INTERROMPIDA)
    )


def _historico(session: Session, user_id: int, quantas: int) -> list[TutorMessage]:
    """As ultimas `quantas` mensagens COMPLETAS, em ordem cronologica.

    As `interrompida` e `falhou` ficam fora: meio texto confunde o modelo.
    """
    recentes = session.scalars(
        select(TutorMessage)
        .where(
            TutorMessage.user_id == user_id,
            TutorMessage.status == StatusDaMensagem.COMPLETA,
        )
        .order_by(TutorMessage.id.desc())
        .limit(quantas)
    ).all()
    return list(reversed(recentes))


def _encerrar(
    fabrica: Callable[[], Session],
    resposta_id: int,
    texto: str,
    status: StatusDaMensagem,
    codigo: CodigoDoStream | None = None,
) -> None:
    """Grava o fim sem sucesso -- so sobre uma linha ainda `gerando`."""
    with fabrica() as session:
        session.execute(
            update(TutorMessage)
            .where(
                TutorMessage.id == resposta_id,
                TutorMessage.status == StatusDaMensagem.GERANDO,
            )
            .values(status=status, content=texto, error_code=codigo)
        )
        session.commit()


def _completar(
    fabrica: Callable[[], Session],
    resposta_id: int,
    texto: str,
    dados: MissionCreate | None,
    agora: datetime,
) -> TutorMessage | None:
    """Grava a resposta completa e a acao proposta, na MESMA transacao.

    A trava na linha evita a corrida com o recolhimento de orfaos: se a linha
    ja nao esta `gerando`, ela foi recolhida, e nada e gravado.
    """
    with fabrica() as session:
        resposta = session.get(TutorMessage, resposta_id, with_for_update=True)
        assert resposta is not None
        if resposta.status is not StatusDaMensagem.GERANDO:
            return None
        resposta.status = StatusDaMensagem.COMPLETA
        resposta.content = texto
        if dados is not None:
            session.add(
                TutorAction(
                    message_id=resposta.id,
                    kind=TipoDeAcao.CRIAR_MISSAO,
                    payload=dados.model_dump(mode="json"),
                    state=EstadoDaAcao.PROPOSTA,
                    created_at=agora,
                )
            )
        session.commit()
        session.refresh(resposta)
        return resposta


def _buscar_acao(session: Session, user_id: int, action_id: int) -> TutorAction:
    """A acao do usuario, travada (`FOR UPDATE`), ou `AcaoNaoEncontradaError`."""
    acao = session.get(TutorAction, action_id, with_for_update=True)
    if acao is None:
        raise AcaoNaoEncontradaError(f"acao {action_id} nao existe")
    mensagem = session.get(TutorMessage, acao.message_id)
    assert mensagem is not None
    if mensagem.user_id != user_id:
        raise AcaoNaoEncontradaError(
            f"acao {action_id} pertence a outro usuario, nao ao {user_id}"
        )
    return acao


def _resultado_anterior(
    session: Session, acao: TutorAction
) -> Executada | PrazoExpirado:
    """O que a confirmacao com esta chave produziu da primeira vez. So
    `executada` e `falhou` (prazo) gravam `operation_id`."""
    if acao.state is EstadoDaAcao.EXECUTADA:
        missao = session.get(Mission, acao.mission_id)
        assert missao is not None
        return Executada(acao, missao)
    return PrazoExpirado(acao)


def _reuso_da_confirmacao(operation_id: str) -> str:
    return (
        f"o identificador de operacao '{operation_id}' ja pertence a outra "
        "confirmacao; envie um identificador novo"
    )
