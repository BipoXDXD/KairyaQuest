"""Mapeamento SQLAlchemy do usuario."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from focusquest.core.base import Base
from focusquest.core.idioma import Idioma

# O modelo DESCREVE a tabela de hoje, e por isso deriva do enum; o CHECK
# `ck_users_locale` que vive no banco so muda por migracao escrita a mao
# (migracao 0009).
_IDIOMAS_SQL = ", ".join(f"'{idioma.value}'" for idioma in Idioma)


class User(Base):
    """Usuario dono das missoes.

    O usuario unico e DECLARADO e semeado pela migracao (README s8); nao ha
    autenticacao. As tabelas dos outros modulos apontam para `users.id`, e
    quem as mapeia importa este modulo para que o alvo da chave estrangeira
    esteja registrado em `Base.metadata`.

    `locale` e `NULL` enquanto o usuario nunca escolheu (migracao 0009). O
    fallback para `pt-BR` mora em `users.service.ler_idioma`, e so la.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    display_name: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    locale: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint(f"locale IN ({_IDIOMAS_SQL})", name="ck_users_locale"),
    )
