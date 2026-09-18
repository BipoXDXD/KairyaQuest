"""Casos de uso da missao: orquestram o dominio e a persistencia.

Nenhuma funcao daqui conhece `Request`, `Response` ou codigo HTTP -- a
traducao para a web e da Task 9. E nenhuma delas commita: quem abre a
transacao e quem a fecha. O servico faz `flush`, que e o suficiente para o
banco atribuir identificadores e aplicar restricoes, e deixa a decisao de
tornar tudo permanente para o dono da transacao.
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from focusquest.core.errors import MissaoNaoEncontradaError, NaoPertenceAoUsuarioError
from focusquest.modules.missions.domain import MissionState, validar_transicao
from focusquest.modules.missions.models import Mission, MissionOperation

# O tipo de operacao registrado em mission_operations. Constante nomeada
# porque no dia em que existir "start" o literal solto teria de ser encontrado
# em dois lugares -- e um deles ficaria para tras.
CONCLUSAO = "complete"


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
    """
    return list(
        session.scalars(
            select(Mission)
            .where(Mission.user_id == user_id)
            .order_by(Mission.deadline, Mission.id)
        )
    )


def concluir_missao(
    session: Session, user_id: int, mission_id: int, operation_id: str
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

    A restricao unica em `operation_id` continua sendo a ultima linha de
    defesa, para o caso que a trava de linha nao cobre: dois reenvios da
    mesma operacao sobre missoes DIFERENTES nao disputam trava nenhuma, e ali
    quem recusa e o banco.
    """
    missao = _buscar(session, user_id, mission_id, travar=True)

    ja_feita = session.scalar(
        select(MissionOperation).where(MissionOperation.operation_id == operation_id)
    )
    if ja_feita is not None:
        # A missao registrada na operacao, e nao a que veio no argumento: e o
        # que a operacao realmente concluiu da primeira vez, e e esse o
        # resultado que reenviar deve devolver.
        return _buscar(session, user_id, ja_feita.mission_id)

    validar_transicao(missao.state, MissionState.CONCLUIDA)
    missao.state = MissionState.CONCLUIDA
    missao.completed_at = datetime.now(UTC)
    session.add(
        MissionOperation(
            operation_id=operation_id, mission_id=missao.id, kind=CONCLUSAO
        )
    )
    session.flush()
    return missao


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
