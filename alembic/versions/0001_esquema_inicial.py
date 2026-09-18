"""Esquema inicial: users, missions e mission_operations.

Revision ID: 0001
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Copia congelada dos estados, NAO um import de MissionState. Migracao e
# historico: ela precisa continuar descrevendo o banco de 2026-09-17 mesmo
# depois que o enum do dominio ganhar um quarto estado. Importar o enum faria
# esta migracao mudar de significado sozinha, e um banco recriado do zero
# divergiria de um banco migrado.
ESTADOS = ("pendente", "em_andamento", "concluida")

# A lista SQL e montada por join, nao por str(ESTADOS). O repr de tupla so
# produz SQL valido por acidente: com um unico estado, str(("x",)) daria
# ('x',) -- a virgula sobrando torna o CHECK invalido. O join nao tem esse
# caso especial e le igualmente bem.
_ESTADOS_SQL = ", ".join(f"'{estado}'" for estado in ESTADOS)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("display_name", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Usuario unico local e DECLARADO (README s8). Nao ha login; esta linha
    # existe porque missao pertence a alguem e a chave estrangeira precisa
    # de destino.
    op.bulk_insert(
        sa.table(
            "users",
            sa.column("id", sa.Integer),
            sa.column("display_name", sa.Text),
        ),
        [{"id": 1, "display_name": "Estudante"}],
    )

    # Inserir com `id` explicito NAO avanca a sequence: ela continuaria em 1, e
    # o proximo `INSERT INTO users (display_name)` -- sem id -- pediria 1 de
    # novo e bateria na chave primaria. O defeito so apareceria no dia em que
    # existisse um segundo usuario, meses depois, como violacao de PK e longe
    # desta linha. `pg_get_serial_sequence` descobre o nome da sequence em vez
    # de codificar "users_id_seq", que muda se a coluna for renomeada.
    op.execute(
        "SELECT setval("
        "pg_get_serial_sequence('users', 'id'), "
        "(SELECT max(id) FROM users)"
        ")"
    )

    op.create_table(
        "missions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("instructions", sa.Text, nullable=False),
        sa.Column("completion_criterion", sa.Text, nullable=False),
        sa.Column("difficulty", sa.Integer, nullable=False),
        sa.Column("estimated_minutes", sa.Integer, nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.Text, nullable=False, server_default="pendente"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        # VARCHAR + CHECK em vez de ENUM nativo (decisao A6 da spec):
        # acrescentar um estado depois e uma migracao comum, dentro de
        # transacao, em vez de ALTER TYPE ADD VALUE.
        sa.CheckConstraint(
            f"state IN ({_ESTADOS_SQL})",
            name="ck_missions_state",
        ),
        sa.CheckConstraint("difficulty >= 1", name="ck_missions_difficulty"),
        sa.CheckConstraint(
            "estimated_minutes > 0",
            name="ck_missions_estimated_minutes",
        ),
    )
    op.create_index("ix_missions_user_id", "missions", ["user_id"])

    # Idempotencia: o identificador de operacao enviado pelo cliente, com
    # restricao unica. E o que sustenta "reenviar devolve o mesmo sucesso"
    # mesmo sob concorrencia (README s8).
    op.create_table(
        "mission_operations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("operation_id", sa.Text, nullable=False),
        sa.Column(
            "mission_id",
            sa.Integer,
            sa.ForeignKey("missions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("operation_id", name="uq_mission_operations_operation_id"),
    )


def downgrade() -> None:
    op.drop_table("mission_operations")
    op.drop_index("ix_missions_user_id", table_name="missions")
    op.drop_table("missions")
    op.drop_table("users")
