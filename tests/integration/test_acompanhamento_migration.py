"""A migracao 0006: o historico de reagendamentos e as regras do inicio.

Mesmo padrao de `test_evaluation_migration.py`: o `finally` sempre devolve o
esquema para `head`, e cada restricao nova e vista dizendo nao por `INSERT`
cru, pelo nome.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, delete, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.domain import (
    MotivoDoReagendamento,
    OrigemDoReagendamento,
)
from focusquest.modules.missions.models import Mission, MissionReschedule
from focusquest.modules.missions.service import criar_missao

from .conftest import alembic_config

ESTUDANTE = 1
REVISAO = "0006"
AGORA = datetime(2026, 9, 29, 15, tzinfo=UTC)


def _anterior_a_0006() -> str:
    script = ScriptDirectory.from_config(alembic_config())
    anterior = script.get_revision(REVISAO)
    assert anterior is not None
    assert isinstance(anterior.down_revision, str)
    return anterior.down_revision


def _missao(session: Session) -> int:
    missao = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina",
        difficulty=3,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=1),
    )
    return missao.id


def _operacao(session: Session, mission_id: int, chave: str, kind: str) -> None:
    session.execute(
        text(
            "INSERT INTO mission_operations (operation_id, mission_id, kind) "
            "VALUES (:o, :m, :k)"
        ),
        {"o": chave, "m": mission_id, "k": kind},
    )


INSERIR_REAGENDAMENTO = text(
    "INSERT INTO mission_reschedules (mission_id, operation_id, previous_deadline, "
    "new_deadline, reason, origin, rescheduled_at) "
    "VALUES (:m, :o, :antes, :depois, :motivo, :origem, :em)"
)


def _reagendamento(mission_id: int, chave: str, **ajustes: object) -> dict[str, object]:
    campos: dict[str, object] = {
        "m": mission_id,
        "o": chave,
        "antes": AGORA + timedelta(days=1),
        "depois": AGORA + timedelta(days=3),
        "motivo": "falta_de_tempo",
        "origem": "usuario",
        "em": AGORA,
    }
    campos.update(ajustes)
    return campos


def test_a_0006_cria_a_tabela_e_o_downgrade_a_remove(banco_migrado: Engine) -> None:
    cfg = alembic_config()
    try:
        command.downgrade(cfg, _anterior_a_0006())
        assert "mission_reschedules" not in inspect(banco_migrado).get_table_names()
        command.upgrade(cfg, REVISAO)
        assert "mission_reschedules" in inspect(banco_migrado).get_table_names()
    finally:
        command.upgrade(cfg, "head")


def test_o_reagendamento_valido_entra_e_volta_como_enum(session: Session) -> None:
    mission_id = _missao(session)
    _operacao(session, mission_id, "op-r1", "reschedule")
    session.execute(INSERIR_REAGENDAMENTO, _reagendamento(mission_id, "op-r1"))
    missao = session.get(Mission, mission_id)
    assert missao is not None
    session.refresh(missao)
    (linha,) = missao.reschedules
    assert linha.reason is MotivoDoReagendamento.FALTA_DE_TEMPO
    assert linha.origin is OrigemDoReagendamento.USUARIO


def test_o_historico_sai_em_ordem_de_gravacao(session: Session) -> None:
    """Os ids entram em ordem DECRESCENTE: sem o `order_by` do relacionamento o
    PostgreSQL devolveria a ordem fisica (a inversa) e o teste reprovaria."""
    mission_id = _missao(session)
    for i, id_da_linha in enumerate((30, 20, 10)):
        _operacao(session, mission_id, f"op-o{i}", "reschedule")
        session.execute(
            text(
                "INSERT INTO mission_reschedules (id, mission_id, operation_id, "
                "previous_deadline, new_deadline, reason, origin, rescheduled_at) "
                "VALUES (:id, :m, :o, :antes, :depois, 'falta_de_tempo', "
                "'usuario', :em)"
            ),
            {
                "id": id_da_linha,
                "m": mission_id,
                "o": f"op-o{i}",
                "antes": AGORA + timedelta(days=i + 1),
                "depois": AGORA + timedelta(days=i + 2),
                "em": AGORA,
            },
        )
    missao = session.get(Mission, mission_id)
    assert missao is not None
    session.refresh(missao)
    assert [r.id for r in missao.reschedules] == [10, 20, 30]
    assert isinstance(missao.reschedules[0], MissionReschedule)


@pytest.mark.parametrize(
    ("ajustes", "restricao"),
    [
        ({"motivo": "preguica"}, "ck_mission_reschedules_reason"),
        ({"origem": "sistema"}, "ck_mission_reschedules_origin"),
        (
            {"antes": AGORA + timedelta(days=1), "depois": AGORA + timedelta(days=1)},
            "ck_mission_reschedules_prazo_mudou",
        ),
    ],
)
def test_o_historico_recusa_pelo_nome(
    session: Session, ajustes: dict[str, object], restricao: str
) -> None:
    mission_id = _missao(session)
    _operacao(session, mission_id, "op-x", "reschedule")
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(
            INSERIR_REAGENDAMENTO, _reagendamento(mission_id, "op-x", **ajustes)
        )
    assert restricao in str(erro.value.orig)


def test_o_historico_exige_a_operacao_e_uma_linha_por_chave(session: Session) -> None:
    mission_id = _missao(session)
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(INSERIR_REAGENDAMENTO, _reagendamento(mission_id, "op-sem"))
    # A FK simples da 0006 virou a composta da 0010 (pendencia 165): a recusa e a
    # mesma, so o nome da restricao mudou.
    assert "fk_mission_reschedules_operacao" in str(erro.value.orig)

    _operacao(session, mission_id, "op-u", "reschedule")
    session.execute(INSERIR_REAGENDAMENTO, _reagendamento(mission_id, "op-u"))
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(
            INSERIR_REAGENDAMENTO,
            _reagendamento(mission_id, "op-u", depois=AGORA + timedelta(days=9)),
        )
    assert "uq_mission_reschedules_operation_id" in str(erro.value.orig)


def test_o_kind_da_operacao_e_fechado(session: Session) -> None:
    mission_id = _missao(session)
    for i, kind in enumerate(("complete", "start", "reschedule")):
        _operacao(session, mission_id, f"op-k{i}", kind)
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        _operacao(session, mission_id, "op-k9", "pause")
    assert "ck_mission_operations_kind" in str(erro.value.orig)


@pytest.mark.parametrize(
    ("sql", "restricao"),
    [
        (
            "UPDATE missions SET state = 'em_andamento', started_at = NULL "
            "WHERE id = :m",
            "ck_missions_em_andamento_iniciada",
        ),
        (
            "UPDATE missions SET state = 'concluida', started_at = :t, "
            "completed_at = :t - interval '1 minute' WHERE id = :m",
            "ck_missions_inicio_antes_da_conclusao",
        ),
    ],
)
def test_as_regras_do_inicio_recusam_pelo_nome(
    session: Session, sql: str, restricao: str
) -> None:
    mission_id = _missao(session)
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(text(sql), {"m": mission_id, "t": AGORA})
    assert restricao in str(erro.value.orig)


def test_a_acao_de_reagendar_e_aceita_e_outra_nao(session: Session) -> None:
    """`ck_tutor_actions_kind` passa a aceitar `reschedule_mission`."""
    pergunta = session.execute(
        text(
            "INSERT INTO tutor_messages (user_id, role, content, status, "
            "client_message_id, created_at) VALUES (1, 'user', 'oi', 'completa', "
            "'m-f-1', now()) RETURNING id"
        )
    ).scalar_one()
    resposta = session.execute(
        text(
            "INSERT INTO tutor_messages (user_id, role, content, status, "
            "reply_to_id, created_at) VALUES (1, 'tutor', 'ok', 'completa', :p, now()) "
            "RETURNING id"
        ),
        {"p": pergunta},
    ).scalar_one()
    inserir = text(
        "INSERT INTO tutor_actions (message_id, kind, payload, state, created_at) "
        "VALUES (:r, :k, '{}'::jsonb, 'proposta', now())"
    )
    session.execute(inserir, {"r": resposta, "k": "reschedule_mission"})
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(inserir, {"r": resposta, "k": "split_mission"})
    assert "ck_tutor_actions_kind" in str(erro.value.orig)


@pytest.fixture
def reagendamento_commitado(banco_migrado: Engine) -> Iterator[int]:
    with Session(bind=banco_migrado) as sessao:
        mission_id = _missao(sessao)
        _operacao(sessao, mission_id, "op-f-commit", "reschedule")
        sessao.execute(INSERIR_REAGENDAMENTO, _reagendamento(mission_id, "op-f-commit"))
        sessao.commit()
    try:
        yield mission_id
    finally:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(delete(Mission).where(Mission.id == mission_id))
            sessao.commit()


def test_o_downgrade_falha_alto_com_historico_gravado(
    banco_migrado: Engine, reagendamento_commitado: int
) -> None:
    """Voltar para a 0005 apagaria o historico de replanejamento (README s8)."""
    cfg = alembic_config()
    try:
        with pytest.raises(RuntimeError, match="mission_reschedules"):
            command.downgrade(cfg, _anterior_a_0006())
        with banco_migrado.connect() as conexao:
            versao = conexao.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
        # O banco fica como estava: na head do script, e nao na 0006 -- que
        # deixou de ser a head com a 0007 (o mesmo ajuste do teste da 0005).
        assert versao == ScriptDirectory.from_config(cfg).get_current_head()
    finally:
        command.upgrade(cfg, "head")


@pytest.fixture
def acao_de_reagendar_commitada(banco_migrado: Engine) -> Iterator[int]:
    """Uma mensagem, a resposta e a acao `reschedule_mission`, commitadas: o
    que o downgrade da 0006 precisa enxergar (a acao nao cabe no CHECK da 0005)."""
    with Session(bind=banco_migrado) as sessao:
        pergunta = sessao.execute(
            text(
                "INSERT INTO tutor_messages (user_id, role, content, status, "
                "client_message_id, created_at) VALUES (1, 'user', 'oi', 'completa', "
                "'m-f-commit', now()) RETURNING id"
            )
        ).scalar_one()
        resposta = sessao.execute(
            text(
                "INSERT INTO tutor_messages (user_id, role, content, status, "
                "reply_to_id, created_at) VALUES (1, 'tutor', 'ok', 'completa', :p, "
                "now()) RETURNING id"
            ),
            {"p": pergunta},
        ).scalar_one()
        sessao.execute(
            text(
                "INSERT INTO tutor_actions (message_id, kind, payload, state, "
                "created_at) VALUES (:r, 'reschedule_mission', '{}'::jsonb, "
                "'proposta', now())"
            ),
            {"r": resposta},
        )
        sessao.commit()
    try:
        yield resposta
    finally:
        with Session(bind=banco_migrado) as sessao:
            # A acao e a resposta saem em cascata a partir da pergunta.
            sessao.execute(
                text(
                    "DELETE FROM tutor_messages WHERE client_message_id = 'm-f-commit'"
                )
            )
            sessao.commit()


def test_o_downgrade_falha_alto_com_acao_de_reagendar_gravada(
    banco_migrado: Engine, acao_de_reagendar_commitada: int
) -> None:
    """O CHECK da 0005 recusaria a acao: melhor recusar a descida do que perder."""
    cfg = alembic_config()
    try:
        with pytest.raises(RuntimeError, match="reschedule_mission"):
            command.downgrade(cfg, _anterior_a_0006())
        with banco_migrado.connect() as conexao:
            versao = conexao.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
        # O banco fica como estava: na head do script, e nao na 0006 -- que
        # deixou de ser a head com a 0007 (o mesmo ajuste do teste da 0005).
        assert versao == ScriptDirectory.from_config(cfg).get_current_head()
    finally:
        command.upgrade(cfg, "head")


def test_o_downgrade_sem_dados_restaura_o_kind_antigo_das_acoes(
    banco_migrado: Engine,
) -> None:
    cfg = alembic_config()
    try:
        command.downgrade(cfg, _anterior_a_0006())
        with banco_migrado.connect() as conexao:
            definicao = conexao.execute(
                text(
                    "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
                    "WHERE conname = 'ck_tutor_actions_kind'"
                )
            ).scalar_one()
            restricoes = {
                c["name"] for c in inspect(conexao).get_check_constraints("missions")
            }
        assert "reschedule_mission" not in definicao
        assert "ck_missions_em_andamento_iniciada" not in restricoes
    finally:
        command.upgrade(cfg, "head")
