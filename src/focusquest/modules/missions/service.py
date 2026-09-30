"""Casos de uso da missao: orquestram o dominio e a persistencia.

Nenhuma funcao daqui conhece `Request`, `Response` ou codigo HTTP -- a
traducao para a web e da Task 9. E nenhuma delas commita: quem abre a
transacao e quem a fecha. O servico faz `flush`, que e o suficiente para o
banco atribuir identificadores e aplicar restricoes, e deixa a decisao de
tornar tudo permanente para o dono da transacao.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.core.clock import Clock
from focusquest.core.errors import (
    MissaoExpiradaError,
    MissaoNaoEncontradaError,
    NaoPertenceAoUsuarioError,
    OperacaoReutilizadaError,
    PrazoDerivadoError,
    PrazoExpiradoError,
    PrazoInalteradoError,
)
from focusquest.modules.missions.cycle_domain import NAO_CONCLUIVEIS
from focusquest.modules.missions.cycle_service import ler_missao
from focusquest.modules.missions.domain import (
    MissionState,
    MissionType,
    MotivoDoReagendamento,
    OrigemDoReagendamento,
    ProblemaDoNovoPrazo,
    TipoDeOperacao,
    prazo_em_utc,
    problema_do_novo_prazo,
    validar_reagendamento,
    validar_transicao,
)
from focusquest.modules.missions.models import (
    Mission,
    MissionEvidence,
    MissionOperation,
    MissionReschedule,
)
from focusquest.modules.progression.service import registrar_conclusao

# O tipo da operacao registrada em `mission_operations.kind`: QUAL operacao
# aquele identificador nomeou. O inicio e o reagendamento tambem gravam
# aqui.
#
# A consulta de idempotencia NAO filtra por `kind`, e isso e deliberado. A
# restricao UNIQUE do banco e sobre `operation_id` SOZINHO, entao uma chave
# gasta num inicio ja esta gasta para a conclusao. Filtrar por tipo faria a
# consulta nao enxergar essa chave, e o INSERT seguinte esbarraria na UNIQUE
# assim mesmo -- trocando um erro de dominio explicado por uma violacao crua.
# A consulta le todos os tipos e CONFERE o tipo depois; e o que mantem a regra
# do banco e a do codigo falando da mesma coisa.
CONCLUSAO = TipoDeOperacao.CONCLUSAO
INICIO = TipoDeOperacao.INICIO
REAGENDAMENTO = TipoDeOperacao.REAGENDAMENTO

# O nome que a migracao deu a restricao unica. Serve para reconhecer QUAL
# IntegrityError e o conflito de identificador: traduzir qualquer
# IntegrityError faria uma violacao de chave estrangeira ser reportada ao
# cliente como "chave reutilizada", que e mentira.
UNICIDADE_DA_OPERACAO = "uq_mission_operations_operation_id"


def criar_missao(
    session: Session,
    *,
    user_id: int,
    instructions: str,
    completion_criterion: str,
    difficulty: int,
    estimated_minutes: int,
    deadline: datetime,
) -> Mission:
    """Cria a missao em PENDENTE e devolve com o `id` ja atribuido.

    Os argumentos sao somente-nomeados de proposito: `difficulty` e
    `estimated_minutes` sao dois `int` seguidos, e trocar a ordem deles
    produziria uma missao de dificuldade 60 e sessenta minutos... que o
    CHECK do banco aceitaria sem reclamar. Nomear e o que impede o erro que
    nenhuma restricao pega.

    O `state` e passado explicitamente, e nao deixado por conta do
    `server_default` da coluna. O motivo esta em
    `test_criar_nao_depende_do_default_do_banco`: sem ele, o estado inicial
    da missao passaria a ser uma decisao do esquema, visivel so depois que o
    INSERT volta -- e `Mapped[MissionState]` promete um valor que o objeto
    ainda nao teria.
    """
    missao = Mission(
        user_id=user_id,
        mission_type=MissionType.AVULSA,
        instructions=instructions,
        completion_criterion=completion_criterion,
        difficulty=difficulty,
        estimated_minutes=estimated_minutes,
        deadline=deadline,
        state=MissionState.PENDENTE,
    )
    session.add(missao)
    # O flush existe porque o chamador precisa do `id`: sem ele a missao
    # recem-criada nao tem como ser referenciada pela resposta da API.
    session.flush()
    return missao


def listar_missoes(session: Session, user_id: int) -> list[Mission]:
    """As missoes do usuario, da que vence primeiro para a que vence por ultimo.

    A ordem e parte do contrato, nao um detalhe: sem `order_by` o PostgreSQL
    pode devolver as linhas em qualquer ordem, e a lista mudaria de ordem
    sozinha entre dois carregamentos da tela. `id` entra como desempate para
    que dois prazos iguais tambem tenham ordem definida.

    So avulsas: a diaria e a especial aparecem pelo ciclo (`GET /api/cycle`), e
    listar uma diaria futura aqui a revelaria (C11).
    """
    return list(
        session.scalars(
            select(Mission)
            .where(
                Mission.user_id == user_id,
                Mission.mission_type == MissionType.AVULSA,
            )
            .order_by(Mission.deadline, Mission.id)
        )
    )


@dataclass(frozen=True)
class NovaEvidencia:
    """A evidencia de uma conclusao, ja validada pela borda (E3)."""

    texto: str
    link: str | None


def _mesma_evidencia(
    gravada: MissionEvidence | None, pedida: NovaEvidencia | None
) -> bool:
    """O reenvio so e o MESMO pedido se trouxer a MESMA evidencia (ou nenhuma
    nas duas vezes): "mesmo id, outro conteudo" e chave gasta, como o
    `client_message_id` da conversa (1b-1)."""
    if gravada is None or pedida is None:
        return gravada is None and pedida is None
    return (gravada.text, gravada.link) == (pedida.texto, pedida.link)


def concluir_missao(
    session: Session,
    user_id: int,
    mission_id: int,
    operation_id: str,
    *,
    clock: Clock,
    evidencia: NovaEvidencia | None = None,
) -> Mission:
    """Conclui a missao, de forma idempotente pelo identificador de operacao.

    Sao DOIS comportamentos opostos, e confundi-los quebra o cliente ou deixa
    passar conclusao duplicada:

    - **Mesma operacao, reenviada** (a rede caiu, o dedo bateu duas vezes):
      devolve o MESMO sucesso de antes, sem erro. Reenviar nao e erro.
    - **Operacao NOVA sobre missao ja concluida**: e uma tentativa nova de
      transicao ilegal, e recebe `TransicaoIlegalError` explicando o bloqueio.

    A ordem das duas primeiras linhas e o que faz isso valer tambem sob
    concorrencia, e nao so na repeticao sequencial. O `SELECT ... FOR UPDATE`
    vem ANTES da consulta a mission_operations: ele e o ponto de
    serializacao, e tudo depois dele acontece com a missao travada. Duas
    conexoes simultaneas entram uma de cada vez, e a segunda le o resultado
    ja commitado da primeira -- encontrando a operacao, se for reenvio, ou o
    estado `concluida`, se for operacao nova.

    Inverter as duas linhas parece equivalente e nao e: consultar
    mission_operations antes de travar faz com que dois reenvios SIMULTANEOS
    da mesma operacao nao encontrem nada, e o segundo receba erro em vez do
    sucesso repetido -- justamente a promessa que a idempotencia existe para
    cumprir.

    Reusar um `operation_id` em OUTRA missao, ou na MESMA com OUTRA evidencia,
    nao e nenhuma das duas coisas: e chave gasta, e recebe
    `OperacaoReutilizadaError`. Esse caso tem dois
    caminhos possiveis -- a consulta abaixo encontra a operacao alheia, ou a
    restricao unica recusa o INSERT quando a operacao alheia foi gravada
    depois da consulta -- e os DOIS terminam no mesmo erro. Sem isso, o mesmo
    engano do cliente daria 200 em sequencia e 500 em paralelo, conforme o
    escalonador.
    """
    missao = buscar_para_escrever(session, user_id, mission_id, travar=True)

    # A hora e lida AQUI, com a linha ja travada, e nao antes da busca
    # (decisao C13 da spec do ciclo diario). Lida antes, uma conclusao que
    # esperasse a trava de outra carregaria um instante anterior a espera. A
    # hora decide a ocultacao, a regra do dia e o `completed_at`.
    # Provado por `test_relogio_e_lido_com_a_linha_ja_travada`.
    agora = clock()

    # Ocultacao ANTES do reenvio (spec, "Ordem da conclusao", passo 3): um
    # `operation_id` gasto em outra missao, mandado ao id de uma missao
    # oculta, cairia na checagem de reuso e receberia 409, enquanto um id
    # inexistente recebe 404 -- a diferenca revelaria que ela existe.
    # `ler_missao` levanta o mesmo `MissaoNaoEncontradaError` de "nao existe".
    lida = ler_missao(session, missao, agora)

    ja_feita = _operacao_gravada(session, operation_id)
    if ja_feita is not None:
        _exigir_mesma_operacao(ja_feita, mission_id, operation_id, CONCLUSAO)
        # Mesma chave, OUTRA evidencia: chave gasta, nao reenvio.
        if not _mesma_evidencia(missao.evidence, evidencia):
            raise OperacaoReutilizadaError(_reuso(operation_id))
        # Mesma missao e mesmo tipo: e reenvio, e o resultado e o de antes.
        # `missao` ja E a missao da operacao -- a conferencia acima garante.
        return missao

    # Regra do dia, so para o que nao foi concluido (a disponibilidade de uma
    # missao concluida e `concluida`, que nao esta em NAO_CONCLUIVEIS). Depois
    # do reenvio: a conclusao das 23:59:59 reenviada as 00:00:01 ja devolveu o
    # mesmo 200 acima.
    if lida.availability in NAO_CONCLUIVEIS:
        raise MissaoExpiradaError(
            f"missao {mission_id} nao pode mais ser concluida: "
            f"{lida.availability.value}"
        )

    validar_transicao(missao.state, MissionState.CONCLUIDA)
    missao.state = MissionState.CONCLUIDA
    missao.completed_at = agora
    if evidencia is not None:
        missao.evidence = MissionEvidence(
            text=evidencia.texto, link=evidencia.link, submitted_at=agora
        )
    session.add(
        MissionOperation(
            operation_id=operation_id, mission_id=missao.id, kind=CONCLUSAO
        )
    )
    _gravar_operacao(session, operation_id)

    # O credito da progressao, na MESMA transacao (D3) e com a missao ja
    # travada. Depois do `flush` da operacao, e nao antes (decisao P1 do plano
    # do D): antes, o autoflush das consultas da progressao gravaria a
    # operacao FORA do `try` que traduz o reuso de chave.
    registrar_conclusao(session, missao, agora)
    return missao


def _gravar_operacao(session: Session, operation_id: str) -> None:
    """O `flush` da operacao, com a janela que a trava NAO fecha: duas missoes
    diferentes com a mesma chave nao disputam trava, e quem recusa e a UNIQUE
    -- a recusa sai com a mesma cara do caminho sequencial."""
    try:
        session.flush()
    except IntegrityError as erro:
        if UNICIDADE_DA_OPERACAO not in str(erro.orig):
            raise
        raise OperacaoReutilizadaError(_reuso(operation_id)) from erro


def _operacao_gravada(session: Session, operation_id: str) -> MissionOperation | None:
    return session.scalar(
        select(MissionOperation).where(MissionOperation.operation_id == operation_id)
    )


def iniciar_missao(
    session: Session,
    user_id: int,
    mission_id: int,
    operation_id: str,
    *,
    clock: Clock,
) -> Mission:
    """Inicia a missao (F1-F3), na MESMA ordem da conclusao: trava, relogio,
    ocultacao, reenvio, regra do dia, transicao. Ver `concluir_missao` para o
    porque de cada passo; aqui so muda o destino e o `kind`."""
    missao = buscar_para_escrever(session, user_id, mission_id, travar=True)
    agora = clock()
    lida = ler_missao(session, missao, agora)

    ja_feita = _operacao_gravada(session, operation_id)
    if ja_feita is not None:
        _exigir_mesma_operacao(ja_feita, mission_id, operation_id, INICIO)
        return missao

    if lida.availability in NAO_CONCLUIVEIS:
        raise MissaoExpiradaError(
            f"missao {mission_id} nao pode mais ser iniciada: {lida.availability.value}"
        )

    validar_transicao(missao.state, MissionState.EM_ANDAMENTO)
    missao.state = MissionState.EM_ANDAMENTO
    missao.started_at = agora
    session.add(
        MissionOperation(operation_id=operation_id, mission_id=missao.id, kind=INICIO)
    )
    _gravar_operacao(session, operation_id)
    return missao


def reagendar_missao(
    session: Session,
    user_id: int,
    mission_id: int,
    operation_id: str,
    *,
    novo_prazo: datetime,
    motivo: MotivoDoReagendamento,
    origem: OrigemDoReagendamento,
    clock: Clock,
) -> Mission:
    """Troca o prazo e grava o elo do historico (F6-F13).

    A ordem e a da conclusao (trava, relogio, ocultacao, reenvio), e TODAS as
    recusas vem antes da primeira escrita: a confirmacao da Tifa (F17) grava a
    falha da acao depois de uma recusa daqui, na mesma transacao, e nada desta
    funcao pode ter ido ao banco antes dela.

    O `novo_prazo` e normalizado para UTC na entrada, pelo mesmo motivo do
    `MissionCreate.deadline`: com `expire_on_commit=False` a primeira resposta
    serializaria o instante COM o offset que o cliente mandou (`-03:00`), e o
    reenvio, lido do banco, o mesmo instante em `Z` -- o "mesmo corpo" (F13)
    nao seria o mesmo. Normalizar aqui vale para a tela e para a Tifa.
    `prazo_em_utc` recusa, com `ValueError` e antes de tudo, o instante sem fuso
    e o que nao cabe em UTC: `astimezone` sozinho aceitaria o primeiro com o
    fuso da maquina (revisao da T4, I1).
    """
    novo_prazo = prazo_em_utc(novo_prazo)
    missao = buscar_para_escrever(session, user_id, mission_id, travar=True)
    agora = clock()
    lida = ler_missao(session, missao, agora)

    ja_feita = _operacao_gravada(session, operation_id)
    if ja_feita is not None:
        _exigir_mesma_operacao(ja_feita, mission_id, operation_id, REAGENDAMENTO)
        gravado = session.scalars(
            select(MissionReschedule).where(
                MissionReschedule.operation_id == operation_id
            )
        ).one()
        # Mesma chave, OUTRO pedido: chave gasta (F13). Instantes comparam
        # como instantes.
        if (gravado.new_deadline, gravado.reason) != (novo_prazo, motivo):
            raise OperacaoReutilizadaError(_reuso(operation_id))
        return missao

    if missao.mission_type is not MissionType.AVULSA:
        raise PrazoDerivadoError(
            f"missao {mission_id} e {missao.mission_type.value}: o prazo vem do ciclo"
        )
    validar_reagendamento(missao.state)
    problema = problema_do_novo_prazo(novo_prazo, lida.deadline, agora)
    if problema is ProblemaDoNovoPrazo.NO_PASSADO:
        raise PrazoExpiradoError("o novo prazo precisa estar no futuro")
    if problema is ProblemaDoNovoPrazo.INALTERADO:
        raise PrazoInalteradoError("o novo prazo e igual ao prazo atual")

    # A operacao primeiro: a linha do historico tem FK para ela.
    session.add(
        MissionOperation(
            operation_id=operation_id, mission_id=missao.id, kind=REAGENDAMENTO
        )
    )
    _gravar_operacao(session, operation_id)
    missao.reschedules.append(
        MissionReschedule(
            operation_id=operation_id,
            previous_deadline=lida.deadline,
            new_deadline=novo_prazo,
            reason=motivo,
            origin=origem,
            rescheduled_at=agora,
        )
    )
    missao.deadline = novo_prazo
    session.flush()
    return missao


def missao_reagendavel(
    session: Session, user_id: int, mission_id: int
) -> Mission | None:
    """A missao que a Tifa pode propor reagendar (F16), ou `None`. Sem trava:
    e so a pre-condicao da PROPOSTA; a confirmacao revalida tudo com a trava."""
    missao = session.get(Mission, mission_id)
    if (
        missao is None
        or missao.user_id != user_id
        or missao.mission_type is not MissionType.AVULSA
        or missao.state is MissionState.CONCLUIDA
    ):
        return None
    return missao


def _reuso(operation_id: str) -> str:
    """A mensagem do reuso de identificador, escrita uma vez so.

    Ela explica o bloqueio (README s8) sem dizer NADA sobre a outra operacao:
    nem o id da missao, nem o tipo. Quem pediu nao tem direito a saber que a
    chave caiu numa missao especifica -- saber isso ja e informacao sobre um
    recurso que nao foi autorizado a ver. O `operation_id` aparece porque foi
    o proprio cliente que o enviou.
    """
    return (
        f"o identificador de operacao '{operation_id}' ja pertence a outra "
        "operacao; envie um identificador novo"
    )


def _exigir_mesma_operacao(
    ja_feita: MissionOperation, mission_id: int, operation_id: str, kind: str
) -> None:
    """Confere que a operacao encontrada e a MESMA que se esta pedindo.

    Duas dimensoes, e as duas importam:

    - **missao diferente**: a chave foi gasta em outra missao. Sem esta
      conferencia, `concluir_missao(missao_b, chave_da_missao_a)` devolveria
      a missao A como sucesso.
    - **tipo diferente**: a chave foi gasta em outra operacao da mesma
      missao. Sem esta conferencia, a chave do inicio reenviada na conclusao
      devolveria como "concluida" uma missao que so foi iniciada. E um
      registro de inicio, nao de conclusao.
    """
    if ja_feita.mission_id != mission_id or ja_feita.kind != kind:
        raise OperacaoReutilizadaError(_reuso(operation_id))


def buscar_para_escrever(
    session: Session, user_id: int, mission_id: int, *, travar: bool = False
) -> Mission:
    """A missao do usuario, ou o erro que explica o bloqueio (README s8).

    Os dois erros sao distintos por escolha: veja `NaoPertenceAoUsuarioError`.

    `travar=True` emite `SELECT ... FOR UPDATE`. Sob READ COMMITTED -- o
    isolamento padrao do PostgreSQL -- uma leitura comum nunca espera por
    ninguem, entao duas conexoes leem a mesma missao `pendente` e ambas
    concluem: o UPDATE da segunda espera a primeira, mas depois segue em
    frente sobre a versao nova da linha, sem erro nenhum. O resultado sao
    duas conclusoes e dois registros de operacao. `FOR UPDATE` move a espera
    para a LEITURA, que e onde a decisao e tomada.

    Com a trava, `populate_existing` tambem: o `SELECT ... FOR UPDATE` sai de
    qualquer jeito, mas, sem ele, uma missao que ja estava no identity map
    desta sessao NAO e sobrescrita pela linha lida -- a decisao seria tomada
    sobre o prazo e o estado de ANTES da espera (M3 da revisao da T4; provado
    por `test_a_missao_ja_carregada_na_sessao_e_relida_depois_da_trava`).
    """
    missao = session.get(
        Mission, mission_id, with_for_update=travar, populate_existing=travar
    )
    if missao is None:
        raise MissaoNaoEncontradaError(f"missao {mission_id} nao existe")
    if missao.user_id != user_id:
        raise NaoPertenceAoUsuarioError(
            f"missao {mission_id} nao pertence ao usuario {user_id}"
        )
    return missao
