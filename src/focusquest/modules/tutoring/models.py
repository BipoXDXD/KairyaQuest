"""Mapeamento SQLAlchemy da conversa e das acoes propostas."""

from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Dialect,
    ForeignKey,
    Index,
    Integer,
    Text,
    TypeDecorator,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from focusquest.core.base import Base
from focusquest.modules.tutoring.domain import (
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)


class TextoDeEnum[E: StrEnum](TypeDecorator[E]):
    """TEXT no banco, o StrEnum no Python -- nos dois sentidos.

    O mesmo motivo do `MissionStateText`: sem converter na VOLTA, o banco
    devolve str crua e `is` passa a ser falso. Generico porque a tutoria tem
    quatro enums; o atributo se chama `enum`, igual ao parametro, porque e
    por esse nome que o SQLAlchemy monta a chave de cache (`cache_ok`).
    """

    impl = Text
    cache_ok = True

    def __init__(self, enum: type[E]) -> None:
        super().__init__()
        self.enum = enum

    def process_result_value(self, value: Any, dialect: Dialect) -> E:
        return self.enum(value)


def _lista_sql(enum: type[StrEnum]) -> str:
    """O modelo DESCREVE a tabela de hoje e por isso deriva dos enums; a
    migracao congela os valores (ver `0002_tutoria.py`)."""
    return ", ".join(f"'{membro.value}'" for membro in enum)


class TutorMessage(Base):
    __tablename__ = "tutor_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )
    role: Mapped[Papel] = mapped_column(TextoDeEnum(Papel))
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[StatusDaMensagem] = mapped_column(TextoDeEnum(StatusDaMensagem))
    client_message_id: Mapped[str | None] = mapped_column(Text, default=None)
    reply_to_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tutor_messages.id", ondelete="CASCADE"), default=None
    )
    error_code: Mapped[str | None] = mapped_column(Text, default=None)
    # O modelo substituto que serviu a resposta depois de uma recusa (fallback
    # do servidor, pendencia 174); nulo quando foi o modelo pedido.
    fallback_model: Mapped[str | None] = mapped_column(Text, default=None)
    # Sem `server_default`: aqui o instante e ENTRADA da regra do orfao, e vem
    # do relogio injetavel, como toda hora que decide alguma coisa.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    actions: Mapped[list[TutorAction]] = relationship(
        order_by="TutorAction.id", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint(
            f"role IN ({_lista_sql(Papel)})", name="ck_tutor_messages_role"
        ),
        CheckConstraint(
            f"status IN ({_lista_sql(StatusDaMensagem)})",
            name="ck_tutor_messages_status",
        ),
        # A legalidade do valor de `role` e responsabilidade exclusiva de
        # `ck_tutor_messages_role`; esta restricao so descreve a FORMA dada
        # um papel valido, por isso o ELSE TRUE. Uma versao que repetisse
        # "role = 'user' OR role = 'tutor'" aqui tornaria um `role` invalido
        # uma violacao DUPLA -- e o PostgreSQL relata so uma (por nome de
        # restricao, em ordem alfabetica: 'forma' vem antes de 'role'), entao
        # um INSERT com `role` invalido seria recusado com o motivo errado.
        CheckConstraint(
            "CASE role "
            "WHEN 'user' THEN client_message_id IS NOT NULL "
            "AND reply_to_id IS NULL AND status = 'completa' "
            "WHEN 'tutor' THEN client_message_id IS NULL "
            "AND reply_to_id IS NOT NULL "
            "ELSE true END",
            name="ck_tutor_messages_forma",
        ),
        CheckConstraint(
            "fallback_model IS NULL OR role = 'tutor'",
            name="ck_tutor_messages_fallback_so_da_tutora",
        ),
        UniqueConstraint(
            "client_message_id", name="uq_tutor_messages_client_message_id"
        ),
        Index(
            "uq_tutor_messages_uma_completa_por_pergunta",
            "reply_to_id",
            unique=True,
            postgresql_where=text("status = 'completa'"),
        ),
        Index(
            "uq_tutor_messages_uma_gerando_por_usuario",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'gerando'"),
        ),
        Index("ix_tutor_messages_user_id_id", "user_id", "id"),
    )


class TutorAction(Base):
    __tablename__ = "tutor_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tutor_messages.id", ondelete="CASCADE")
    )
    kind: Mapped[TipoDeAcao] = mapped_column(TextoDeEnum(TipoDeAcao))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    state: Mapped[EstadoDaAcao] = mapped_column(TextoDeEnum(EstadoDaAcao))
    # Sem `ondelete`: ver `test_missao_criada_por_acao_nao_pode_ser_apagada_por_baixo`.
    mission_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("missions.id"), default=None
    )
    operation_id: Mapped[str | None] = mapped_column(Text, default=None)
    error_code: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )

    __table_args__ = (
        CheckConstraint(
            f"kind IN ({_lista_sql(TipoDeAcao)})", name="ck_tutor_actions_kind"
        ),
        CheckConstraint(
            f"state IN ({_lista_sql(EstadoDaAcao)})", name="ck_tutor_actions_state"
        ),
        CheckConstraint(
            "(state = 'executada') = (mission_id IS NOT NULL)",
            name="ck_tutor_actions_missao_so_quando_executada",
        ),
        CheckConstraint(
            "(state = 'proposta') = (decided_at IS NULL)",
            name="ck_tutor_actions_decisao_datada",
        ),
        UniqueConstraint("operation_id", name="uq_tutor_actions_operation_id"),
        Index("ix_tutor_actions_message_id", "message_id"),
    )
