"""Toda recusa de `rejeitar_acao` deixa o banco INTACTO (#178).

`rejeitar_acao` recusa por tres motivos -- a acao nao existe, e de outro
usuario, ou ja saiu de `proposta` (executada, falhou) -- e cada recusa promete
que nada foi gravado. A foto do banco (todas as tabelas, `foto_do_banco`) e
tirada antes e depois da chamada, NA MESMA transacao e depois de um `flush`:
uma escrita feita antes da recusa aparece ai, e so ai -- o rollback da fixture
a esconderia.

Prova de que o teste pega a escrita indevida (registrada na nota do
incremento): com uma sabotagem que grava `decided_at` antes de
`validar_transicao_da_acao(..., RECUSADA)`, os casos `rejeitar-executada` e
`rejeitar-falhou` reprovam; com uma que grava antes de `_buscar_acao`, os
quatro reprovam.
"""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from focusquest.core.errors import AcaoNaoEncontradaError
from focusquest.modules.missions.domain import TransicaoIlegalError
from focusquest.modules.tutoring.domain import (
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.service import confirmar_acao, rejeitar_acao
from focusquest.modules.users.models import User
from integration.foto_do_banco import foto_do_banco

ESTUDANTE = 1
OUTRO = 2
AGORA = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
# Um id que nenhuma acao da suite alcanca: o `serial` comeca em 1.
ACAO_INEXISTENTE = 2**31 - 1


def _acao(session: Session, *, user_id: int = ESTUDANTE, cid: str) -> TutorAction:
    pergunta = TutorMessage(
        user_id=user_id,
        role=Papel.USUARIO,
        content="me da uma missao",
        status=StatusDaMensagem.COMPLETA,
        client_message_id=cid,
        created_at=AGORA,
    )
    session.add(pergunta)
    session.flush()
    resposta = TutorMessage(
        user_id=user_id,
        role=Papel.TUTORA,
        content="toma",
        status=StatusDaMensagem.COMPLETA,
        reply_to_id=pergunta.id,
        created_at=AGORA,
    )
    session.add(resposta)
    session.flush()
    acao = TutorAction(
        message_id=resposta.id,
        kind=TipoDeAcao.CRIAR_MISSAO,
        payload={
            "instructions": "Ler o capitulo 3",
            "completion_criterion": "Resumo de uma pagina",
            "difficulty": 3,
            "estimated_minutes": 40,
            "deadline": (AGORA + timedelta(days=1)).isoformat(),
        },
        state=EstadoDaAcao.PROPOSTA,
        created_at=AGORA,
    )
    session.add(acao)
    session.flush()
    return acao


def _inexistente(_session: Session) -> int:
    return ACAO_INEXISTENTE


def _alheia(session: Session) -> int:
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()
    return _acao(session, user_id=OUTRO, cid="rejeitar-alheia").id


def _executada(session: Session) -> int:
    acao = _acao(session, cid="rejeitar-executada")
    confirmar_acao(session, ESTUDANTE, acao.id, "op-rejeitar", clock=lambda: AGORA)
    return acao.id


def _falhou(session: Session) -> int:
    acao = _acao(session, cid="rejeitar-falhou")
    acao.state = EstadoDaAcao.FALHOU
    acao.error_code = "proposta_invalida"
    acao.decided_at = AGORA
    session.flush()
    return acao.id


@pytest.mark.parametrize(
    ("preparar", "erro"),
    [
        pytest.param(_inexistente, AcaoNaoEncontradaError, id="rejeitar-inexistente"),
        pytest.param(_alheia, AcaoNaoEncontradaError, id="rejeitar-alheia"),
        pytest.param(_executada, TransicaoIlegalError, id="rejeitar-executada"),
        pytest.param(_falhou, TransicaoIlegalError, id="rejeitar-falhou"),
    ],
)
def test_recusa_de_rejeitar_nao_escreve(
    session: Session,
    preparar: Callable[[Session], int],
    erro: type[Exception],
) -> None:
    acao_id = preparar(session)
    session.flush()
    antes = foto_do_banco(session.connection())
    depois_da_decisao = AGORA + timedelta(hours=1)

    with pytest.raises(erro):
        rejeitar_acao(session, ESTUDANTE, acao_id, clock=lambda: depois_da_decisao)

    session.flush()
    depois = foto_do_banco(session.connection())
    assert depois == antes, "a recusa escreveu antes de recusar"
