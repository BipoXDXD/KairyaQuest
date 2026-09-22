"""Tutoria: tutor_messages e tutor_actions.

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Copias congeladas, NAO imports dos enums: migracao e historico (ver 0001).
PAPEIS = ("user", "tutor")
STATUS = ("gerando", "completa", "interrompida", "falhou")
TIPOS = ("create_mission",)
ESTADOS = ("proposta", "executada", "recusada", "falhou")


def _sql(valores: tuple[str, ...]) -> str:
    return ", ".join(f"'{valor}'" for valor in valores)


def upgrade() -> None:
    op.create_table(
        "tutor_messages",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.Text, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("client_message_id", sa.Text, nullable=True),
        sa.Column(
            "reply_to_id",
            sa.Integer,
            sa.ForeignKey("tutor_messages.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("error_code", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"role IN ({_sql(PAPEIS)})", name="ck_tutor_messages_role"),
        sa.CheckConstraint(
            f"status IN ({_sql(STATUS)})", name="ck_tutor_messages_status"
        ),
        # A forma de cada papel: a pergunta tem identificador do cliente, nao
        # responde a nada e nasce completa; a resposta sempre aponta a
        # pergunta. A legalidade do proprio `role` e responsabilidade
        # exclusiva de `ck_tutor_messages_role` -- daqui o ELSE TRUE: sem
        # ele, um `role` invalido violaria as duas restricoes ao mesmo
        # tempo, e o PostgreSQL relataria 'forma' (ordem alfabetica de
        # nome), escondendo que quem recusou de verdade foi o valor do
        # papel.
        sa.CheckConstraint(
            "CASE role "
            "WHEN 'user' THEN client_message_id IS NOT NULL "
            "AND reply_to_id IS NULL AND status = 'completa' "
            "WHEN 'tutor' THEN client_message_id IS NULL "
            "AND reply_to_id IS NOT NULL "
            "ELSE true END",
            name="ck_tutor_messages_forma",
        ),
        sa.UniqueConstraint(
            "client_message_id", name="uq_tutor_messages_client_message_id"
        ),
    )
    # Uma resposta viva por pergunta: "Tentar de novo" cria outra linha, e as
    # tentativas interrompidas e falhas ficam como historico.
    op.create_index(
        "uq_tutor_messages_uma_completa_por_pergunta",
        "tutor_messages",
        ["reply_to_id"],
        unique=True,
        postgresql_where=sa.text("status = 'completa'"),
    )
    # Uma resposta sendo gerada por vez: a conversa e uma so.
    op.create_index(
        "uq_tutor_messages_uma_gerando_por_usuario",
        "tutor_messages",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'gerando'"),
    )
    op.create_index("ix_tutor_messages_user_id_id", "tutor_messages", ["user_id", "id"])

    op.create_table(
        "tutor_actions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "message_id",
            sa.Integer,
            sa.ForeignKey("tutor_messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("state", sa.Text, nullable=False),
        sa.Column(
            "mission_id", sa.Integer, sa.ForeignKey("missions.id"), nullable=True
        ),
        sa.Column("operation_id", sa.Text, nullable=True),
        sa.Column("error_code", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(f"kind IN ({_sql(TIPOS)})", name="ck_tutor_actions_kind"),
        sa.CheckConstraint(
            f"state IN ({_sql(ESTADOS)})", name="ck_tutor_actions_state"
        ),
        sa.CheckConstraint(
            "(state = 'executada') = (mission_id IS NOT NULL)",
            name="ck_tutor_actions_missao_so_quando_executada",
        ),
        sa.CheckConstraint(
            "(state = 'proposta') = (decided_at IS NULL)",
            name="ck_tutor_actions_decisao_datada",
        ),
        sa.UniqueConstraint("operation_id", name="uq_tutor_actions_operation_id"),
    )
    op.create_index("ix_tutor_actions_message_id", "tutor_actions", ["message_id"])


def downgrade() -> None:
    op.drop_index("ix_tutor_actions_message_id", table_name="tutor_actions")
    op.drop_table("tutor_actions")
    op.drop_index("ix_tutor_messages_user_id_id", table_name="tutor_messages")
    op.drop_index(
        "uq_tutor_messages_uma_gerando_por_usuario", table_name="tutor_messages"
    )
    op.drop_index(
        "uq_tutor_messages_uma_completa_por_pergunta", table_name="tutor_messages"
    )
    op.drop_table("tutor_messages")
