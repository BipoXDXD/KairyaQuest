"""Casos de uso da missao, contra PostgreSQL real.

Repeticao SEQUENCIAL da operacao mora aqui; a disputa entre duas conexoes
esta em `test_missions_concorrencia.py`. O README s8 pede as duas coisas, e
elas nao se substituem: a repeticao sequencial nunca chega perto da janela
onde duas transacoes se cruzam.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.core.errors import (
    MissaoNaoEncontradaError,
    NaoPertenceAoUsuarioError,
    OperacaoReutilizadaError,
)
from focusquest.modules.missions.domain import MissionState, TransicaoIlegalError
from focusquest.modules.missions.models import MissionOperation, User
from focusquest.modules.missions.service import (
    concluir_missao,
    criar_missao,
    listar_missoes,
)

# O usuario unico semeado pela migracao (README s8).
ESTUDANTE = 1
# Um segundo usuario, criado pelos testes que precisam de um dono diferente.
# Nasce e morre dentro da transacao da fixture `session`.
OUTRO = 2

# O instante que o relogio destes testes devolve. Fixo e com fuso: e ele que
# permite afirmar o `completed_at` por IGUALDADE, e nao por uma janela entre
# dois `datetime.now()` -- a compensacao que a pendencia 7 registrava.
AGORA = datetime(2026, 9, 18, 15, 0, tzinfo=UTC)


def _relogio() -> datetime:
    """O relogio fixo destes testes: toda leitura devolve `AGORA`."""
    return AGORA


def _criar(session: Session, *, user_id: int = ESTUDANTE, dias: int = 1) -> int:
    """Cria uma missao pelo servico e devolve o id.

    `dias` controla so o prazo, que e o unico campo de que os testes de
    ordenacao precisam variar.
    """
    missao = criar_missao(
        session,
        user_id=user_id,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina entregue",
        difficulty=2,
        estimated_minutes=30,
        deadline=datetime.now(UTC) + timedelta(days=dias),
    )
    assert missao.id is not None
    return missao.id


def _registrar_outro_usuario(session: Session) -> None:
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()


def _operacoes(session: Session, mission_id: int) -> int:
    """Conta as operacoes DESTA missao.

    Filtrar, em vez de contar a tabela inteira, e o que faz a assercao dizer
    "esta missao tem uma conclusao registrada" em vez de "o banco tem uma
    linha" -- que continuaria verde se a linha fosse de outra missao.
    """
    return session.execute(
        select(func.count())
        .select_from(MissionOperation)
        .where(MissionOperation.mission_id == mission_id)
    ).scalar_one()


# ---------------------------------------------------------------------------
# Criar
# ---------------------------------------------------------------------------


def test_criar_devolve_missao_pendente(session: Session) -> None:
    missao = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina entregue",
        difficulty=2,
        estimated_minutes=30,
        deadline=datetime.now(UTC) + timedelta(days=1),
    )

    assert missao.id is not None
    assert missao.state is MissionState.PENDENTE
    assert missao.completed_at is None
    assert missao.started_at is None


def test_criar_nao_depende_do_default_do_banco(session: Session) -> None:
    """Quem declara o estado inicial e o SERVICO, nao o esquema.

    Sem esta assercao, `criar_missao` poderia omitir o `state` e continuar
    verde: o PostgreSQL preencheria 'pendente' pelo `server_default` da
    coluna e o RETURNING do INSERT traria o valor de volta no mesmo
    round-trip -- foi o que se mediu antes de escolher o desenho. O teste
    acima passaria sem provar nada.

    Aqui o default da coluna e derrubado DENTRO da transacao do teste (DDL no
    PostgreSQL e transacional, entao o rollback da fixture o devolve) e a
    missao ainda tem de nascer pendente. Com o `state=` no servico, ela
    nasce; sem ele, o INSERT omite a coluna e bate no NOT NULL.

    O `server_default` continua na coluna, e continua util: ele protege o
    INSERT escrito a mao no psql, que nao passa por este servico. O que ele
    nao pode ser e a UNICA fonte do estado inicial.
    """
    session.execute(text("ALTER TABLE missions ALTER COLUMN state DROP DEFAULT"))

    missao = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina entregue",
        difficulty=2,
        estimated_minutes=30,
        deadline=datetime.now(UTC) + timedelta(days=1),
    )

    assert missao.state is MissionState.PENDENTE


# ---------------------------------------------------------------------------
# Listar
# ---------------------------------------------------------------------------


def test_listar_devolve_so_as_missoes_do_usuario_pedido(session: Session) -> None:
    _registrar_outro_usuario(session)
    minha = _criar(session, user_id=ESTUDANTE)
    _criar(session, user_id=OUTRO)

    assert [m.id for m in listar_missoes(session, ESTUDANTE)] == [minha]


def test_listar_ordena_pelo_prazo(session: Session) -> None:
    """A ordem e contrato, e por isso e testada.

    As missoes sao criadas FORA de ordem de prazo de proposito: um
    `listar_missoes` sem `order_by` passaria por acidente se elas fossem
    criadas em ordem, porque o PostgreSQL costuma devolver na ordem de
    insercao quando nada o obriga a outra coisa.
    """
    daqui_a_tres = _criar(session, dias=3)
    amanha = _criar(session, dias=1)
    daqui_a_dois = _criar(session, dias=2)

    ids = [m.id for m in listar_missoes(session, ESTUDANTE)]
    assert ids == [amanha, daqui_a_dois, daqui_a_tres]


# ---------------------------------------------------------------------------
# Concluir: o caminho feliz e os dois bloqueios
# ---------------------------------------------------------------------------


def test_concluir_marca_o_estado_e_o_instante(session: Session) -> None:
    """O `completed_at` e o instante que o RELOGIO RECEBIDO devolveu.

    Igualdade exata, e nao janela de tempo: com o relogio injetado, o teste
    sabe qual instante esperar. E e isso que da dente a assercao -- um servico
    que voltasse a chamar `datetime.now(UTC)` direto gravaria a hora real, e a
    hora real nao e 18/09/2026 as 15:00.
    """
    mission_id = _criar(session)

    missao = concluir_missao(session, ESTUDANTE, mission_id, "op-abc", clock=_relogio)

    assert missao.state is MissionState.CONCLUIDA
    assert missao.completed_at == AGORA
    assert _operacoes(session, mission_id) == 1


def test_concluir_missao_inexistente_e_recusado(session: Session) -> None:
    with pytest.raises(MissaoNaoEncontradaError) as excecao:
        concluir_missao(session, ESTUDANTE, 9999, "op-abc", clock=_relogio)

    # A mensagem EXPLICA o bloqueio (README s8): diz qual missao nao existe.
    assert "9999" in str(excecao.value)


def test_concluir_missao_de_outro_usuario_e_recusado(session: Session) -> None:
    """Existir nao e o mesmo que ser sua.

    O erro e distinto de `MissaoNaoEncontradaError` de proposito. Se os dois
    fossem a mesma classe, o log nao teria como diferenciar "o cliente mandou
    um id que nunca existiu" de "o cliente pediu a missao de outra pessoa".
    """
    _registrar_outro_usuario(session)
    mission_id = _criar(session, user_id=OUTRO)

    with pytest.raises(NaoPertenceAoUsuarioError) as excecao:
        concluir_missao(session, ESTUDANTE, mission_id, "op-abc", clock=_relogio)

    assert str(mission_id) in str(excecao.value)
    assert str(ESTUDANTE) in str(excecao.value)


# ---------------------------------------------------------------------------
# A semantica DUPLA da idempotencia. Os dois testes abaixo descrevem
# comportamentos OPOSTOS sobre a mesma missao ja concluida, e a unica
# diferenca entre eles e o identificador de operacao. Fundi-los apagaria
# justamente a distincao: ou o reenvio passaria a ser erro, ou a segunda
# conclusao passaria a ser aceita em silencio.
# ---------------------------------------------------------------------------


def test_reenviar_a_mesma_operacao_devolve_o_mesmo_sucesso(session: Session) -> None:
    """Reenviar nao e erro -- e e o MESMO sucesso, nao um novo.

    O reenvio chega uma hora depois, por um relogio que ANDOU: com um relogio
    fixo nas duas chamadas, uma implementacao que concluisse de novo gravaria
    o mesmo instante, e a assercao sobre `completed_at` passaria sem provar
    nada.
    """
    mission_id = _criar(session)
    depois = AGORA + timedelta(hours=1)

    primeira = concluir_missao(session, ESTUDANTE, mission_id, "op-abc", clock=_relogio)
    segunda = concluir_missao(
        session, ESTUDANTE, mission_id, "op-abc", clock=lambda: depois
    )

    assert primeira.id == segunda.id
    assert segunda.state is MissionState.CONCLUIDA
    # O instante nao se move. Sem esta assercao, uma implementacao que
    # simplesmente concluisse de novo -- sobrescrevendo `completed_at` --
    # passaria no teste: o estado final seria o mesmo. O que "devolver o
    # mesmo sucesso" promete e que nada aconteceu da segunda vez.
    assert segunda.completed_at == AGORA
    # E a prova de que reenvio nao duplica: uma operacao registrada, nao duas.
    assert _operacoes(session, mission_id) == 1


def test_operacao_nova_sobre_missao_concluida_e_bloqueada(session: Session) -> None:
    """Tentar de novo E erro -- e o erro explica o bloqueio."""
    mission_id = _criar(session)
    concluir_missao(session, ESTUDANTE, mission_id, "op-abc", clock=_relogio)

    with pytest.raises(TransicaoIlegalError) as excecao:
        concluir_missao(session, ESTUDANTE, mission_id, "op-xyz", clock=_relogio)

    assert "concluida" in str(excecao.value)
    assert _operacoes(session, mission_id) == 1


def test_reenviar_operacao_de_outra_missao_e_recusado(session: Session) -> None:
    """Um identificador de operacao fica preso a missao onde foi usado.

    Reaproveitar a chave em outra missao nao e reenvio -- e chave gasta, e
    recebe erro de dominio. O comportamento anterior (devolver a missao
    ORIGINAL como sucesso) era pior do que parecia: o cliente pediu para
    concluir a missao B, recebeu 200, e a missao B continuava pendente.

    O mesmo engano em paralelo recebe o mesmo erro -- e o que
    `test_mesma_chave_em_missoes_diferentes_e_recusada_tambem_em_paralelo`
    prova, pelo outro caminho, o da restricao unica.
    """
    primeira_missao = _criar(session)
    segunda_missao = _criar(session)
    concluir_missao(session, ESTUDANTE, primeira_missao, "op-abc", clock=_relogio)

    with pytest.raises(OperacaoReutilizadaError) as excecao:
        concluir_missao(session, ESTUDANTE, segunda_missao, "op-abc", clock=_relogio)

    assert "op-abc" in str(excecao.value)
    # A mensagem NAO revela nada da outra missao. Ela nao tem digito nenhum,
    # entao esta assercao so falha se o id vazar de verdade.
    assert str(primeira_missao) not in str(excecao.value)
    # E a segunda missao continua intocada: nem estado, nem operacao.
    assert _operacoes(session, segunda_missao) == 0
    intacta = [m for m in listar_missoes(session, ESTUDANTE) if m.id == segunda_missao]
    assert intacta[0].state is MissionState.PENDENTE


def test_chave_usada_em_outro_tipo_de_operacao_e_recusada(session: Session) -> None:
    """A chave gasta num INICIO nao serve para concluir.

    Hoje `concluir_missao` e a unica coisa que grava operacoes, entao este
    caso nao acontece em producao -- o registro de tipo "start" e escrito
    direto na tabela, como a operacao de inicio fara quando existir.

    O teste existe porque a restricao UNIQUE do banco e sobre `operation_id`
    SOZINHO, sem o tipo: uma chave gasta em qualquer tipo ja esta gasta. Sem
    a conferencia de `kind`, a consulta de idempotencia encontraria este
    registro de inicio e devolveria a missao como "ja concluida" -- 200 para
    uma missao que continua pendente.
    """
    mission_id = _criar(session)
    session.add(
        MissionOperation(operation_id="op-abc", mission_id=mission_id, kind="start")
    )
    session.flush()

    with pytest.raises(OperacaoReutilizadaError):
        concluir_missao(session, ESTUDANTE, mission_id, "op-abc", clock=_relogio)

    missao = listar_missoes(session, ESTUDANTE)[0]
    assert missao.state is MissionState.PENDENTE


def test_integrity_error_que_nao_e_o_conflito_de_chave_nao_e_traduzido(
    session: Session,
) -> None:
    """A traducao reconhece a restricao; nao engole IntegrityError qualquer.

    `concluir_missao` traduz a violacao da UNIQUE de `operation_id` para
    `OperacaoReutilizadaError`. Se ela traduzisse qualquer `IntegrityError`,
    uma violacao de chave estrangeira -- ou qualquer restricao futura --
    chegaria ao cliente como "chave reutilizada", que e mentira, e o defeito
    real ficaria escondido atras de uma mensagem plausivel.

    A restricao temporaria nasce e morre dentro da transacao do teste: DDL no
    PostgreSQL e transacional, e o rollback da fixture a remove.
    """
    mission_id = _criar(session)
    session.execute(
        text(
            "ALTER TABLE mission_operations ADD CONSTRAINT ck_temporario "
            "CHECK (kind <> 'complete')"
        )
    )

    with pytest.raises(IntegrityError) as excecao:
        concluir_missao(session, ESTUDANTE, mission_id, "op-abc", clock=_relogio)

    assert "ck_temporario" in str(excecao.value.orig)
