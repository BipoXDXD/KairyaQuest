"""Modo offline do Alembic (`--sql`): gera o SQL sem conectar (pendencia 9/10).

Escopo declarado, nao geral. `op.get_bind()` e None no modo offline, entao
nenhuma migracao que LE dados roda aqui:
- upgrade da 0004: o backfill le missoes e grava XP/conquistas;
- downgrade de 0003, 0005 e 0006: as guardas contam linhas antes de destruir.
Tudo o mais e coberto: upgrades 0001-0003 e 0005-0010, downgrades 0010, 0007,
0004, 0002 e 0001. A 0010 le dados so online (a guarda e pulada offline).
Uma migracao nova que passe a ler dados quebra a faixa dela aqui -- e a
decisao de tira-la do escopo fica escrita, nao implicita.
"""

from argparse import Namespace
from io import StringIO

import pytest
from alembic import command
from alembic.config import Config


def _config_offline(saida: StringIO) -> Config:
    """Mesmo `-x test=true` da `alembic_config()`: nada conecta, mas a URL
    lida para montar o dialeto continua sendo a de teste."""
    return Config(
        "alembic.ini", output_buffer=saida, cmd_opts=Namespace(x=["test=true"])
    )


@pytest.mark.parametrize(
    ("faixa", "ddl_esperado", "ddl_ausente"),
    [
        pytest.param(
            "0003",
            (
                "CREATE TABLE users",
                "CREATE TABLE tutor_messages",
                "CREATE TABLE weekly_plans",
            ),
            ("CREATE TABLE xp_entries",),
            id="base-ate-0003",
        ),
        pytest.param(
            "0004:head",
            (
                "CREATE TABLE mission_evidence",
                "CREATE TABLE mission_reschedules",
                "ADD COLUMN fallback_model",
            ),
            ("CREATE TABLE xp_entries",),
            id="0004-ate-head",
        ),
        pytest.param(
            "0009:head",
            (
                "ADD COLUMN operation_kind",
                "uq_mission_operations_vinculo",
                "fk_mission_reschedules_operacao",
            ),
            (),
            id="0009-ate-head",
        ),
    ],
)
def test_upgrade_offline_gera_o_ddl_da_faixa(
    faixa: str, ddl_esperado: tuple[str, ...], ddl_ausente: tuple[str, ...]
) -> None:
    saida = StringIO()
    command.upgrade(_config_offline(saida), faixa, sql=True)
    sql = saida.getvalue()
    for trecho in ddl_esperado:
        assert trecho in sql
    for trecho in ddl_ausente:
        assert trecho not in sql


@pytest.mark.parametrize(
    ("faixa", "ddl_esperado"),
    [
        pytest.param(
            "0010:0009",
            ("DROP COLUMN operation_kind", "mission_reschedules_operation_id_fkey"),
            id="0010",
        ),
        pytest.param("0007:0006", ("DROP COLUMN fallback_model",), id="0007"),
        pytest.param("0004:0003", ("DROP TABLE xp_entries",), id="0004"),
        pytest.param(
            "0002:base",
            ("DROP TABLE tutor_messages", "DROP TABLE users"),
            id="0002-0001",
        ),
    ],
)
def test_downgrade_offline_sem_guarda_gera_o_ddl_da_faixa(
    faixa: str, ddl_esperado: tuple[str, ...]
) -> None:
    saida = StringIO()
    command.downgrade(_config_offline(saida), faixa, sql=True)
    sql = saida.getvalue()
    for trecho in ddl_esperado:
        assert trecho in sql
