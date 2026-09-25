"""Ciclo diario: weekly_plans e o tipo, o plano e o dia da missao.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Copia congelada, NAO import de MissionType: migracao e historico (ver 0001).
TIPOS = ("avulsa", "diaria", "especial")
_TIPOS_SQL = ", ".join(f"'{tipo}'" for tipo in TIPOS)

# As regras que amarram tipo, plano, dia e prazo (spec, "Modelo de dados").
# Com `mission_type` NOT NULL, nenhuma igualdade abaixo da desconhecido -- e
# um CHECK aprova o desconhecido, o que tornaria cada uma inutil.
CHECKS = (
    ("ck_missions_mission_type", f"mission_type IN ({_TIPOS_SQL})"),
    ("ck_missions_plano_do_tipo", "(mission_type = 'avulsa') = (plan_id IS NULL)"),
    ("ck_missions_dia_do_tipo", "(mission_type = 'diaria') = (day IS NOT NULL)"),
    ("ck_missions_prazo_do_tipo", "(mission_type = 'avulsa') = (deadline IS NOT NULL)"),
    (
        "ck_missions_dificuldade_da_especial",
        "mission_type <> 'especial' OR difficulty = 5",
    ),
    (
        "ck_missions_estimativa_do_ciclo",
        "mission_type = 'avulsa' OR estimated_minutes <= 1440",
    ),
)


def upgrade() -> None:
    op.create_table(
        "weekly_plans",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("week_start", sa.Date, nullable=False),
        # Sem server_default: o instante vem do relogio injetavel, porque e
        # entrada da regra `fora_do_plano` (decisao P4 do plano do B).
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "user_id", "week_start", name="uq_weekly_plans_user_id_week_start"
        ),
        # Alvo da FK composta de `missions`: sem ele, o PostgreSQL recusa uma
        # FK para (id, user_id), que nao seria unico por si.
        sa.UniqueConstraint("id", "user_id", name="uq_weekly_plans_id_user_id"),
        sa.CheckConstraint(
            "EXTRACT(ISODOW FROM week_start) = 1",
            name="ck_weekly_plans_week_start_segunda",
        ),
    )

    # As missoes que ja existem sao do 1a: viram `avulsa`. O server_default so
    # serve ao preenchimento e sai em seguida -- quem cria missao passa o tipo.
    op.add_column(
        "missions",
        sa.Column("mission_type", sa.Text, nullable=False, server_default="avulsa"),
    )
    op.alter_column("missions", "mission_type", server_default=None)
    op.add_column("missions", sa.Column("plan_id", sa.Integer, nullable=True))
    op.add_column("missions", sa.Column("day", sa.Date, nullable=True))
    # O prazo da diaria e da especial e derivado (C10), entao a coluna aceita
    # nulo -- e o CHECK `ck_missions_prazo_do_tipo` exige que so elas o usem.
    op.alter_column("missions", "deadline", nullable=True)

    # MATCH SIMPLE (o padrao): com `plan_id` nulo, a FK nao e verificada, e e
    # isso que deixa a avulsa passar. MATCH FULL recusaria toda avulsa.
    op.create_foreign_key(
        "fk_missions_plano_do_usuario",
        "missions",
        "weekly_plans",
        ["plan_id", "user_id"],
        ["id", "user_id"],
    )
    for nome, condicao in CHECKS:
        op.create_check_constraint(nome, "missions", condicao)
    # Nulos nao colidem: a especial (dia nulo) convive com esta restricao.
    op.create_unique_constraint(
        "uq_missions_plan_id_day", "missions", ["plan_id", "day"]
    )
    op.create_index(
        "uq_missions_especial_por_plano",
        "missions",
        ["plan_id"],
        unique=True,
        postgresql_where=sa.text("mission_type = 'especial'"),
    )


def downgrade() -> None:
    """Destrutivo por natureza: diaria e especial nao tem prazo gravado, e o
    esquema da 0002 exige um. Falha ALTO em vez de inventar prazo."""
    do_ciclo = (
        op.get_bind()
        .execute(
            sa.text("SELECT count(*) FROM missions WHERE mission_type <> 'avulsa'")
        )
        .scalar_one()
    )
    if do_ciclo:
        raise RuntimeError(
            f"downgrade da 0003 recusado: {do_ciclo} missao(oes) do ciclo "
            "(diaria ou especial) nao cabem no esquema da 0002, que exige prazo; "
            "apague-as de proposito antes de voltar"
        )
    op.drop_index("uq_missions_especial_por_plano", table_name="missions")
    op.drop_constraint("uq_missions_plan_id_day", "missions", type_="unique")
    for nome, _ in reversed(CHECKS):
        op.drop_constraint(nome, "missions", type_="check")
    op.drop_constraint("fk_missions_plano_do_usuario", "missions", type_="foreignkey")
    op.alter_column("missions", "deadline", nullable=False)
    op.drop_column("missions", "day")
    op.drop_column("missions", "plan_id")
    op.drop_column("missions", "mission_type")
    op.drop_table("weekly_plans")
