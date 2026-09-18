"""Casos de uso da missao, contra PostgreSQL real.

Repeticao SEQUENCIAL da operacao mora aqui; a disputa entre duas conexoes
esta em `test_missions_concorrencia.py`. O README s8 pede as duas coisas, e
elas nao se substituem: a repeticao sequencial nunca chega perto da janela
onde duas transacoes se cruzam.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from focusquest.core.errors import MissaoNaoEncontradaError, NaoPertenceAoUsuarioError
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


def _operacoes(session: Session) -> int:
    return session.execute(
        select(func.count()).select_from(MissionOperation)
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
    mission_id = _criar(session)
    antes = datetime.now(UTC)

    missao = concluir_missao(session, ESTUDANTE, mission_id, "op-abc")

    assert missao.state is MissionState.CONCLUIDA
    assert missao.completed_at is not None
    # O instante e gravado com timezone (README s8) e fica dentro da janela
    # do proprio teste -- nao basta "nao e None", que um valor fixo qualquer
    # tambem satisfaria.
    assert missao.completed_at.tzinfo is not None
    assert antes <= missao.completed_at <= datetime.now(UTC)
    assert _operacoes(session) == 1


def test_concluir_missao_inexistente_e_recusado(session: Session) -> None:
    with pytest.raises(MissaoNaoEncontradaError) as excecao:
        concluir_missao(session, ESTUDANTE, 9999, "op-abc")

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
        concluir_missao(session, ESTUDANTE, mission_id, "op-abc")

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
    """Reenviar nao e erro -- e e o MESMO sucesso, nao um novo."""
    mission_id = _criar(session)

    primeira = concluir_missao(session, ESTUDANTE, mission_id, "op-abc")
    instante_original = primeira.completed_at
    segunda = concluir_missao(session, ESTUDANTE, mission_id, "op-abc")

    assert primeira.id == segunda.id
    assert segunda.state is MissionState.CONCLUIDA
    # O instante nao se move. Sem esta assercao, uma implementacao que
    # simplesmente concluisse de novo -- sobrescrevendo `completed_at` --
    # passaria no teste: o estado final seria o mesmo. O que "devolver o
    # mesmo sucesso" promete e que nada aconteceu da segunda vez.
    assert segunda.completed_at == instante_original
    # E a prova de que reenvio nao duplica: uma operacao registrada, nao duas.
    assert _operacoes(session) == 1


def test_operacao_nova_sobre_missao_concluida_e_bloqueada(session: Session) -> None:
    """Tentar de novo E erro -- e o erro explica o bloqueio."""
    mission_id = _criar(session)
    concluir_missao(session, ESTUDANTE, mission_id, "op-abc")

    with pytest.raises(TransicaoIlegalError) as excecao:
        concluir_missao(session, ESTUDANTE, mission_id, "op-xyz")

    assert "concluida" in str(excecao.value)
    assert _operacoes(session) == 1


def test_reenviar_operacao_de_outra_missao_devolve_a_missao_original(
    session: Session,
) -> None:
    """O identificador de operacao manda mais que o id da missao no pedido.

    Reaproveitar um `operation_id` em outra missao e uso indevido do cliente.
    O servico nao inventa uma conclusao nova por causa disso: devolve o que
    AQUELA operacao produziu da primeira vez. E a mesma promessa de sempre --
    um identificador de operacao corresponde a exatamente um efeito.
    """
    primeira_missao = _criar(session)
    segunda_missao = _criar(session)
    concluir_missao(session, ESTUDANTE, primeira_missao, "op-abc")

    devolvida = concluir_missao(session, ESTUDANTE, segunda_missao, "op-abc")

    assert devolvida.id == primeira_missao
    assert _operacoes(session) == 1
    # A segunda missao nao foi tocada.
    pendentes = [
        m for m in listar_missoes(session, ESTUDANTE) if m.id == segunda_missao
    ]
    assert pendentes[0].state is MissionState.PENDENTE
