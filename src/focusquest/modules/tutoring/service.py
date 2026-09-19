"""Casos de uso da tutoria: a conversa com a Tifa e as acoes dela.

O envio de uma pergunta tem DUAS fases, e a divisao e o que torna o stream
seguro:

1. `preparar_turno`, numa transacao curta que o chamador commita ANTES de
   abrir o stream: recolhe orfaos, trava o usuario, grava a pergunta e a
   resposta `gerando`. Nenhuma transacao fica aberta durante a geracao.
2. `transmitir`, um gerador que chama o provedor e grava o final em sessoes
   PROPRIAS. Ele nao pode usar a sessao da requisicao: na desconexao, a
   dependencia `get_session` fecha antes do `finally` do gerador (medicao M2).

Nenhuma funcao daqui conhece HTTP, e nenhuma conhece o SDK.
"""

from collections.abc import Callable, Generator
from dataclasses import dataclass
from datetime import datetime, timedelta

from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from focusquest.core.clock import Clock
from focusquest.core.errors import MensagemEmAndamentoError, OperacaoReutilizadaError
from focusquest.modules.missions.domain import MissionState
from focusquest.modules.missions.models import User
from focusquest.modules.missions.schemas import MissionCreate
from focusquest.modules.missions.service import listar_missoes
from focusquest.modules.tutoring.context import montar_turno
from focusquest.modules.tutoring.domain import (
    CodigoDoStream,
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
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
# limite e total (medicao M5), entao uma geracao viva nunca passa dele; a
# folga cobre a gravacao final e o relogio de maquinas diferentes.
FOLGA_DO_ORFAO = timedelta(seconds=30)

# Quantas mensagens o GET devolve. Sem paginacao no 1b (spec, "Fora").
MENSAGENS_NA_TELA = 50


@dataclass(frozen=True)
class Tutoria:
    """O provedor e os dois numeros que o servico usa, vindos do `Settings`."""

    provedor: Provedor
    historico: int
    limite: timedelta


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
    desconhecido, que o cliente resolve com "Tentar de novo".
    """
    yield PerguntaGravada(preparo.pergunta)
    if isinstance(preparo, JaRespondida):
        yield RespostaConcluida(preparo.resposta)
        return

    partes: list[str] = []
    proposta: dict[str, object] | None = None
    terminou = False
    codigo: CodigoDoStream | None = None
    eventos = tutoria.provedor.responder(preparo.turno)
    inicio = clock()
    try:
        try:
            for evento in eventos:
                if isinstance(evento, Delta):
                    partes.append(evento.texto)
                    yield Trecho(evento.texto)
                elif isinstance(evento, Proposta):
                    proposta = evento.entrada
                else:
                    terminou = True
                # Limite TOTAL, pelo relogio injetavel (medicao M5).
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
        # O corte que o SDK nao denuncia (medicao M3).
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
