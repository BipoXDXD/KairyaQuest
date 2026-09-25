"""As restricoes que o BANCO garante na tutoria, cada uma por um INSERT.

Cada caso monta linhas que violam exatamente uma restricao e confere o NOME
dela na recusa. So o tipo (`IntegrityError`) nao discrimina: uma FK quebrada
por engano no caso passaria pelo motivo errado.
"""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import MetaData, UniqueConstraint, delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission
from focusquest.modules.tutoring.domain import (
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage

ESTUDANTE = 1
AGORA = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
PAYLOAD = {"instructions": "x"}


def _pergunta(session: Session, cid: str = "c-1", **ajustes: Any) -> TutorMessage:
    campos: dict[str, Any] = {
        "user_id": ESTUDANTE,
        "role": Papel.USUARIO,
        "content": "Me da uma missao?",
        "status": StatusDaMensagem.COMPLETA,
        "client_message_id": cid,
        "created_at": AGORA,
    }
    mensagem = TutorMessage(**(campos | ajustes))
    session.add(mensagem)
    session.flush()
    return mensagem


def _resposta(session: Session, pergunta: TutorMessage, **ajustes: Any) -> TutorMessage:
    campos: dict[str, Any] = {
        "user_id": ESTUDANTE,
        "role": Papel.TUTORA,
        "content": "Claro!",
        "status": StatusDaMensagem.COMPLETA,
        "reply_to_id": pergunta.id,
        "created_at": AGORA,
    }
    mensagem = TutorMessage(**(campos | ajustes))
    session.add(mensagem)
    session.flush()
    return mensagem


def _acao(session: Session, resposta: TutorMessage, **ajustes: Any) -> TutorAction:
    campos: dict[str, Any] = {
        "message_id": resposta.id,
        "kind": TipoDeAcao.CRIAR_MISSAO,
        "payload": PAYLOAD,
        "state": EstadoDaAcao.PROPOSTA,
        "created_at": AGORA,
    }
    acao = TutorAction(**(campos | ajustes))
    session.add(acao)
    session.flush()
    return acao


def _missao(session: Session) -> Mission:
    missao = Mission(
        user_id=ESTUDANTE,
        mission_type=MissionType.AVULSA,
        instructions="Ler",
        completion_criterion="Resumo",
        difficulty=1,
        estimated_minutes=10,
        deadline=AGORA + timedelta(days=1),
        state=MissionState.PENDENTE,
    )
    session.add(missao)
    session.flush()
    return missao


def _cru(session: Session, sql: str, **parametros: Any) -> None:
    """INSERT em SQL cru, para valores que os enums do Python nem deixariam
    montar (um `role` inventado)."""
    session.execute(text(sql), parametros)
    session.flush()


def _outro_usuario(session: Session) -> int:
    """Um segundo usuario, so para isolar o caso `uma_gerando_por_usuario`.

    Sem ele, as DUAS perguntas do caso (nascem `completa`, por forca do
    `ck_tutor_messages_forma`) seriam do MESMO usuario -- e sob o predicado
    mutado (`status = 'completa'` no lugar de `'gerando'`) a segunda pergunta
    ja colidiria sozinha, antes de a resposta `gerando` ser alcancada. O
    caso pegaria a mutacao pelo motivo errado.
    """
    return int(
        session.execute(
            text(
                "INSERT INTO users (display_name) VALUES ('Outra pessoa') RETURNING id"
            )
        ).scalar_one()
    )


Caso = Callable[[Session], object]

_VIOLACOES: list[tuple[str, Caso]] = [
    (
        "ck_tutor_messages_role",
        lambda s: _cru(
            s,
            "INSERT INTO tutor_messages (user_id, role, content, status, "
            "client_message_id, created_at) VALUES (1, 'admin', 'x', 'completa', "
            "'c-x', now())",
        ),
    ),
    (
        # Papel `tutor`: a forma so exige client_message_id nulo e
        # reply_to_id preenchido, sem olhar `status` -- e o que isola esta
        # violacao da de `ck_tutor_messages_forma` (que, com role='user',
        # tambem exige status='completa' e dispararia junto).
        "ck_tutor_messages_status",
        lambda s: _cru(
            s,
            "INSERT INTO tutor_messages (user_id, role, content, status, "
            "reply_to_id, created_at) VALUES "
            "(1, 'tutor', 'x', 'pensando', :reply_to_id, now())",
            reply_to_id=_pergunta(s).id,
        ),
    ),
    ("ck_tutor_messages_forma", lambda s: _pergunta(s, client_message_id=None)),
    (
        "ck_tutor_messages_forma",
        lambda s: _pergunta(s, "c-2", reply_to_id=_pergunta(s).id),
    ),
    (
        "ck_tutor_messages_forma",
        lambda s: _pergunta(s, status=StatusDaMensagem.GERANDO),
    ),
    (
        "ck_tutor_messages_forma",
        lambda s: _resposta(s, _pergunta(s), client_message_id="c-9"),
    ),
    ("ck_tutor_messages_forma", lambda s: _resposta(s, _pergunta(s), reply_to_id=None)),
    (
        "uq_tutor_messages_client_message_id",
        lambda s: (_pergunta(s, "c-1"), _pergunta(s, "c-1")),
    ),
    (
        "uq_tutor_messages_uma_completa_por_pergunta",
        lambda s: (lambda p: (_resposta(s, p), _resposta(s, p)))(_pergunta(s)),
    ),
    (
        # As duas perguntas sao de usuarios DIFERENTES (ver `_outro_usuario`):
        # a unica colisao possivel fica sendo a das duas RESPOSTAS `gerando`,
        # que aqui sim sao do mesmo usuario (`_resposta` usa ESTUDANTE por
        # padrao, independente de quem fez a pergunta).
        "uq_tutor_messages_uma_gerando_por_usuario",
        lambda s: (
            _resposta(s, _pergunta(s, "c-1"), status=StatusDaMensagem.GERANDO),
            _resposta(
                s,
                _pergunta(s, "c-2", user_id=_outro_usuario(s)),
                status=StatusDaMensagem.GERANDO,
            ),
        ),
    ),
    (
        "ck_tutor_actions_kind",
        lambda s: _cru(
            s,
            "INSERT INTO tutor_actions (message_id, kind, payload, state, "
            "created_at) VALUES (:m, 'delete_mission', '{}', 'proposta', now())",
            m=_resposta(s, _pergunta(s)).id,
        ),
    ),
    (
        # `decided_at` preenchido: sem ele, um `state` invalido tambem
        # violaria `ck_tutor_actions_decisao_datada` (que so aceita
        # `decided_at` nulo quando o estado e exatamente 'proposta'), e o
        # PostgreSQL relataria essa -- 'decisao_datada' vem antes de
        # 'state' em ordem alfabetica de nome de restricao.
        "ck_tutor_actions_state",
        lambda s: _cru(
            s,
            "INSERT INTO tutor_actions (message_id, kind, payload, state, "
            "created_at, decided_at) VALUES "
            "(:m, 'create_mission', '{}', 'confirmada', now(), now())",
            m=_resposta(s, _pergunta(s)).id,
        ),
    ),
    (
        "ck_tutor_actions_missao_so_quando_executada",
        lambda s: _acao(
            s,
            _resposta(s, _pergunta(s)),
            state=EstadoDaAcao.EXECUTADA,
            decided_at=AGORA,
        ),
    ),
    (
        "ck_tutor_actions_missao_so_quando_executada",
        lambda s: _acao(s, _resposta(s, _pergunta(s)), mission_id=_missao(s).id),
    ),
    (
        "ck_tutor_actions_decisao_datada",
        lambda s: _acao(s, _resposta(s, _pergunta(s)), decided_at=AGORA),
    ),
    (
        "ck_tutor_actions_decisao_datada",
        lambda s: _acao(s, _resposta(s, _pergunta(s)), state=EstadoDaAcao.RECUSADA),
    ),
    (
        "uq_tutor_actions_operation_id",
        lambda s: (
            lambda r: (
                _acao(s, r, operation_id="op-1"),
                _acao(s, r, operation_id="op-1"),
            )
        )(_resposta(s, _pergunta(s))),
    ),
]


@pytest.mark.parametrize(
    ("restricao", "caso"),
    _VIOLACOES,
    ids=[f"{i:02d}-{nome}" for i, (nome, _) in enumerate(_VIOLACOES)],
)
def test_o_banco_recusa(session: Session, restricao: str, caso: Caso) -> None:
    with pytest.raises(IntegrityError) as recusa:
        caso(session)
    assert restricao in str(recusa.value.orig)


def test_papel_status_e_estado_voltam_do_banco_como_enum(session: Session) -> None:
    """O mesmo defeito que o `MissionStateText` previne na missao: sem o
    decorador, depois do refresh `is` passaria a ser falso."""
    acao = _acao(session, _resposta(session, _pergunta(session)))
    session.expire_all()
    relida = session.get(TutorAction, acao.id)
    assert relida is not None
    assert relida.state is EstadoDaAcao.PROPOSTA
    assert relida.kind is TipoDeAcao.CRIAR_MISSAO
    mensagem = session.get(TutorMessage, relida.message_id)
    assert mensagem is not None
    assert mensagem.role is Papel.TUTORA
    assert mensagem.status is StatusDaMensagem.COMPLETA
    assert [a.id for a in mensagem.actions] == [acao.id]


def test_apagar_a_pergunta_leva_respostas_e_acoes(session: Session) -> None:
    pergunta = _pergunta(session)
    acao = _acao(session, _resposta(session, pergunta))
    # O id sai ANTES do expire_all: o CASCADE ja apagou a linha da acao no
    # banco, e `acao.id` depois de expirado dispararia um refresh contra uma
    # linha que nao existe mais (`ObjectDeletedError`), em vez do
    # `IntegrityError`/None que o teste quer observar.
    acao_id = acao.id
    session.execute(delete(TutorMessage).where(TutorMessage.id == pergunta.id))
    session.expire_all()
    assert session.scalar(select(TutorAction).where(TutorAction.id == acao_id)) is None


def test_missao_criada_por_acao_nao_pode_ser_apagada_por_baixo(
    session: Session,
) -> None:
    """Sem `ondelete` na FK: apagar a missao deixaria a acao `executada`
    apontando para o nada, e `SET NULL` violaria o CHECK de `executada`."""
    missao = _missao(session)
    _acao(
        session,
        _resposta(session, _pergunta(session)),
        state=EstadoDaAcao.EXECUTADA,
        mission_id=missao.id,
        decided_at=AGORA,
    )
    with pytest.raises(IntegrityError) as recusa:
        session.execute(delete(Mission).where(Mission.id == missao.id))
        session.flush()
    assert "tutor_actions_mission_id_fkey" in str(recusa.value.orig)


def _checks(session: Session, tabela: str) -> dict[str, str]:
    linhas = session.execute(
        text(
            "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE contype = 'c' AND conrelid = CAST(:tabela AS regclass)"
        ),
        {"tabela": tabela},
    ).all()
    return {nome: definicao for nome, definicao in linhas}


@pytest.mark.parametrize("tabela", ["tutor_messages", "tutor_actions"])
def test_o_modelo_descreve_os_mesmos_checks_que_a_migracao(
    session: Session, tabela: str
) -> None:
    """O mesmo espelho de `test_missions_models.py`: o PostgreSQL descreve a
    tabela do modelo e a da migracao, e as duas descricoes tem de bater."""
    metadados = MetaData()
    for alvo in ("users", "missions", "tutor_messages"):
        TutorMessage.metadata.tables[alvo].to_metadata(metadados)
    espelho = TutorMessage.metadata.tables[tabela].to_metadata(
        metadados, name=f"espelho_{tabela}"
    )
    espelho.indexes.clear()
    # As restricoes UNIQUE tem nome explicito (`uq_tutor_*`), preservado pela
    # copia; o INDICE que as sustenta e um objeto de nome unico no SCHEMA
    # inteiro (nao so na tabela), e colidiria com o da tabela real. `_checks`
    # olha so `contype = 'c'` (CHECK) -- a comparacao nao usa UNIQUE mesmo, e
    # tirar essas restricoes do espelho evita a colisao sem tirar nada do que
    # e comparado.
    for restricao in list(espelho.constraints):
        if isinstance(restricao, UniqueConstraint):
            espelho.constraints.discard(restricao)
    espelho.create(session.connection())
    assert _checks(session, f"espelho_{tabela}") == _checks(session, tabela)
