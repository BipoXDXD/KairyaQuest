"""A migracao 0011: `idempotency_keys` (chave por usuario do POST /missions).

O `finally` sempre devolve o esquema para `head`, como nos outros testes de
migracao.
"""

from datetime import UTC, datetime

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.core.usuario_unico import USUARIO_UNICO

from .conftest import alembic_config

REVISAO = "0011"
CHAVE = "3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c"
IMPRESSAO = "a" * 64
CRIADA = datetime(2026, 9, 18, 15, 0, tzinfo=UTC)


def _tabela_existe(banco: Engine) -> bool:
    with banco.connect() as conexao:
        nome = conexao.execute(
            text("SELECT to_regclass('idempotency_keys')")
        ).scalar_one()
        return nome is not None


def _inserir(session: Session, impressao: str = IMPRESSAO, user_id: int = 1) -> None:
    session.execute(
        text(
            "INSERT INTO idempotency_keys "
            "(user_id, key, request_fingerprint, created_at) "
            "VALUES (:u, :k, :f, :c)"
        ),
        {"u": user_id, "k": CHAVE, "f": impressao, "c": CRIADA},
    )


def test_a_0011_encadeia_na_0010(banco_migrado: Engine) -> None:
    script = ScriptDirectory.from_config(alembic_config())
    revisao = script.get_revision(REVISAO)
    assert revisao is not None
    assert revisao.down_revision == "0010"


def test_downgrade_remove_a_tabela_e_upgrade_a_recria(banco_migrado: Engine) -> None:
    cfg = alembic_config()
    try:
        command.downgrade(cfg, "0010")
        assert _tabela_existe(banco_migrado) is False
        command.upgrade(cfg, REVISAO)
        assert _tabela_existe(banco_migrado) is True
    finally:
        command.upgrade(cfg, "head")


def test_unique_recusa_a_mesma_chave_do_mesmo_usuario(session: Session) -> None:
    _inserir(session)
    with pytest.raises(IntegrityError, match="uq_idempotency_keys_user_id_key"):
        _inserir(session)


@pytest.mark.parametrize("impressao", ["a" * 63, "a" * 65, "A" * 64, "g" * 64])
def test_check_recusa_impressao_que_nao_e_sha256_hex(
    session: Session, impressao: str
) -> None:
    with pytest.raises(IntegrityError, match="ck_idempotency_keys_request_fingerprint"):
        _inserir(session, impressao)


def test_fk_recusa_usuario_inexistente(session: Session) -> None:
    with pytest.raises(IntegrityError, match="idempotency_keys_user_id_fkey"):
        _inserir(session, user_id=999)


def test_apagar_a_missao_apaga_a_chave(session: Session) -> None:
    mission_id = session.execute(
        text(
            "INSERT INTO missions (user_id, mission_type, instructions, "
            "completion_criterion, difficulty, estimated_minutes, deadline, state) "
            "VALUES (:u, 'avulsa', 'x', 'y', 1, 1, :d, 'pendente') RETURNING id"
        ),
        {"u": USUARIO_UNICO, "d": CRIADA},
    ).scalar_one()
    _inserir(session)
    session.execute(
        text("UPDATE idempotency_keys SET mission_id = :m"), {"m": mission_id}
    )

    session.execute(text("DELETE FROM missions WHERE id = :m"), {"m": mission_id})

    assert (
        session.execute(text("SELECT count(*) FROM idempotency_keys")).scalar_one() == 0
    )
