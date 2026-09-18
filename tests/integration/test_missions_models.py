"""Persistencia da missao, contra PostgreSQL real."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.domain import MissionState
from focusquest.modules.missions.models import Mission, MissionOperation


def _missao(**kwargs: object) -> Mission:
    base: dict[str, object] = {
        "user_id": 1,
        "instructions": "Ler o capitulo 3",
        "completion_criterion": "Resumo de uma pagina entregue",
        "difficulty": 3,
        "estimated_minutes": 60,
        "deadline": datetime.now(UTC) + timedelta(days=1),
        "state": MissionState.PENDENTE,
    }
    base.update(kwargs)
    return Mission(**base)


def test_persiste_e_recupera(session: Session) -> None:
    missao = _missao()
    session.add(missao)
    session.flush()
    assert missao.id is not None
    assert missao.state is MissionState.PENDENTE


def test_estado_volta_do_banco_como_enum(session: Session) -> None:
    """A ida e volta, nao so a ida.

    O teste acima ainda enxerga o objeto que o Python criou -- `flush` nao
    expira nada, entao `missao.state` continua sendo o enum que foi
    atribuido, mesmo que o banco devolvesse outra coisa. Aqui o atributo e
    expirado de proposito: o valor tem de ser lido do PostgreSQL de novo, e e
    so isso que prova que a coluna TEXT volta como MissionState em vez da str
    crua. Sem esta assercao, `Mapped[MissionState]` seria uma anotacao que
    mente depois do primeiro refresh.
    """
    missao = _missao()
    session.add(missao)
    session.flush()
    session.expire(missao)

    assert missao.state is MissionState.PENDENTE
    assert isinstance(missao.state, MissionState)


def test_instante_volta_com_timezone(session: Session) -> None:
    missao = _missao()
    session.add(missao)
    session.flush()
    session.refresh(missao)
    assert missao.deadline.tzinfo is not None


def test_dificuldade_menor_que_um_e_rejeitada(session: Session) -> None:
    """Dificuldade zero e recusada pelo BANCO.

    `xp_para_dificuldade` ja levanta ValueError para dificuldade < 1, mas
    isso so vale para quem passa pelo dominio. Esta missao e escrita direto
    na tabela, como um UPDATE no psql faria: quem recusa aqui e o
    ck_missions_difficulty.
    """
    session.add(_missao(difficulty=0))
    with pytest.raises(IntegrityError):
        session.flush()


def test_usuario_inexistente_e_rejeitado(session: Session) -> None:
    session.add(_missao(user_id=9999))
    with pytest.raises(IntegrityError):
        session.flush()


def test_identificador_de_operacao_e_unico(session: Session) -> None:
    missao = _missao()
    session.add(missao)
    session.flush()
    session.add(
        MissionOperation(operation_id="op-1", mission_id=missao.id, kind="complete")
    )
    session.flush()
    session.add(
        MissionOperation(operation_id="op-1", mission_id=missao.id, kind="complete")
    )
    with pytest.raises(IntegrityError):
        session.flush()


def _escrever_e_commitar_exigindo_tabela_vazia(session: Session) -> None:
    """Exige a tabela vazia, escreve uma missao e COMMITA.

    O commit e o ponto. Com `flush` sozinho, o savepoint da propria Session
    ja desfaria a escrita no `close()`, e o teste passaria mesmo com a
    transacao externa quebrada -- provaria o isolamento errado. Commitando,
    a linha sobe do savepoint para a transacao externa, e so o
    `transacao.rollback()` da fixture pode desfaze-la. E tambem o caso real:
    o servico que vier nas proximas tarefas vai commitar.
    """
    antes = session.execute(select(func.count()).select_from(Mission)).scalar_one()
    assert antes == 0

    session.add(_missao())
    session.commit()

    depois = session.execute(select(func.count()).select_from(Mission)).scalar_one()
    assert depois == 1


# Os dois testes abaixo sao deliberadamente iguais, e e por isso que eles
# funcionam: cada um escreve e commita uma missao depois de exigir que a
# tabela esteja vazia. Se a fixture `session` parasse de reverter a transacao
# externa, o segundo a rodar encontraria a linha commitada pelo primeiro e
# falharia -- independentemente de qual dos dois o pytest execute antes. Um
# unico teste nao poderia provar isso, porque o vazamento so aparece no teste
# SEGUINTE.


def test_isolamento_entre_testes_primeira_escrita(session: Session) -> None:
    _escrever_e_commitar_exigindo_tabela_vazia(session)


def test_isolamento_entre_testes_segunda_escrita(session: Session) -> None:
    _escrever_e_commitar_exigindo_tabela_vazia(session)
