"""Mapeamento SQLAlchemy da missao."""

from datetime import datetime
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
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from focusquest.core.base import Base
from focusquest.modules.missions.domain import MissionState

# Ao contrario da migracao -- que congelou a lista de estados de proposito,
# porque migracao e historico --, o modelo DESCREVE a tabela de hoje, e por
# isso deriva do enum. A consequencia a ter em mente: no dia em que
# MissionState ganhar um quarto estado, esta linha acompanha sozinha, mas o
# CHECK que vive no banco so muda por migracao escrita a mao. Quem esquecer a
# migracao vai ver o PostgreSQL recusar o estado novo -- falha alta, e no
# lugar certo, porque o modelo nao cria esquema nenhum.
_ESTADOS_SQL = ", ".join(f"'{estado.value}'" for estado in MissionState)


class MissionStateText(TypeDecorator[MissionState]):
    """TEXT no banco, MissionState no Python.

    Sem este decorador a anotacao `Mapped[MissionState]` so valeria na IDA:
    MissionState e StrEnum, entao o driver grava 'pendente' sem ajuda
    nenhuma. E a VOLTA que quebra -- o PostgreSQL devolve uma str crua, e
    depois do primeiro refresh `missao.state is MissionState.PENDENTE` passa
    a ser falso enquanto `==` continua verdadeiro, justamente porque StrEnum
    compara igual a str. E o tipo de defeito que nao aparece em teste
    nenhum que use `==`, e que estoura em um `match` ou em um `is` meses
    depois.

    A alternativa seria `sa.Enum(MissionState, native_enum=False)`, que gera
    VARCHAR(n) com CHECK proprio -- e a migracao criou TEXT com um CHECK
    nomeado. Um TypeDecorator sobre Text converte sem mudar o tipo da coluna.
    """

    impl = Text
    cache_ok = True

    def process_result_value(self, value: Any, dialect: Dialect) -> MissionState:
        # Sem tratar None: a coluna e NOT NULL na migracao. Se um None
        # chegasse aqui, o esquema teria divergido do modelo, e o ValueError
        # de `MissionState(None)` e a reacao certa -- devolver None em
        # silencio esconderia a divergencia atras de um AttributeError em
        # outro lugar.
        return MissionState(value)


class User(Base):
    """Usuario dono das missoes.

    Nao faz parte do brief da tarefa, e existe por uma razao estrutural:
    `Mission.user_id` e `ForeignKey("users.id")`, e o SQLAlchemy resolve esse
    alvo procurando a tabela em `Base.metadata`. Sem `users` registrada, a
    configuracao dos mappers levanta NoReferencedTableError no primeiro uso
    de Mission -- o mapeamento inteiro nao carrega.

    Fica neste modulo, e nao em um `users` proprio, porque o incremento 1a
    nao tem modulo de usuario: o usuario unico e DECLARADO e semeado pela
    migracao (README s8). Declarar a tabela ao lado da chave estrangeira
    garante que quem importa o mapeamento da missao sempre tenha o alvo dela
    resolvido. Quando houver autenticacao, esta classe se muda para o modulo
    de usuario e `missions/models.py` passa a importa-la.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    display_name: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Mission(Base):
    __tablename__ = "missions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )
    instructions: Mapped[str] = mapped_column(Text)
    completion_criterion: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[int] = mapped_column(Integer)
    estimated_minutes: Mapped[int] = mapped_column(Integer)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # O estado e texto no banco (TEXT + CHECK) e StrEnum no Python.
    state: Mapped[MissionState] = mapped_column(
        MissionStateText, server_default=MissionState.PENDENTE.value
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # As restricoes sao repetidas aqui porque o modelo precisa DESCREVER a
    # tabela que a migracao criou, com os mesmos nomes. Nao e o modelo que
    # cria o esquema -- as migracoes criam --, mas um modelo que omite as
    # restricoes faz o proximo `alembic revision --autogenerate` propor
    # cria-las de novo, e ninguem le um autogenerate ruidoso com atencao.
    __table_args__ = (
        CheckConstraint(f"state IN ({_ESTADOS_SQL})", name="ck_missions_state"),
        CheckConstraint("difficulty >= 1", name="ck_missions_difficulty"),
        CheckConstraint("estimated_minutes > 0", name="ck_missions_estimated_minutes"),
        Index("ix_missions_user_id", "user_id"),
    )


class MissionOperation(Base):
    """Registro de uma operacao idempotente sobre uma missao."""

    __tablename__ = "mission_operations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    operation_id: Mapped[str] = mapped_column(Text)
    mission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("missions.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Nomeada, e nao `unique=True` na coluna: e o nome que a migracao deu, e e
    # por ele que um `DROP CONSTRAINT` futuro vai chamar a restricao.
    __table_args__ = (
        UniqueConstraint("operation_id", name="uq_mission_operations_operation_id"),
    )
