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
from datetime import UTC, datetime, timedelta

from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from focusquest.core.clock import Clock
from focusquest.core.errors import (
    AcaoNaoEncontradaError,
    MensagemEmAndamentoError,
    MissaoNaoEncontradaError,
    NaoPertenceAoUsuarioError,
    OperacaoReutilizadaError,
    PrazoDerivadoError,
    PrazoExpiradoError,
    PrazoInalteradoError,
)
from focusquest.modules.missions.cycle_service import ler_ciclo
from focusquest.modules.missions.domain import (
    MissionState,
    OrigemDoReagendamento,
    TransicaoIlegalError,
)
from focusquest.modules.missions.models import Mission, MissionReschedule, User
from focusquest.modules.missions.schemas import MissionCreate
from focusquest.modules.missions.service import (
    criar_missao,
    listar_missoes,
    missao_reagendavel,
    reagendar_missao,
)
from focusquest.modules.progression.service import ler_progresso
from focusquest.modules.tutoring.context import montar_turno, tardias_do_ciclo
from focusquest.modules.tutoring.domain import (
    PRAZO_EXPIRADO,
    REAGENDAMENTO_INVALIDO,
    RESPOSTA_LONGA,
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
    Parada,
    Proposta,
    Provedor,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)
from focusquest.modules.tutoring.schemas import (
    CAMPOS_DO_RETRATO,
    RescheduleProposal,
    RetratoDoReagendamento,
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

# A entrada validada de uma proposta: o tipo diz qual ferramenta foi (F18).
DadosDaProposta = MissionCreate | RescheduleProposal

# O esquema de cada ferramenta de proposta, pelo NOME que o modelo chamou
# (F18). Nome fora daqui e `proposta_invalida`: com duas ferramentas, a
# entrada sozinha nao diz o que o modelo pediu, e validar pelo formato faria
# uma `reschedule_mission` com corpo de criacao virar uma criacao.
_ESQUEMA_DA_FERRAMENTA: dict[str, type[DadosDaProposta]] = {
    TipoDeAcao.CRIAR_MISSAO: MissionCreate,
    TipoDeAcao.REAGENDAR_MISSAO: RescheduleProposal,
}


@dataclass(frozen=True)
class _Recolhida:
    """`_completar` achou a resposta ja recolhida como orfa: nada gravado."""


@dataclass(frozen=True)
class _PreCondicaoRecusada:
    """`_completar` gravou a resposta `falhou`/`proposta_invalida`: a missao
    da proposta de reagendamento nao pode ser reagendada (F16)."""


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
        # O ciclo lido no MESMO instante do turno (pendencia 117): a
        # conclusao tardia depende do relogio, e um segundo `clock()` poderia
        # cair do outro lado de uma meia-noite.
        tardias=tardias_do_ciclo(
            ler_ciclo(session, user_id, clock=lambda: agora), agora
        ),
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
    A mensagem do `RespostaConcluida` e `completa` ou, quando um limite de
    tamanho cortou a resposta (`Parada.CORTADA`, pendencias 45 e 120),
    `interrompida` com `error_code` `resposta_longa`, o texto parcial e sem
    acao. A recusa (`Parada.RECUSADA`) e `falhou` com `resposta_recusada`,
    sem o texto parcial e sem acao. A recusa que o fallback do servidor
    resolveu (pendencia 174) nao e `RECUSADA`: o parcial e o comeco da
    resposta, que o substituto continuou, e o modelo dele vai para
    `fallback_model`.

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
    proposta: Proposta | None = None
    terminou = False
    parada = Parada.TERMINOU
    substituto: str | None = None
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
                    proposta = evento
                else:
                    terminou = True
                    parada = evento.parada
                    substituto = evento.substituto
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
    dados: DadosDaProposta | None = None
    if codigo is None and not terminou:
        # O corte que o SDK nao denuncia: sem `Fim`, a resposta nao terminou.
        codigo = CodigoDoStream.PROVEDOR_INDISPONIVEL
    cortada = parada is Parada.CORTADA
    if cortada:
        # Um limite de tamanho cortou a resposta (pendencias 45 e 120): o texto
        # parcial fica gravado e visivel, mas `interrompida`, e a proposta --
        # que pode ter chegado pela metade -- nao vira acao.
        proposta = None
    if parada is Parada.RECUSADA:
        # A recusa (pendencia 120): o parcial que veio antes dela nao e
        # resposta, e a orientacao da API e descarta-lo. A resposta vai a
        # `falhou`, com o motivo -- e, com `codigo`, a proposta nem e validada.
        # A recusa VENCE um limite total estourado: com o `Fim` recebido, o
        # limite so pode ter passado nesse ultimo evento, e o motivo
        # verdadeiro e a recusa (o `Fim` e o ultimo evento do provedor).
        texto = ""
        codigo = CodigoDoStream.RESPOSTA_RECUSADA
    if codigo is None and proposta is not None:
        dados = _validar_proposta(proposta)
        if dados is None:
            codigo = CodigoDoStream.PROPOSTA_INVALIDA

    if codigo is not None:
        _encerrar(fabrica, preparo.resposta_id, texto, StatusDaMensagem.FALHOU, codigo)
        yield RespostaFalhou(codigo)
        return

    status = StatusDaMensagem.INTERROMPIDA if cortada else StatusDaMensagem.COMPLETA
    motivo = RESPOSTA_LONGA if cortada else None
    desfecho = _completar(
        fabrica, preparo.resposta_id, texto, dados, clock(), status, motivo, substituto
    )
    if isinstance(desfecho, _Recolhida):
        # Recolhida como orfa enquanto gerava: ela ja esta `interrompida`.
        yield RespostaFalhou(CodigoDoStream.TEMPO_ESGOTADO)
        return
    if isinstance(desfecho, _PreCondicaoRecusada):
        # Gravada `falhou` pelo `_completar`, ja commitada.
        yield RespostaFalhou(CodigoDoStream.PROPOSTA_INVALIDA)
        return
    yield RespostaConcluida(desfecho)


def _validar_proposta(proposta: Proposta) -> DadosDaProposta | None:
    """A entrada validada pelo esquema da ferramenta chamada, ou `None`."""
    esquema = _ESQUEMA_DA_FERRAMENTA.get(proposta.nome)
    if esquema is None:
        return None
    try:
        return esquema.model_validate(proposta.entrada)
    except ValidationError:
        return None


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


@dataclass(frozen=True)
class ReagendamentoInvalido:
    """A missao nao aceita mais o reagendamento proposto (F17). A acao foi
    GRAVADA como `falhou`: o chamador commita e so depois traduz em 409."""

    acao: TutorAction


ResultadoDaConfirmacao = Executada | PrazoExpirado | ReagendamentoInvalido

# O que o `reagendar_missao` recusa porque a MISSAO mudou depois da proposta
# (F17): sumiu, e de outro, foi concluida, ja tem aquele prazo ou tem prazo
# derivado. Todos viram `reagendamento_invalido`: a tela oferece a mesma
# saida (pedir outra proposta). `PrazoExpiradoError` tem destino proprio, e
# `OperacaoReutilizadaError` sobe sem gravar nada.
_MISSAO_MUDOU = (
    MissaoNaoEncontradaError,
    NaoPertenceAoUsuarioError,
    TransicaoIlegalError,
    PrazoInalteradoError,
    PrazoDerivadoError,
)


def confirmar_acao(
    session: Session,
    user_id: int,
    action_id: int,
    operation_id: str,
    *,
    clock: Clock,
) -> ResultadoDaConfirmacao:
    """Confirma a proposta e a executa, na mesma transacao.

    Mesma ordem da conclusao da missao: TRAVA primeiro, hora e idempotencia
    depois. O reenvio do mesmo `operation_id` devolve o resultado de antes; um
    `operation_id` gasto em outra acao e chave gasta; uma acao ja decidida,
    com chave nova, e transicao ilegal. So entao o `kind` decide o que
    executar.

    A ordem das travas e acao -> missao (F14): a acao aqui, a missao dentro do
    `reagendar_missao`. Nenhum caminho trava a missao antes de uma acao.
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
    try:
        if acao.kind is TipoDeAcao.REAGENDAR_MISSAO:
            return _confirmar_reagendamento(session, user_id, acao, operation_id, clock)
        dados = MissionCreate.model_validate(acao.payload)
        if dados.deadline <= agora:
            # `operation_id` e `decided_at` entram JUNTO com o `state`, nunca
            # antes: gravar os dois com a acao ainda `proposta` violaria o
            # CHECK `ck_tutor_actions_decisao_datada` no flush interno do
            # `criar_missao`, que roda antes de `acao.state` mudar.
            _gravar_falha(acao, PRAZO_EXPIRADO, operation_id, agora)
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
        # chave nao disputam trava nenhuma. Quem recusa e a UNIQUE -- nos dois
        # tipos de acao, inclusive no `flush` da falha gravada.
        if UNICIDADE_DA_CONFIRMACAO not in str(erro.orig):
            raise
        raise OperacaoReutilizadaError(_reuso_da_confirmacao(operation_id)) from erro
    return Executada(acao, missao)


def _confirmar_reagendamento(
    session: Session,
    user_id: int,
    acao: TutorAction,
    operation_id: str,
    clock: Clock,
) -> ResultadoDaConfirmacao:
    """Executa a proposta de reagendamento pelo MESMO `reagendar_missao` da
    tela, com `origin = tifa` e a chave da confirmacao (F15, F17).

    Revalida so os tres campos do modelo; o retrato (`CAMPOS_DO_RETRATO`) e o
    que a pessoa viu, e nao decide nada -- o `previous_deadline` do historico
    e o prazo que a trava da missao le. O `payload` vem do banco, gravado ja
    validado; a revalidacao e a mesma cautela da criacao (pendencia 47).

    Toda recusa do `reagendar_missao` vem antes da primeira escrita dele, e e
    isso que deixa gravar a falha na acao aqui, na mesma transacao. O
    `IntegrityError` da UNIQUE da chave (tambem no `flush` da falha) e
    traduzido pelo `try` do `confirmar_acao`, que envolve esta chamada.
    """
    entrada = {
        campo: valor
        for campo, valor in acao.payload.items()
        if campo not in CAMPOS_DO_RETRATO
    }
    dados = RescheduleProposal.model_validate(entrada)
    try:
        missao = reagendar_missao(
            session,
            user_id,
            dados.mission_id,
            operation_id,
            novo_prazo=dados.new_deadline,
            motivo=dados.reason,
            origem=OrigemDoReagendamento.TIFA,
            clock=clock,
        )
    except PrazoExpiradoError:
        _gravar_falha(acao, PRAZO_EXPIRADO, operation_id, clock())
        session.flush()
        return PrazoExpirado(acao)
    except _MISSAO_MUDOU:
        _gravar_falha(acao, REAGENDAMENTO_INVALIDO, operation_id, clock())
        session.flush()
        return ReagendamentoInvalido(acao)
    _exigir_elo_da_tifa(session, operation_id)
    acao.state = EstadoDaAcao.EXECUTADA
    acao.mission_id = missao.id
    acao.operation_id = operation_id
    acao.decided_at = clock()
    session.flush()
    return Executada(acao, missao)


def _exigir_elo_da_tifa(session: Session, operation_id: str) -> None:
    """O elo desta chave tem de ser da Tifa.

    O `reagendar_missao` trata a mesma chave, na mesma missao, com o mesmo
    prazo e o mesmo motivo como REENVIO, e devolve a missao sem gravar. Se a
    chave foi gasta pela TELA, a acao se diria executada por um reagendamento
    que a pessoa fez sozinha (`origin = usuario`): e chave gasta. Uma chave
    gasta por outra confirmacao da Tifa ja foi recusada antes (ou o sera pela
    UNIQUE de `tutor_actions`).
    """
    origem = session.scalar(
        select(MissionReschedule.origin).where(
            MissionReschedule.operation_id == operation_id
        )
    )
    if origem is not OrigemDoReagendamento.TIFA:
        raise OperacaoReutilizadaError(_reuso_da_confirmacao(operation_id))


def _gravar_falha(
    acao: TutorAction, codigo: str, operation_id: str, agora: datetime
) -> None:
    """`falhou` com o codigo, a chave e o instante JUNTOS (o CHECK
    `ck_tutor_actions_decisao_datada` recusa a chave numa acao `proposta`)."""
    acao.state = EstadoDaAcao.FALHOU
    acao.error_code = codigo
    acao.operation_id = operation_id
    acao.decided_at = agora


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
    Fica fora tambem a PERGUNTA cuja tentativa mais recente foi recusada
    (`resposta_recusada`): sem isso, o texto que disparou a recusa voltaria ao
    modelo em todo turno seguinte. Ela continua gravada e na tela; reenviada,
    a tentativa mais recente passa a ser a nova, e ela volta ao contexto.
    """
    tentativa = aliased(TutorMessage)
    posterior = aliased(TutorMessage)
    recusada_por_ultimo = (
        select(tentativa.id)
        .where(
            tentativa.reply_to_id == TutorMessage.id,
            tentativa.status == StatusDaMensagem.FALHOU,
            tentativa.error_code == CodigoDoStream.RESPOSTA_RECUSADA,
            ~select(posterior.id)
            .where(
                posterior.reply_to_id == TutorMessage.id,
                posterior.id > tentativa.id,
            )
            # Dois niveis de subconsulta: sem isto, o SQLAlchemy poe
            # `tutor_messages` no FROM da interna e ela deixa de olhar a
            # pergunta de fora (medido no SQL compilado).
            .correlate_except(posterior)
            .exists(),
        )
        .exists()
    )
    recentes = session.scalars(
        select(TutorMessage)
        .where(
            TutorMessage.user_id == user_id,
            TutorMessage.status == StatusDaMensagem.COMPLETA,
            ~recusada_por_ultimo,
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
    dados: DadosDaProposta | None,
    agora: datetime,
    status: StatusDaMensagem,
    motivo: str | None,
    substituto: str | None,
) -> TutorMessage | _Recolhida | _PreCondicaoRecusada:
    """Grava a resposta que chegou ao `Fim` e a acao proposta, na MESMA transacao.

    `status` e `completa`, ou `interrompida` quando um limite de tamanho
    cortou a resposta -- e entao `motivo` e `RESPOSTA_LONGA`, gravado no
    `error_code`, e `dados` e sempre None: nenhuma proposta, de criacao ou de
    reagendamento, vira acao.

    `substituto` e o modelo que serviu a resposta depois de uma recusa
    (fallback, pendencia 174), gravado em `fallback_model`; `None` quando foi
    o modelo pedido. So aqui: a resposta que nao veio (`falhou`, inclusive a
    cadeia esgotada) nao grava quem tentou.

    A trava na linha evita a corrida com o recolhimento de orfaos: se a linha
    ja nao esta `gerando`, ela foi recolhida, e nada e gravado.

    A proposta de reagendamento confere a pre-condicao aqui, com a resposta
    travada (F16): a missao existe, e do usuario, e avulsa e nao esta
    concluida. Se nao, a resposta vai a `falhou`/`proposta_invalida` com o
    texto, e nenhuma acao nasce.
    """
    with fabrica() as session:
        resposta = session.get(TutorMessage, resposta_id, with_for_update=True)
        assert resposta is not None
        if resposta.status is not StatusDaMensagem.GERANDO:
            return _Recolhida()
        resposta.content = texto
        if isinstance(dados, RescheduleProposal):
            payload = _payload_do_reagendamento(session, resposta.user_id, dados)
            if payload is None:
                resposta.status = StatusDaMensagem.FALHOU
                resposta.error_code = CodigoDoStream.PROPOSTA_INVALIDA
                session.commit()
                return _PreCondicaoRecusada()
            session.add(
                TutorAction(
                    message_id=resposta.id,
                    kind=TipoDeAcao.REAGENDAR_MISSAO,
                    payload=payload,
                    state=EstadoDaAcao.PROPOSTA,
                    created_at=agora,
                )
            )
        elif dados is not None:
            session.add(
                TutorAction(
                    message_id=resposta.id,
                    kind=TipoDeAcao.CRIAR_MISSAO,
                    payload=dados.model_dump(mode="json"),
                    state=EstadoDaAcao.PROPOSTA,
                    created_at=agora,
                )
            )
        resposta.status = status
        resposta.error_code = motivo
        resposta.fallback_model = substituto
        session.commit()
        session.refresh(resposta)
        return resposta


def _payload_do_reagendamento(
    session: Session, user_id: int, dados: RescheduleProposal
) -> dict[str, object] | None:
    """A entrada do modelo, com o prazo em UTC, mais o retrato escrito pelo
    backend (`CAMPOS_DO_RETRATO`, F16) -- ou `None` se a missao nao pode ser
    reagendada. O modelo nunca escolhe o retrato: `extra='forbid'` recusou
    qualquer campo a mais antes daqui.

    O prazo vai em UTC pelo mesmo motivo do `reagendar_missao`: o cartao e a
    confirmacao leem o MESMO instante na mesma grafia (`Z`), qualquer que
    seja o offset que o modelo escreveu.
    """
    alvo = missao_reagendavel(session, user_id, dados.mission_id)
    if alvo is None:
        return None
    normalizada = dados.model_copy(
        update={"new_deadline": dados.new_deadline.astimezone(UTC)}
    )
    retrato = RetratoDoReagendamento(
        instructions=alvo.instructions, previous_deadline=alvo.deadline
    )
    return normalizada.model_dump(mode="json") | retrato.model_dump(mode="json")


def _buscar_acao(session: Session, user_id: int, action_id: int) -> TutorAction:
    """A acao do usuario, travada (`FOR UPDATE`), ou `AcaoNaoEncontradaError`.

    `populate_existing` junto com a trava, pelo motivo de
    `buscar_para_escrever`: sem ele, uma acao que ja estava no identity map
    desta sessao NAO e sobrescrita pela linha travada, e a decisao seria
    tomada sobre o estado de antes da espera -- uma proposta recusada por
    outra conexao seria executada (provado por
    `test_a_acao_ja_carregada_na_sessao_e_relida_depois_da_trava`).
    """
    acao = session.get(
        TutorAction, action_id, with_for_update=True, populate_existing=True
    )
    if acao is None:
        raise AcaoNaoEncontradaError(f"acao {action_id} nao existe")
    mensagem = session.get(TutorMessage, acao.message_id)
    assert mensagem is not None
    if mensagem.user_id != user_id:
        raise AcaoNaoEncontradaError(
            f"acao {action_id} pertence a outro usuario, nao ao {user_id}"
        )
    return acao


def _resultado_anterior(session: Session, acao: TutorAction) -> ResultadoDaConfirmacao:
    """O que a confirmacao com esta chave produziu da primeira vez. So
    `executada` e `falhou` (prazo expirado ou reagendamento invalido) gravam
    `operation_id`."""
    if acao.state is EstadoDaAcao.EXECUTADA:
        missao = session.get(Mission, acao.mission_id)
        assert missao is not None
        return Executada(acao, missao)
    if acao.error_code == REAGENDAMENTO_INVALIDO:
        return ReagendamentoInvalido(acao)
    return PrazoExpirado(acao)


def _reuso_da_confirmacao(operation_id: str) -> str:
    return (
        f"o identificador de operacao '{operation_id}' ja pertence a outra "
        "confirmacao; envie um identificador novo"
    )
