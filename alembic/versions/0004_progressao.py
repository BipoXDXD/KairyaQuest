"""Progressao: o livro-razao de XP e as conquistas, com o retroativo.

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from zoneinfo import ZoneInfo

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# ---------------------------------------------------------------------------
# Copias CONGELADAS, NAO import (D8; ver 0001 e 0003): migracao e historico.
# Elas descrevem a regra de 2026-09-25. O teste de equivalencia da migracao
# amarra estas copias a regra viva DAQUELE dia; depois dele, divergir e
# permitido e nao reescreve o passado.
# ---------------------------------------------------------------------------
FONTE = "mission_completed"
CODIGOS = (
    "first_steps",
    "streak_7",
    "streak_30",
    "veteran_10",
    "veteran_50",
    "veteran_100",
    "tifa_partnership",
)
_CODIGOS_SQL = ", ".join(f"'{codigo}'" for codigo in CODIGOS)
FUSO_DO_CICLO = ZoneInfo("America/Sao_Paulo")
_UM_DIA = timedelta(days=1)


def _xp(tipo: str, dificuldade: int) -> int:
    xp = 20 + 10 * dificuldade * (dificuldade - 1)
    return xp * 3 if tipo == "especial" else xp


@dataclass
class _Dia:
    concluida: bool
    plano_criado_em: date


def _sequencia_ate(historico: dict[date, _Dia], dia: date) -> int:
    if not historico:
        return 0
    primeiro = min(historico)
    contagem = 0
    while dia >= primeiro:
        estado = historico.get(dia)
        if estado is not None and dia >= estado.plano_criado_em:
            if not estado.concluida:
                break
            contagem += 1
        dia -= _UM_DIA
    return contagem


def _maior_sequencia(historico: dict[date, _Dia]) -> int:
    return max((_sequencia_ate(historico, dia) for dia in historico), default=0)


def _satisfeitas(concluidas: int, maior: int, tifa: bool) -> set[str]:
    regras = {
        "first_steps": concluidas >= 1,
        "streak_7": maior >= 7,
        "streak_30": maior >= 30,
        "veteran_10": concluidas >= 10,
        "veteran_50": concluidas >= 50,
        "veteran_100": concluidas >= 100,
        "tifa_partnership": tifa,
    }
    return {codigo for codigo, vale in regras.items() if vale}


@dataclass
class _Estado:
    historico: dict[date, _Dia]
    concluidas: int = 0
    tifa: bool = False


def upgrade() -> None:
    op.create_table(
        "xp_entries",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "mission_id",
            sa.Integer,
            sa.ForeignKey("missions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("source", sa.Text, nullable=False),
        sa.Column("credited_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("mission_id", name="uq_xp_entries_mission_id"),
        sa.CheckConstraint("amount > 0", name="ck_xp_entries_amount"),
        sa.CheckConstraint(f"source IN ('{FONTE}')", name="ck_xp_entries_source"),
    )
    op.create_index("ix_xp_entries_user_id_id", "xp_entries", ["user_id", "id"])
    op.create_table(
        "user_achievements",
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.Text, nullable=False),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "xp_entry_id",
            sa.Integer,
            sa.ForeignKey("xp_entries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("user_id", "code", name="pk_user_achievements"),
        sa.CheckConstraint(
            f"code IN ({_CODIGOS_SQL})", name="ck_user_achievements_code"
        ),
    )
    op.create_index(
        "ix_user_achievements_xp_entry_id", "user_achievements", ["xp_entry_id"]
    )
    _backfill(op.get_bind())


def _backfill(conexao: sa.Connection) -> None:
    """D7: lanca o XP de toda missao ja concluida e destrava as conquistas
    na data em que a condicao valeu pela primeira vez."""
    da_tifa = set(
        conexao.execute(
            sa.text(
                "SELECT mission_id FROM tutor_actions "
                "WHERE kind = 'create_mission' AND state = 'executada' "
                "AND mission_id IS NOT NULL"
            )
        ).scalars()
    )
    estados: dict[int, _Estado] = {}
    dia_da_diaria: dict[int, date] = {}
    for user_id, mission_id, dia, criado_em in conexao.execute(
        sa.text(
            "SELECT m.user_id, m.id, m.day, p.created_at FROM missions m "
            "JOIN weekly_plans p ON p.id = m.plan_id WHERE m.mission_type = 'diaria'"
        )
    ):
        estado = estados.setdefault(user_id, _Estado(historico={}))
        estado.historico[dia] = _Dia(False, criado_em.astimezone(FUSO_DO_CICLO).date())
        dia_da_diaria[mission_id] = dia

    concluidas = conexao.execute(
        sa.text(
            "SELECT id, user_id, mission_type, difficulty, completed_at FROM missions "
            "WHERE state = 'concluida' ORDER BY completed_at, id"
        )
    ).all()
    destravadas: dict[int, set[str]] = {}
    for mission_id, user_id, tipo, dificuldade, completed_at in concluidas:
        if completed_at is None:
            raise RuntimeError(
                f"missao {mission_id} concluida sem completed_at: "
                "o backfill nao inventa data"
            )
        entrada = conexao.execute(
            sa.text(
                "INSERT INTO xp_entries (user_id, mission_id, amount, source, "
                "credited_at) VALUES (:u, :m, :a, :s, :c) RETURNING id"
            ),
            {
                "u": user_id,
                "m": mission_id,
                "a": _xp(tipo, dificuldade),
                "s": FONTE,
                "c": completed_at,
            },
        ).scalar_one()
        estado = estados.setdefault(user_id, _Estado(historico={}))
        if mission_id in dia_da_diaria:
            estado.historico[dia_da_diaria[mission_id]].concluida = True
        estado.concluidas += 1
        estado.tifa = estado.tifa or mission_id in da_tifa
        ja = destravadas.setdefault(user_id, set())
        novas = (
            _satisfeitas(
                estado.concluidas, _maior_sequencia(estado.historico), estado.tifa
            )
            - ja
        )
        for codigo in sorted(novas, key=CODIGOS.index):
            conexao.execute(
                sa.text(
                    "INSERT INTO user_achievements (user_id, code, unlocked_at, "
                    "xp_entry_id) VALUES (:u, :c, :t, :e)"
                ),
                {"u": user_id, "c": codigo, "t": completed_at, "e": entrada},
            )
        ja |= novas


def downgrade() -> None:
    op.drop_table("user_achievements")
    op.drop_table("xp_entries")
