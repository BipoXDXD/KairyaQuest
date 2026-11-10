"""Paridade GERAL entre os metadados ORM e o esquema migrado (pendencia 9/10).

O `compare_metadata` do Alembic e o mesmo motor do `revision --autogenerate`:
diff vazio quer dizer que um autogenerate agora nao proporia nada. Cobre
tabelas, colunas, tipos, nulabilidade, server defaults, FKs (com ON DELETE),
UNIQUE e indices.

Fica FORA, por limite do proprio Alembic 1.20, e nao por escolha:
- texto dos CHECKs: o autogenerate nao compara CHECK. O segundo teste compara
  os NOMES; o texto continua provado pelos testes de comportamento;
- predicado de indice parcial (`postgresql_where`): so a unicidade e as
  colunas entram na comparacao.

Os testes delimitados (`test_*_schema_parity.py`) continuam: eles fixam nomes
de UNIQUE e o predicado ausente de `ix_xp_entries_user_id_id`.
"""

from pprint import pformat
from typing import Any

from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import CheckConstraint, Engine, inspect

# Os mesmos tres imports do alembic/env.py: sao eles que registram as tabelas
# em Base.metadata. Se um modulo novo de modelos ficar de fora, a tabela dele
# aparece no diff como `remove_table` -- a omissao nao passa calada.
import focusquest.modules.missions.models  # noqa: F401
import focusquest.modules.progression.models  # noqa: F401
import focusquest.modules.tutoring.models  # noqa: F401
from focusquest.core.base import Base

TABELA_DO_ALEMBIC = "alembic_version"


def test_esquema_migrado_nao_diverge_dos_modelos(banco_migrado: Engine) -> None:
    with banco_migrado.connect() as conexao:
        contexto = MigrationContext.configure(
            connection=conexao,
            opts={"compare_type": True, "compare_server_default": True},
        )
        diferencas: list[Any] = compare_metadata(contexto, Base.metadata)
    assert diferencas == [], "modelo e migracao divergem:\n" + pformat(diferencas)


def test_checks_do_banco_tem_os_mesmos_nomes_que_os_do_modelo(
    banco_migrado: Engine,
) -> None:
    with banco_migrado.connect() as conexao:
        inspector = inspect(conexao)
        do_banco = {
            (tabela, str(restricao["name"]))
            for tabela in inspector.get_table_names()
            if tabela != TABELA_DO_ALEMBIC
            for restricao in inspector.get_check_constraints(tabela)
        }
    do_modelo = {
        (tabela.name, str(restricao.name))
        for tabela in Base.metadata.sorted_tables
        for restricao in tabela.constraints
        if isinstance(restricao, CheckConstraint)
    }
    assert do_banco == do_modelo, (
        f"so no banco: {sorted(do_banco - do_modelo)}; "
        f"so no modelo: {sorted(do_modelo - do_banco)}"
    )
