"""Paridade delimitada de xp_entries: Alembic real versus metadados ORM.

Nao existe divergencia atual demonstrada: estes testes fecham uma lacuna de
comparacao, sem duplicar testes de INSERT/DELETE ou criar tabela espelho.
"""

from sqlalchemy import Engine, UniqueConstraint, inspect

from focusquest.modules.progression.models import XpEntry

TABELA = "xp_entries"
INDICE = "ix_xp_entries_user_id_id"


def test_fks_de_xp_entries_correspondem_ao_modelo(banco_migrado: Engine) -> None:
    """Colunas, alvo, schema e ON DELETE; nomes automaticos nao sao contrato."""
    tabela = XpEntry.metadata.tables[TABELA]
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


def test_unique_de_xp_entries_corresponde_ao_modelo(banco_migrado: Engine) -> None:
    """Nome explicito e colunas: o UNIQUE da missao tem significado proprio."""
    tabela = XpEntry.metadata.tables[TABELA]
    with banco_migrado.connect() as conexao:
        uniques_do_banco = {
            (restricao["name"], tuple(restricao["column_names"]))
            for restricao in inspect(conexao).get_unique_constraints(TABELA)
        }
    uniques_do_modelo = {
        (restricao.name, tuple(restricao.columns.keys()))
        for restricao in tabela.constraints
        if isinstance(restricao, UniqueConstraint)
    }
    assert uniques_do_banco == uniques_do_modelo


def test_indice_de_xp_entries_corresponde_ao_modelo(banco_migrado: Engine) -> None:
    """Indice nomeado: ordem, unicidade e ausencia do predicado no contrato atual."""
    tabela = XpEntry.metadata.tables[TABELA]
    with banco_migrado.connect() as conexao:
        indices_do_banco = {
            indice["name"]: indice for indice in inspect(conexao).get_indexes(TABELA)
        }
    indices_do_modelo = {str(indice.name): indice for indice in tabela.indexes}
    banco = indices_do_banco[INDICE]
    modelo = indices_do_modelo[INDICE]

    assert tuple(banco["column_names"]) == tuple(modelo.columns.keys())
    assert banco["unique"] == modelo.unique
    # Hoje o indice e completo, nao parcial. Nao comparar SQL textual nem
    # inventar normalizador para um predicado futuro que nao foi desenhado.
    assert banco.get("dialect_options", {}).get("postgresql_where") is None
    assert modelo.dialect_options["postgresql"]["where"] is None
