"""Casos de uso da missao: orquestram o dominio e a persistencia.

Nenhuma funcao daqui conhece `Request`, `Response` ou codigo HTTP -- a
traducao para a web e da Task 9. E nenhuma delas commita: quem abre a
transacao e quem a fecha. O servico faz `flush`, que e o suficiente para o
banco atribuir identificadores e aplicar restricoes, e deixa a decisao de
tornar tudo permanente para o dono da transacao.
"""

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
)
from focusquest.modules.missions.cycle_domain import NAO_CONCLUIVEIS
from focusquest.modules.missions.cycle_service import ler_missao
from focusquest.modules.missions.domain import (
    MissionState,
    MissionType,
    validar_transicao,
)
from focusquest.modules.missions.models import Mission, MissionOperation
from focusquest.modules.progression.service import registrar_conclusao

# O tipo da operacao registrada em `mission_operations.kind`: QUAL operacao
# aquele identificador nomeou. Hoje so existe a conclusao; havera pelo menos
# o inicio.
#
# A consulta de idempotencia NAO filtra por `kind`, e isso e deliberado. A
# restricao UNIQUE do banco e sobre `operation_id` SOZINHO, entao uma chave
# gasta num inicio ja esta gasta para a conclusao. Filtrar por tipo faria a
# consulta nao enxergar essa chave, e o INSERT seguinte esbarraria na UNIQUE
# assim mesmo -- trocando um erro de dominio explicado por uma violacao crua.
# A consulta le todos os tipos e CONFERE o tipo depois; e o que mantem a regra
# do banco e a do codigo falando da mesma coisa.
CONCLUSAO = "complete"

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


def concluir_missao(
    session: Session,
    user_id: int,
    mission_id: int,
    operation_id: str,
    *,
    clock: Clock,
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

    Reusar um `operation_id` em OUTRA missao nao e nenhuma das duas coisas:
    e chave gasta, e recebe `OperacaoReutilizadaError`. Esse caso tem dois
    caminhos possiveis -- a consulta abaixo encontra a operacao alheia, ou a
    restricao unica recusa o INSERT quando a operacao alheia foi gravada
    depois da consulta -- e os DOIS terminam no mesmo erro. Sem isso, o mesmo
    engano do cliente daria 200 em sequencia e 500 em paralelo, conforme o
    escalonador.
    """
    missao = _buscar(session, user_id, mission_id, travar=True)

    # A hora e lida AQUI, com a linha ja travada, e nao antes do `_buscar`
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

    ja_feita = session.scalar(
        select(MissionOperation).where(MissionOperation.operation_id == operation_id)
    )
    if ja_feita is not None:
        _exigir_mesma_operacao(ja_feita, mission_id, operation_id)
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
    session.add(
        MissionOperation(
            operation_id=operation_id, mission_id=missao.id, kind=CONCLUSAO
        )
    )
    try:
        session.flush()
    except IntegrityError as erro:
        # A janela que a trava de linha NAO fecha: duas missoes diferentes
        # com o mesmo identificador de operacao nao disputam trava nenhuma,
        # entao as duas consultas acima podem nao ver nada e os dois INSERTs
        # chegarem juntos. Quem recusa ali e a UNIQUE -- e a recusa precisa
        # sair com a mesma cara do caminho sequencial.
        if UNICIDADE_DA_OPERACAO not in str(erro.orig):
            raise
        raise OperacaoReutilizadaError(_reuso(operation_id)) from erro

    # O credito da progressao, na MESMA transacao (D3) e com a missao ja
    # travada. Depois do `flush` da operacao, e nao antes (decisao P1 do plano
    # do D): antes, o autoflush das consultas da progressao gravaria a
    # operacao FORA do `try` que traduz o reuso de chave.
    registrar_conclusao(session, missao, agora)
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
    ja_feita: MissionOperation, mission_id: int, operation_id: str
) -> None:
    """Confere que a operacao encontrada e a MESMA que se esta pedindo.

    Duas dimensoes, e as duas importam:

    - **missao diferente**: a chave foi gasta em outra missao. Sem esta
      conferencia, `concluir_missao(missao_b, chave_da_missao_a)` devolveria
      a missao A como sucesso.
    - **tipo diferente**: a chave foi gasta em outra operacao da mesma
      missao. Hoje `CONCLUSAO` e o unico tipo que existe, entao este ramo nao
      tem como acontecer em producao -- mas ele ja esta escrito porque, no
      dia em que houver um inicio, o defeito seria devolver como "concluida"
      uma missao que so foi iniciada. E um registro de inicio, nao de
      conclusao.
    """
    if ja_feita.mission_id != mission_id or ja_feita.kind != CONCLUSAO:
        raise OperacaoReutilizadaError(_reuso(operation_id))


def _buscar(
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
    """
    missao = session.get(Mission, mission_id, with_for_update=travar)
    if missao is None:
        raise MissaoNaoEncontradaError(f"missao {mission_id} nao existe")
    if missao.user_id != user_id:
        raise NaoPertenceAoUsuarioError(
            f"missao {mission_id} nao pertence ao usuario {user_id}"
        )
    return missao
