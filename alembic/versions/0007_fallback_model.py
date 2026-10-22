"""Fallback da recusa: o modelo substituto que serviu a resposta da Kairya.

Revision ID: 0007
Revises: 0006

Pendencia 174. A coluna e nula quando quem respondeu foi o modelo pedido, e
so a resposta da Kairya pode te-la: a pergunta de quem estuda nao tem modelo.
Coluna propria, e nao o `error_code`: o fallback nao e erro, e uma resposta
substituida E cortada precisa dos dois valores (pendencia 170).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

CHECK = "ck_tutor_messages_fallback_so_da_tutora"


def upgrade() -> None:
    op.add_column("tutor_messages", sa.Column("fallback_model", sa.Text, nullable=True))
    op.create_check_constraint(
        CHECK, "tutor_messages", "fallback_model IS NULL OR role = 'tutor'"
    )


def downgrade() -> None:
    # Sem guarda de dados: o downgrade perde so a informacao de QUEM serviu a
    # resposta, e a resposta em si fica.
    op.drop_constraint(CHECK, "tutor_messages", type_="check")
    op.drop_column("tutor_messages", "fallback_model")
