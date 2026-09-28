"""A migracao 0005: entrega, avaliacao e a segunda fonte do livro-razao.

Mesmo padrao de `test_progression_migration.py`: o `finally` sempre devolve
o esquema para `head`.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from alembic import command
from sqlalchemy import Engine, delete, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.models import Mission
from focusquest.modules.missions.service import concluir_missao, criar_missao

from .conftest import alembic_config

ESTUDANTE = 1
AGORA = datetime(2026, 9, 28, 15, tzinfo=UTC)


def _nova_missao(session: Session) -> int:
    missao = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina",
        difficulty=3,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=1),
    )
    concluir_missao(session, ESTUDANTE, missao.id, "op-e-migracao", clock=lambda: AGORA)
    return missao.id


@pytest.fixture
def missao_concluida(session: Session) -> int:
    return _nova_missao(session)


def test_a_0005_cria_as_tabelas_e_o_downgrade_as_remove(banco_migrado: Engine) -> None:
    cfg = alembic_config()
    try:
        command.downgrade(cfg, "0004")
        assert "mission_evidence" not in inspect(banco_migrado).get_table_names()
        command.upgrade(cfg, "0005")
        nomes = set(inspect(banco_migrado).get_table_names())
        assert {"mission_evidence", "mission_evaluations"} <= nomes
    finally:
        command.upgrade(cfg, "head")


def test_xp_entries_aceita_conclusao_e_bonus_da_mesma_missao_uma_vez_cada(
    session: Session, missao_concluida: int
) -> None:
    """E14: a unicidade passa a (mission_id, source)."""
    inserir = text(
        "INSERT INTO xp_entries (user_id, mission_id, amount, source, credited_at) "
        "VALUES (1, :m, 10, :s, now())"
    )
    session.execute(inserir, {"m": missao_concluida, "s": "evaluation_bonus"})
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(inserir, {"m": missao_concluida, "s": "evaluation_bonus"})
    assert "uq_xp_entries_mission_id_source" in str(erro.value.orig)
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(inserir, {"m": missao_concluida, "s": "outra_fonte"})
    assert "ck_xp_entries_source" in str(erro.value.orig)


@pytest.fixture
def missao_com_bonus_commitada(banco_migrado: Engine) -> Iterator[int]:
    """Missao concluida com um lancamento `evaluation_bonus`, COMMITADOS;
    a limpeza apaga a missao e o `ON DELETE CASCADE` leva o resto."""
    with Session(bind=banco_migrado) as sessao:
        mission_id = _nova_missao(sessao)
        sessao.execute(
            text(
                "INSERT INTO xp_entries (user_id, mission_id, amount, source, "
                "credited_at) VALUES (1, :m, 10, 'evaluation_bonus', now())"
            ),
            {"m": mission_id},
        )
        sessao.commit()
    try:
        yield mission_id
    finally:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(delete(Mission).where(Mission.id == mission_id))
            sessao.commit()


def test_o_downgrade_falha_alto_com_bonus_gravado(
    banco_migrado: Engine, missao_com_bonus_commitada: int
) -> None:
    """Voltar a unicidade so por missao recusaria o bonus de todo jeito; o
    downgrade diz isso em vez de apagar XP do usuario."""
    cfg = alembic_config()
    try:
        with pytest.raises(RuntimeError, match="evaluation_bonus"):
            command.downgrade(cfg, "0004")
    finally:
        command.upgrade(cfg, "head")
