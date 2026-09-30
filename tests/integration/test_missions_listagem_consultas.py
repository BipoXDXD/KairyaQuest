"""Quantas consultas a listagem de missoes custa (pendencia 96).

O `MissionRead` deriva `verification`, `evidence`, `evaluation` e
`reschedules` dos relacionamentos da missao. Com `lazy="select"`, cada missao
listada custava uma consulta a mais por relacionamento (N+1): so com evidencia
e avaliacao, a lista de 50 missoes fazia 101 idas ao banco.
Estes testes contam as consultas que chegam ao cursor e exigem que o numero
nao cresca com o tamanho da lista.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from focusquest.core.usuario_unico import USUARIO_UNICO
from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    FalhaDaAvaliacao,
    MotivoDoReagendamento,
    OrigemDoReagendamento,
)
from focusquest.modules.missions.models import MissionEvaluation
from focusquest.modules.missions.router import listar
from focusquest.modules.missions.service import (
    NovaEvidencia,
    concluir_missao,
    criar_missao,
    reagendar_missao,
)

AGORA = datetime(2026, 9, 18, 15, 0, tzinfo=UTC)

# Uma consulta das missoes, uma das evidencias, uma das avaliacoes e uma do
# historico de prazos (o `reschedules` do Incremento F): o numero e fixo,
# qualquer que seja o tamanho da lista.
CONSULTAS_DA_LISTAGEM = 4


@contextmanager
def contando_consultas(conexao: Connection) -> Iterator[list[str]]:
    """Registra cada SQL que chega ao cursor enquanto o bloco roda."""
    consultas: list[str] = []

    def registrar(*args: Any) -> None:
        # (conn, cursor, statement, parameters, context, executemany)
        consultas.append(args[2])

    event.listen(conexao, "before_cursor_execute", registrar)
    try:
        yield consultas
    finally:
        event.remove(conexao, "before_cursor_execute", registrar)


def _criar(session: Session, indice: int) -> int:
    missao = criar_missao(
        session,
        user_id=USUARIO_UNICO,
        instructions=f"Missao {indice}",
        completion_criterion="Resumo entregue",
        difficulty=2,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=indice + 1),
    )
    return missao.id


def _povoar(session: Session, quantas: int) -> None:
    """Missoes de todos os tipos de entrega: pendente reagendada, concluida
    sem evidencia, concluida com evidencia e concluida com evidencia e
    avaliacao."""
    for indice in range(quantas):
        mission_id = _criar(session, indice)
        tipo = indice % 4
        if tipo == 0:
            reagendar_missao(
                session,
                USUARIO_UNICO,
                mission_id,
                f"reag-{indice}",
                # Uma hora depois do prazo original: a ordem da listagem, por
                # prazo, continua a da criacao.
                novo_prazo=AGORA + timedelta(days=indice + 1, hours=1),
                motivo=MotivoDoReagendamento.FALTA_DE_TEMPO,
                origem=OrigemDoReagendamento.USUARIO,
                clock=lambda: AGORA,
            )
            continue
        concluir_missao(
            session,
            USUARIO_UNICO,
            mission_id,
            f"op-{indice}",
            clock=lambda: AGORA,
            evidencia=None if tipo == 1 else NovaEvidencia(f"Feito {indice}", None),
        )
        if tipo == 3:
            session.add(
                MissionEvaluation(
                    mission_id=mission_id,
                    state=EstadoDaAvaliacao.FALHOU,
                    attempt=1,
                    error_code=FalhaDaAvaliacao.TEMPO_ESGOTADO,
                    model="modelo-x",
                    requested_at=AGORA,
                    finished_at=AGORA,
                )
            )
    session.flush()
    # Sem isto, os relacionamentos ja carregados na criacao esconderiam o N+1:
    # a listagem precisa partir do banco, como numa requisicao nova.
    session.expire_all()


@pytest.mark.parametrize("quantas", [1, 8])
def test_a_listagem_custa_um_numero_fixo_de_consultas(
    session: Session, quantas: int
) -> None:
    _povoar(session, quantas)
    conexao = session.connection()

    with contando_consultas(conexao) as consultas:
        lidas = listar(session)

    assert len(lidas) == quantas
    assert len(consultas) == CONSULTAS_DA_LISTAGEM, consultas


def test_a_listagem_carregada_de_uma_vez_traz_evidencia_e_avaliacao_certas(
    session: Session,
) -> None:
    """O carregamento antecipado nao pode trocar a evidencia de uma missao pela
    de outra, nem perder a avaliacao ou o historico de prazos."""
    _povoar(session, 4)

    lidas = listar(session)

    assert [m.instructions for m in lidas] == [f"Missao {i}" for i in range(4)]
    assert [m.evidence is None for m in lidas] == [True, True, False, False]
    assert [m.evidence.text for m in lidas if m.evidence is not None] == [
        "Feito 2",
        "Feito 3",
    ]
    assert [m.evaluation is None for m in lidas] == [True, True, True, False]
    avaliacao = lidas[3].evaluation
    assert avaliacao is not None
    assert avaliacao.state is EstadoDaAvaliacao.FALHOU
    assert [len(m.reschedules) for m in lidas] == [1, 0, 0, 0]
    assert lidas[0].reschedules[0].new_deadline == AGORA + timedelta(days=1, hours=1)
