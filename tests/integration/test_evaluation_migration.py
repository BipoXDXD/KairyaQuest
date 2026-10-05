"""A migracao 0005: entrega, avaliacao e a segunda fonte do livro-razao.

Mesmo padrao de `test_progression_migration.py`: o `finally` sempre devolve
o esquema para `head`.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import Connection, Engine, delete, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.models import Mission
from focusquest.modules.missions.service import concluir_missao, criar_missao

from .conftest import alembic_config

ESTUDANTE = 1
REVISAO = "0005"
AGORA = datetime(2026, 9, 28, 15, tzinfo=UTC)


def _anterior_a_0005() -> str:
    """A revisao de que a 0005 desce, lida do proprio script.

    Fixar `"0004"` quebraria quando entrasse uma 0006 entre elas; ler o
    `down_revision` faz o teste seguir a cadeia sozinho.
    """
    script = ScriptDirectory.from_config(alembic_config())
    anterior = script.get_revision(REVISAO)
    assert anterior is not None
    assert isinstance(anterior.down_revision, str)
    return anterior.down_revision


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
        command.downgrade(cfg, _anterior_a_0005())
        assert "mission_evidence" not in inspect(banco_migrado).get_table_names()
        command.upgrade(cfg, REVISAO)
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
            command.downgrade(cfg, _anterior_a_0005())
    finally:
        command.upgrade(cfg, "head")


def test_o_downgrade_devolve_as_restricoes_do_livro_razao_da_0004(
    banco_migrado: Engine,
) -> None:
    """Depois do downgrade: unicidade SO por missao e CHECK so com
    `mission_completed`, como antes da 0005."""
    cfg = alembic_config()
    try:
        command.downgrade(cfg, _anterior_a_0005())
        with banco_migrado.connect() as conexao:
            unicas = {
                u["name"]: tuple(u["column_names"])
                for u in inspect(conexao).get_unique_constraints("xp_entries")
            }
            fonte = conexao.execute(
                text(
                    "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE "
                    "conname = 'ck_xp_entries_source' "
                    "AND conrelid = 'xp_entries'::regclass"
                )
            ).scalar_one()
        assert unicas == {"uq_xp_entries_mission_id": ("mission_id",)}
        assert "mission_completed" in fonte
        assert "evaluation_bonus" not in fonte
    finally:
        command.upgrade(cfg, "head")


@pytest.fixture
def missao_com_evidencia_e_avaliacao_commitadas(
    banco_migrado: Engine,
) -> Iterator[int]:
    """Missao concluida com evidencia e uma avaliacao (sem bonus), COMMITADAS."""
    with Session(bind=banco_migrado) as sessao:
        mission_id = _nova_missao(sessao)
        sessao.execute(
            text(
                "INSERT INTO mission_evidence (mission_id, text, submitted_at) "
                "VALUES (:m, 'Fiz tudo', now())"
            ),
            {"m": mission_id},
        )
        sessao.execute(
            text(
                "INSERT INTO mission_evaluations (mission_id, state, attempt, "
                "verdict, feedback, model, requested_at, finished_at) VALUES "
                "(:m, 'concluida', 1, 'parcial', 'Falta um criterio.', 'modelo-x', "
                "now(), now())"
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


@pytest.mark.parametrize("tabela", ["mission_evidence", "mission_evaluations"])
def test_o_downgrade_falha_alto_com_evidencia_ou_avaliacao_gravada(
    banco_migrado: Engine, missao_com_evidencia_e_avaliacao_commitadas: int, tabela: str
) -> None:
    """Sem bonus, o `drop_table` levaria em silencio os textos e os vereditos:
    o downgrade recusa, e o banco fica como estava (a versao de antes e as linhas)."""
    cfg = alembic_config()
    mission_id = missao_com_evidencia_e_avaliacao_commitadas
    outra = (
        "mission_evaluations" if tabela == "mission_evidence" else "mission_evidence"
    )
    try:
        with banco_migrado.begin() as conexao:
            # Deixa so UMA das duas tabelas com linha, para cada caso provar a
            # sua propria guarda.
            conexao.execute(
                text(f"DELETE FROM {outra} WHERE mission_id = :m"), {"m": mission_id}
            )
        with pytest.raises(RuntimeError, match=tabela):
            command.downgrade(cfg, _anterior_a_0005())
        with banco_migrado.connect() as conexao:
            versao = conexao.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
            restam = conexao.execute(
                text(f"SELECT count(*) FROM {tabela} WHERE mission_id = :m"),
                {"m": mission_id},
            ).scalar_one()
            unicas = {
                u["name"] for u in inspect(conexao).get_unique_constraints("xp_entries")
            }
        assert versao == ScriptDirectory.from_config(cfg).get_current_head()
        assert restam == 1
        assert unicas == {"uq_xp_entries_mission_id_source"}
    finally:
        command.upgrade(cfg, "head")


def _livro_legado(
    conexao: Connection, usuarios: list[int]
) -> dict[str, list[tuple[Any, ...]]]:
    """Mantem IDs e FKs brutos; os testes da 0004 normalizam esses campos."""
    parametros = {"u1": usuarios[0], "u2": usuarios[1]}
    consultas = {
        "xp": (
            "SELECT id, user_id, mission_id, amount, source, credited_at "
            "FROM xp_entries WHERE user_id IN (:u1, :u2) ORDER BY mission_id"
        ),
        "conquistas": (
            "SELECT user_id, code, unlocked_at, xp_entry_id "
            "FROM user_achievements WHERE user_id IN (:u1, :u2) "
            "ORDER BY user_id, code"
        ),
        "vinculos": (
            "SELECT ua.user_id, ua.code, xe.user_id, xe.mission_id, m.user_id "
            "FROM user_achievements ua JOIN xp_entries xe ON xe.id = ua.xp_entry_id "
            "JOIN missions m ON m.id = xe.mission_id "
            "WHERE ua.user_id IN (:u1, :u2) ORDER BY ua.user_id, ua.code"
        ),
        "totais": (
            "SELECT user_id, sum(amount) FROM xp_entries "
            "WHERE user_id IN (:u1, :u2) GROUP BY user_id ORDER BY user_id"
        ),
    }
    return {
        nome: [tuple(linha) for linha in conexao.execute(text(sql), parametros)]
        for nome, sql in consultas.items()
    }


def test_ida_e_volta_0005_preserva_identidade_e_vinculos_do_xp_legado(
    banco_migrado: Engine,
) -> None:
    """T-M4: preservacao exata, alem dos valores ja medidos atraves da 0004."""
    cfg = alembic_config()
    anterior = _anterior_a_0005()
    usuarios: list[int] = []
    try:
        command.downgrade(cfg, anterior)
        with banco_migrado.begin() as conexao:
            # SQL no esquema legado: nao depende dos modelos/servicos de head.
            for indice, valor in enumerate((37, 83)):
                user_id = conexao.execute(
                    text(
                        "INSERT INTO users (display_name) VALUES (:nome) RETURNING id"
                    ),
                    {"nome": f"Legado XP {indice}"},
                ).scalar_one()
                usuarios.append(user_id)
                mission_id = conexao.execute(
                    text(
                        "INSERT INTO missions (user_id, instructions, "
                        "completion_criterion, difficulty, estimated_minutes, "
                        "deadline, state, mission_type, completed_at) VALUES "
                        "(:u, 'Ler', 'Resumo', 2, 30, :quando, 'concluida', "
                        "'avulsa', :quando) RETURNING id"
                    ),
                    {"u": user_id, "quando": AGORA},
                ).scalar_one()
                creditado_em = AGORA + timedelta(seconds=indice + 1)
                xp_id = conexao.execute(
                    text(
                        "INSERT INTO xp_entries (user_id, mission_id, amount, "
                        "source, credited_at) VALUES (:u, :m, :a, "
                        "'mission_completed', :quando) RETURNING id"
                    ),
                    {"u": user_id, "m": mission_id, "a": valor, "quando": creditado_em},
                ).scalar_one()
                conexao.execute(
                    text(
                        "INSERT INTO user_achievements "
                        "(user_id, code, unlocked_at, xp_entry_id) "
                        "VALUES (:u, 'first_steps', :quando, :xp)"
                    ),
                    {"u": user_id, "quando": creditado_em, "xp": xp_id},
                )
            antes = _livro_legado(conexao, usuarios)
        assert len(antes["xp"]) == len(antes["conquistas"]) == 2
        assert antes["totais"] == list(zip(usuarios, (37, 83), strict=True))
        assert all(linha[4] == "mission_completed" for linha in antes["xp"])
        assert all(
            u == dono == dono_missao for u, _, dono, _, dono_missao in antes["vinculos"]
        )

        for destino in (REVISAO, anterior):
            if destino == REVISAO:
                command.upgrade(cfg, destino)
            else:
                command.downgrade(cfg, destino)
            with banco_migrado.connect() as conexao:
                assert (
                    conexao.execute(
                        text("SELECT version_num FROM alembic_version")
                    ).scalar_one()
                    == destino
                )
                depois = _livro_legado(conexao, usuarios)
            # Antes do oraculo de identidade: payload e FKs logicas continuam iguais.
            assert depois["totais"] == antes["totais"]
            assert depois["vinculos"] == antes["vinculos"]
            assert [linha[1:] for linha in depois["xp"]] == [
                linha[1:] for linha in antes["xp"]
            ]
            assert [linha[:3] for linha in depois["conquistas"]] == [
                linha[:3] for linha in antes["conquistas"]
            ]
            assert depois["xp"] == antes["xp"]
            assert depois["conquistas"] == antes["conquistas"]
    finally:
        try:
            command.upgrade(cfg, "head")
        finally:
            with banco_migrado.begin() as conexao:
                # CASCADE remove so os dados dos usuarios proprios.
                for user_id in usuarios:
                    conexao.execute(
                        text("DELETE FROM users WHERE id = :u"), {"u": user_id}
                    )
