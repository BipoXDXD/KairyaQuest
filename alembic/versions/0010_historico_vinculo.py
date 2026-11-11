"""O elo do historico de reagendamentos prova missao e tipo (pendencia 165).

Revision ID: 0010
Revises: 0009

Antes, `mission_reschedules.operation_id` apontava so para
`mission_operations.operation_id`: o banco aceitava um reagendamento amarrado a
uma operacao `complete` ou `start`, ou a uma operacao de OUTRA missao; quem
garantia o vinculo era o servico. Agora o elo e uma FK composta
(operation_id, mission_id, operation_kind) -> (operation_id, mission_id, kind),
e `operation_kind` so aceita `reschedule` (CHECK).

Expand-safe: a coluna nova nasce com `server_default 'reschedule'`, entao o
codigo da revisao anterior, que nao a conhece, continua inserindo. A FK simples
sai na mesma revisao porque a composta a implica (as tres colunas sao NOT NULL,
entao nao ha MATCH SIMPLE frouxo) e as duas juntas so dobrariam a checagem. Nao
ha mudanca de leitura: nenhuma coluna existente muda de significado.

O UNIQUE (operation_id, mission_id, kind) em `mission_operations` e redundante
com o UNIQUE de `operation_id`, mas e o que o PostgreSQL exige como alvo de uma
FK composta.

Linhas legadas inconsistentes (o que o servico nunca gravou, mas o banco
permitia) param o upgrade com uma mensagem que lista as chaves, antes de
qualquer DDL: corrigir ou apagar de proposito e melhor do que escolher por quem.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Copia CONGELADA, NAO import (D8): migracao e historico.
TIPO_DO_ELO = "reschedule"
UNIQUE = "uq_mission_operations_vinculo"
FK_DO_ELO = "fk_mission_reschedules_operacao"
FK_ANTIGA = "mission_reschedules_operation_id_fkey"
CHECK_DO_TIPO = "ck_mission_reschedules_operation_kind"
LIMITE_DA_LISTA = 20


def _exigir_historico_consistente() -> None:
    conexao = op.get_bind()
    inconsistentes = (
        conexao.execute(
            sa.text(
                "SELECT r.operation_id FROM mission_reschedules r "
                "JOIN mission_operations o ON o.operation_id = r.operation_id "
                "WHERE o.kind <> :tipo OR o.mission_id <> r.mission_id "
                "ORDER BY r.id LIMIT :limite"
            ),
            {"tipo": TIPO_DO_ELO, "limite": LIMITE_DA_LISTA},
        )
        .scalars()
        .all()
    )
    if inconsistentes:
        raise RuntimeError(
            "mission_reschedules com operacao de outro tipo ou de outra missao "
            f"(operation_id: {', '.join(inconsistentes)}): corrija ou apague de "
            "proposito antes de subir para 0010"
        )


def upgrade() -> None:
    # No modo offline (`--sql`) nao ha conexao para ler; o DDL sai do mesmo jeito
    # e a FK, ao ser criada, recusa o que a guarda teria listado.
    if not context.is_offline_mode():
        _exigir_historico_consistente()
    op.add_column(
        "mission_reschedules",
        sa.Column(
            "operation_kind",
            sa.Text,
            nullable=False,
            server_default=TIPO_DO_ELO,
        ),
    )
    op.create_check_constraint(
        CHECK_DO_TIPO, "mission_reschedules", f"operation_kind = '{TIPO_DO_ELO}'"
    )
    op.create_unique_constraint(
        UNIQUE, "mission_operations", ["operation_id", "mission_id", "kind"]
    )
    op.drop_constraint(FK_ANTIGA, "mission_reschedules", type_="foreignkey")
    op.create_foreign_key(
        FK_DO_ELO,
        "mission_reschedules",
        "mission_operations",
        ["operation_id", "mission_id", "operation_kind"],
        ["operation_id", "mission_id", "kind"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    # Sem guarda de dados: o historico fica inteiro, so o vinculo composto sai.
    op.drop_constraint(FK_DO_ELO, "mission_reschedules", type_="foreignkey")
    op.create_foreign_key(
        FK_ANTIGA,
        "mission_reschedules",
        "mission_operations",
        ["operation_id"],
        ["operation_id"],
        ondelete="CASCADE",
    )
    op.drop_constraint(UNIQUE, "mission_operations", type_="unique")
    op.drop_constraint(CHECK_DO_TIPO, "mission_reschedules", type_="check")
    op.drop_column("mission_reschedules", "operation_kind")
