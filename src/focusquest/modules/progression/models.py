"""Mapeamento SQLAlchemy da progressao: o livro-razao e as conquistas (D2, D5)."""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from focusquest.core.base import Base
from focusquest.modules.progression.domain import Codigo

# A unica fonte de XP do D. O E acrescenta outras, e a unicidade passa a ser
# (mission_id, source) -- registrado na spec, "Modelo de dados".
FONTE_CONCLUSAO = "mission_completed"

_CODIGOS_SQL = ", ".join(f"'{codigo.value}'" for codigo in Codigo)


class XpEntry(Base):
    """Um lancamento de XP: o valor CONGELADO no instante do credito."""

    __tablename__ = "xp_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    mission_id: Mapped[int] = mapped_column(
        ForeignKey("missions.id", ondelete="CASCADE")
    )
    amount: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(Text)
    credited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("mission_id", name="uq_xp_entries_mission_id"),
        CheckConstraint("amount > 0", name="ck_xp_entries_amount"),
        CheckConstraint(
            f"source IN ('{FONTE_CONCLUSAO}')", name="ck_xp_entries_source"
        ),
        Index("ix_xp_entries_user_id_id", "user_id", "id"),
    )


class UserAchievement(Base):
    """Uma conquista destravada, com o lancamento que a destravou (D6)."""

    __tablename__ = "user_achievements"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(Text)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    xp_entry_id: Mapped[int] = mapped_column(
        ForeignKey("xp_entries.id", ondelete="CASCADE")
    )

    __table_args__ = (
        PrimaryKeyConstraint("user_id", "code", name="pk_user_achievements"),
        CheckConstraint(f"code IN ({_CODIGOS_SQL})", name="ck_user_achievements_code"),
        Index("ix_user_achievements_xp_entry_id", "xp_entry_id"),
    )
