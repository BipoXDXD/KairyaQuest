"""O idioma escolhido pelo usuario: `users.locale`.

Revision ID: 0009
Revises: 0008

Coluna anulavel e SEM default, de proposito: `NULL` quer dizer "o usuario
nunca escolheu", e e so com essa distincao que a deteccao pelo
`navigator.language` do front vale. Um `default 'pt-BR'` tornaria "escolheu
portugues" e "nunca escolheu" a mesma linha. As linhas existentes ficam
`NULL`: ninguem escolheu nada antes desta revisao.

Com `NULL`, o CHECK da `unknown` e passa, que e o comportamento desejado.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

CHECK = "ck_users_locale"
# Lista CONGELADA, NAO derivada de `Idioma` (D8): migracao e historico.
# `tests/unit/test_idioma.py` le esta expressao e confere que o enum e ela nao
# divergem.
EXPRESSAO = "locale IN ('pt-BR', 'en')"


def upgrade() -> None:
    op.add_column("users", sa.Column("locale", sa.Text(), nullable=True))
    op.create_check_constraint(CHECK, "users", EXPRESSAO)


def downgrade() -> None:
    # Sem guarda de dados: o downgrade perde so a preferencia de idioma, e o
    # front volta a detectar pelo navegador.
    op.drop_constraint(CHECK, "users", type_="check")
    op.drop_column("users", "locale")
