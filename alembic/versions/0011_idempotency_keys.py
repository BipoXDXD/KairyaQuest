"""`idempotency_keys`: a reserva da `Idempotency-Key` do POST /api/missions.

Revision ID: 0011
Revises: 0010

Aditiva: so cria uma tabela; nenhuma coluna existente muda. O codigo da
revisao anterior nao a conhece e continua funcionando.

- `UNIQUE (user_id, key)`: o escopo da chave e o usuario. E o alvo do
  `INSERT ... ON CONFLICT DO NOTHING` que reserva a chave.
- `user_id` com `ON DELETE CASCADE`: a reserva so tem sentido para o dono.
- `mission_id` com `ON DELETE CASCADE` e indice proprio (o PostgreSQL nao
  indexa FK sozinho): sem a missao, a reserva nao tem o que repetir. E anulavel
  so dentro da transacao que reserva (ver o modelo).
- `request_fingerprint`: SHA-256 em hexadecimal minusculo, garantido por CHECK.
- `created_at` sem default: vem do relogio injetado, porque decide a validade.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

TABELA = "idempotency_keys"
INDICE_DA_MISSAO = "ix_idempotency_keys_mission_id"


def upgrade() -> None:
    op.create_table(
        TABELA,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.Uuid, nullable=False),
        sa.Column("request_fingerprint", sa.Text, nullable=False),
        sa.Column(
            "mission_id",
            sa.Integer,
            sa.ForeignKey("missions.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "key", name="uq_idempotency_keys_user_id_key"),
        sa.CheckConstraint(
            "request_fingerprint ~ '^[0-9a-f]{64}$'",
            name="ck_idempotency_keys_request_fingerprint",
        ),
    )
    op.create_index(INDICE_DA_MISSAO, TABELA, ["mission_id"])


def downgrade() -> None:
    op.drop_index(INDICE_DA_MISSAO, table_name=TABELA)
    op.drop_table(TABELA)
