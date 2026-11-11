"""Mapeamento SQLAlchemy da progressao: o livro-razao e as conquistas (D2, D5)."""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    Text,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import Mapped, mapped_column

from focusquest.core.base import Base
from focusquest.modules.progression.domain import Codigo

# A fonte de XP do D. O E trouxe a segunda (o bonus da avaliacao), e a
# unicidade passou a ser (mission_id, source) -- spec, "Modelo de dados".
FONTE_CONCLUSAO = "mission_completed"
FONTE_BONUS = "evaluation_bonus"

# Tolerant reader da 0008 (expand): o codigo antigo ainda cabe no CHECK e,
# lido, vira o membro novo. Sai na Tarefa 2.2, junto com o valor antigo do
# CHECK. O dominio nunca escreve o codigo antigo.
_CODIGOS_ANTIGOS: dict[str, Codigo] = {"tifa_partnership": Codigo.KAIRYA_PARTNERSHIP}
_CODIGOS_SQL = ", ".join(f"'{codigo}'" for codigo in (*Codigo, *_CODIGOS_ANTIGOS))


class CodigoText(TypeDecorator[Codigo]):
    """TEXT no banco, Codigo no Python, com o codigo antigo ja normalizado.

    Restricao ate a Tarefa 2.2: `code` e coluna da PK, e uma linha antiga
    carregada como entidade ganha a identidade do codigo NOVO. Um UPDATE ou
    DELETE dela pelo ORM filtraria pelo codigo novo, afetaria 0 linhas e daria
    `StaleDataError`. Nao altere nem remova `UserAchievement` pelo ORM: hoje o
    servico so seleciona colunas, e a remocao vem por cascata no banco.
    """

    impl = Text
    cache_ok = True

    def process_result_value(self, value: Any, dialect: Dialect) -> Codigo | None:
        # A PK nunca e NULL, mas o LEFT JOIN de `ler_progresso` traz NULL
        # na linha de quem ainda nao tem conquista.
        if value is None:
            return None
        return _CODIGOS_ANTIGOS.get(value) or Codigo(value)


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
        UniqueConstraint(
            "mission_id", "source", name="uq_xp_entries_mission_id_source"
        ),
        CheckConstraint("amount > 0", name="ck_xp_entries_amount"),
        CheckConstraint(
            f"source IN ('{FONTE_CONCLUSAO}', '{FONTE_BONUS}')",
            name="ck_xp_entries_source",
        ),
        Index("ix_xp_entries_user_id_id", "user_id", "id"),
    )


class UserAchievement(Base):
    """Uma conquista destravada, com o lancamento que a destravou (D6)."""

    __tablename__ = "user_achievements"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    code: Mapped[Codigo] = mapped_column(CodigoText)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    xp_entry_id: Mapped[int] = mapped_column(
        ForeignKey("xp_entries.id", ondelete="CASCADE")
    )

    __table_args__ = (
        PrimaryKeyConstraint("user_id", "code", name="pk_user_achievements"),
        CheckConstraint(f"code IN ({_CODIGOS_SQL})", name="ck_user_achievements_code"),
        Index("ix_user_achievements_xp_entry_id", "xp_entry_id"),
    )
