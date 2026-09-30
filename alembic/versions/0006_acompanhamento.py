"""Acompanhamento: o historico de reagendamentos e as regras do inicio.

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Copias CONGELADAS, NAO import (D8): migracao e historico.
MOTIVOS = ("dificuldade", "falta_de_tempo", "mudanca_de_prioridade")
ORIGENS = ("usuario", "tifa")
TIPOS_DE_OPERACAO = ("complete", "start", "reschedule")
TIPOS_DE_ACAO = ("create_mission", "reschedule_mission")
TIPOS_DE_ACAO_DA_0005 = ("create_mission",)


def _lista(valores: Sequence[str]) -> str:
    return ", ".join(f"'{v}'" for v in valores)


def upgrade() -> None:
    op.create_table(
        "mission_reschedules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "mission_id",
            sa.Integer,
            sa.ForeignKey("missions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "operation_id",
            sa.Text,
            sa.ForeignKey("mission_operations.operation_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("previous_deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("new_deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("origin", sa.Text, nullable=False),
        sa.Column("rescheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("operation_id", name="uq_mission_reschedules_operation_id"),
        sa.CheckConstraint(
            f"reason IN ({_lista(MOTIVOS)})", name="ck_mission_reschedules_reason"
        ),
        sa.CheckConstraint(
            f"origin IN ({_lista(ORIGENS)})", name="ck_mission_reschedules_origin"
        ),
        sa.CheckConstraint(
            "new_deadline <> previous_deadline",
            name="ck_mission_reschedules_prazo_mudou",
        ),
    )
    op.create_index(
        "ix_mission_reschedules_mission_id", "mission_reschedules", ["mission_id"]
    )
    op.create_check_constraint(
        "ck_mission_operations_kind",
        "mission_operations",
        f"kind IN ({_lista(TIPOS_DE_OPERACAO)})",
    )
    op.create_check_constraint(
        "ck_missions_em_andamento_iniciada",
        "missions",
        "state <> 'em_andamento' OR started_at IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_missions_inicio_antes_da_conclusao",
        "missions",
        "started_at IS NULL OR completed_at IS NULL OR started_at <= completed_at",
    )
    op.drop_constraint("ck_tutor_actions_kind", "tutor_actions", type_="check")
    op.create_check_constraint(
        "ck_tutor_actions_kind", "tutor_actions", f"kind IN ({_lista(TIPOS_DE_ACAO)})"
    )


def downgrade() -> None:
    conexao = op.get_bind()
    linhas = conexao.execute(
        sa.text("SELECT count(*) FROM mission_reschedules")
    ).scalar_one()
    if linhas:
        raise RuntimeError(
            f"{linhas} linha(s) em mission_reschedules: voltar para 0005 apagaria o "
            "historico de replanejamento; apague-as de proposito antes"
        )
    acoes = conexao.execute(
        sa.text("SELECT count(*) FROM tutor_actions WHERE kind = 'reschedule_mission'")
    ).scalar_one()
    if acoes:
        raise RuntimeError(
            f"{acoes} acao(oes) reschedule_mission gravada(s): o CHECK da 0005 as "
            "recusaria; apague-as de proposito antes de voltar"
        )
    op.drop_constraint("ck_tutor_actions_kind", "tutor_actions", type_="check")
    op.create_check_constraint(
        "ck_tutor_actions_kind",
        "tutor_actions",
        f"kind IN ({_lista(TIPOS_DE_ACAO_DA_0005)})",
    )
    op.drop_constraint(
        "ck_missions_inicio_antes_da_conclusao", "missions", type_="check"
    )
    op.drop_constraint("ck_missions_em_andamento_iniciada", "missions", type_="check")
    # As operacoes `start` e `reschedule` ficam: a 0005 nao restringe `kind`.
    op.drop_constraint(
        "ck_mission_operations_kind", "mission_operations", type_="check"
    )
    op.drop_index("ix_mission_reschedules_mission_id", table_name="mission_reschedules")
    op.drop_table("mission_reschedules")
