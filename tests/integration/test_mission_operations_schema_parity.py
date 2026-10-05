"""Paridade delimitada das restricoes de idempotencia de mission_operations.

Compara o esquema migrado real ao modelo; os testes de persistencia existentes
continuam provando a recusa de duplicatas, referencias orfas e o CASCADE.
"""

from sqlalchemy import Engine, UniqueConstraint, inspect

from focusquest.modules.missions.models import MissionOperation

TABELA = "mission_operations"


def test_fk_de_mission_operations_corresponde_ao_modelo(banco_migrado: Engine) -> None:
    """Vinculo a missao e ON DELETE nao podem divergir entre modelo e migracao."""
    tabela = MissionOperation.metadata.tables[TABELA]
    with banco_migrado.connect() as conexao:
        inspector = inspect(conexao)
        fks_do_banco = {
            (
                tuple(fk["constrained_columns"]),
                fk["referred_schema"] or inspector.default_schema_name,
                fk["referred_table"],
                tuple(fk["referred_columns"]),
                (fk.get("options", {}).get("ondelete") or "NO ACTION").upper(),
            )
            for fk in inspector.get_foreign_keys(TABELA)
        }
        fks_do_modelo = {
            (
                tuple(fk.columns.keys()),
                fk.referred_table.schema or inspector.default_schema_name,
                fk.referred_table.name,
                tuple(elemento.column.name for elemento in fk.elements),
                (fk.ondelete or "NO ACTION").upper(),
            )
            for fk in tabela.foreign_key_constraints
        }
    assert fks_do_banco == fks_do_modelo


def test_unique_de_mission_operations_corresponde_ao_modelo(
    banco_migrado: Engine,
) -> None:
    """Nome e colunas do UNIQUE que impede reutilizar operation_id."""
    with banco_migrado.connect() as conexao:
        uniques_do_banco = {
            (restricao["name"], tuple(restricao["column_names"]))
            for restricao in inspect(conexao).get_unique_constraints(TABELA)
        }
    uniques_do_modelo = {
        (restricao.name, tuple(restricao.columns.keys()))
        for restricao in MissionOperation.metadata.tables[TABELA].constraints
        if isinstance(restricao, UniqueConstraint)
    }
    assert uniques_do_banco == uniques_do_modelo
