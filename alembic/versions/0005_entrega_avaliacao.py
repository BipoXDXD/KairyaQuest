"""Entrega com evidencia e avaliacao; a segunda fonte do livro-razao.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Copias CONGELADAS, NAO import (D8): migracao e historico.
FONTES = ("mission_completed", "evaluation_bonus")
ESTADOS = ("avaliando", "concluida", "falhou")
VEREDITOS = ("atende", "parcial", "nao_atende")
FALHAS = ("provedor_indisponivel", "tempo_esgotado", "avaliacao_invalida")


def _lista(valores: Sequence[str]) -> str:
    return ", ".join(f"'{v}'" for v in valores)


def upgrade() -> None:
    op.create_table(
        "mission_evidence",
        sa.Column(
            "mission_id",
            sa.Integer,
            sa.ForeignKey("missions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("link", sa.Text, nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "char_length(text) BETWEEN 1 AND 4000", name="ck_mission_evidence_text"
        ),
        sa.CheckConstraint(
            "link IS NULL OR (link ~* '^https?://' AND char_length(link) <= 2000)",
            name="ck_mission_evidence_link",
        ),
    )
    op.create_table(
        "mission_evaluations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "mission_id",
            sa.Integer,
            sa.ForeignKey("missions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("state", sa.Text, nullable=False),
        sa.Column("attempt", sa.Integer, nullable=False),
        sa.Column("verdict", sa.Text, nullable=True),
        sa.Column("feedback", sa.Text, nullable=True),
        sa.Column("error_code", sa.Text, nullable=True),
        sa.Column("model", sa.Text, nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("mission_id", name="uq_mission_evaluations_mission_id"),
        sa.CheckConstraint(
            f"state IN ({_lista(ESTADOS)})", name="ck_mission_evaluations_state"
        ),
        sa.CheckConstraint("attempt >= 1", name="ck_mission_evaluations_attempt"),
        sa.CheckConstraint(
            f"verdict IN ({_lista(VEREDITOS)})", name="ck_mission_evaluations_verdict"
        ),
        sa.CheckConstraint(
            f"error_code IN ({_lista(FALHAS)})",
            name="ck_mission_evaluations_error_code",
        ),
        sa.CheckConstraint(
            "char_length(feedback) BETWEEN 1 AND 1500",
            name="ck_mission_evaluations_feedback",
        ),
        sa.CheckConstraint(
            "(state = 'concluida') = (verdict IS NOT NULL AND feedback IS NOT NULL)",
            name="ck_mission_evaluations_concluida_com_veredito",
        ),
        sa.CheckConstraint(
            "(state = 'falhou') = (error_code IS NOT NULL)",
            name="ck_mission_evaluations_falha_com_codigo",
        ),
        sa.CheckConstraint(
            "(state = 'avaliando') = (finished_at IS NULL)",
            name="ck_mission_evaluations_avaliando_sem_fim",
        ),
    )
    op.drop_constraint("uq_xp_entries_mission_id", "xp_entries", type_="unique")
    op.create_unique_constraint(
        "uq_xp_entries_mission_id_source", "xp_entries", ["mission_id", "source"]
    )
    op.drop_constraint("ck_xp_entries_source", "xp_entries", type_="check")
    op.create_check_constraint(
        "ck_xp_entries_source", "xp_entries", f"source IN ({_lista(FONTES)})"
    )


def downgrade() -> None:
    bonus = (
        op.get_bind()
        .execute(
            sa.text("SELECT count(*) FROM xp_entries WHERE source = 'evaluation_bonus'")
        )
        .scalar_one()
    )
    if bonus:
        raise RuntimeError(
            f"{bonus} lancamento(s) evaluation_bonus gravado(s): a unicidade so por "
            "missao os recusaria; apague-os de proposito antes de voltar para 0004"
        )
    op.drop_constraint("ck_xp_entries_source", "xp_entries", type_="check")
    op.create_check_constraint(
        "ck_xp_entries_source", "xp_entries", "source IN ('mission_completed')"
    )
    op.drop_constraint("uq_xp_entries_mission_id_source", "xp_entries", type_="unique")
    op.create_unique_constraint(
        "uq_xp_entries_mission_id", "xp_entries", ["mission_id"]
    )
    op.drop_table("mission_evaluations")
    op.drop_table("mission_evidence")
