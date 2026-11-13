"""Mapeamento SQLAlchemy da missao."""

from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Dialect,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Text,
    TypeDecorator,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

# Importado pelo efeito colateral de registrar `users` no `Base.metadata`: as
# tabelas daqui apontam para `users.id`, e sem o alvo registrado a
# configuracao dos mappers levanta NoReferencedTableError no primeiro uso.
import focusquest.modules.users.models  # noqa: F401
from focusquest.core.base import Base
from focusquest.core.texto_de_enum import TextoDeEnum
from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    FalhaDaAvaliacao,
    MissionState,
    MissionType,
    MotivoDoReagendamento,
    OrigemDoReagendamento,
    TipoDeOperacao,
    Veredito,
)

# Ao contrario da migracao -- que congelou a lista de estados de proposito,
# porque migracao e historico --, o modelo DESCREVE a tabela de hoje, e por
# isso deriva do enum. A consequencia a ter em mente: no dia em que
# MissionState ganhar um quarto estado, esta linha acompanha sozinha, mas o
# CHECK que vive no banco so muda por migracao escrita a mao. Quem esquecer a
# migracao vai ver o PostgreSQL recusar o estado novo -- falha alta, e no
# lugar certo, porque o modelo nao cria esquema nenhum.
_ESTADOS_SQL = ", ".join(f"'{estado.value}'" for estado in MissionState)

# Mesmo motivo de _ESTADOS_SQL: o modelo DESCREVE a tabela de hoje, e por isso
# deriva do enum -- o CHECK que vive no banco so muda por migracao a mao.
_TIPOS_SQL = ", ".join(f"'{tipo.value}'" for tipo in MissionType)

# Mesmo motivo de _ESTADOS_SQL para os tres enums da avaliacao: o modelo
# deriva do enum, e o CHECK do banco so muda por migracao escrita a mao.
_ESTADOS_DA_AVALIACAO_SQL = ", ".join(f"'{e.value}'" for e in EstadoDaAvaliacao)
_VEREDITOS_SQL = ", ".join(f"'{v.value}'" for v in Veredito)
_FALHAS_SQL = ", ".join(f"'{f.value}'" for f in FalhaDaAvaliacao)

# Mesmo motivo, para o historico de reagendamentos e o `kind` das operacoes.
_MOTIVOS_SQL = ", ".join(f"'{m.value}'" for m in MotivoDoReagendamento)

# Tolerant reader da 0008 (expand): o valor antigo da origem ainda cabe no
# CHECK e, lido, vira o membro novo. Sai na Tarefa 2.2, junto com o valor
# antigo do CHECK. O dominio nunca escreve o valor antigo.
_ORIGENS_ANTIGAS: dict[str, OrigemDoReagendamento] = {
    "tifa": OrigemDoReagendamento.KAIRYA,
}
_ORIGENS_SQL = ", ".join(f"'{o}'" for o in (*OrigemDoReagendamento, *_ORIGENS_ANTIGAS))
_TIPOS_DE_OPERACAO_SQL = ", ".join(f"'{t.value}'" for t in TipoDeOperacao)


class OrigemDoReagendamentoText(TypeDecorator[OrigemDoReagendamento]):
    """TEXT no banco, OrigemDoReagendamento no Python (como `TextoDeEnum`)."""

    impl = Text
    cache_ok = True

    def process_result_value(
        self, value: Any, dialect: Dialect
    ) -> OrigemDoReagendamento:
        # Sem tratar None, como o `TextoDeEnum` de coluna obrigatoria: a coluna
        # e NOT NULL e nenhuma leitura passa por outer join; um NULL aqui e
        # divergencia de esquema.
        return _ORIGENS_ANTIGAS.get(value) or OrigemDoReagendamento(value)


class WeeklyPlan(Base):
    """O plano de uma semana: 7 diarias e 1 especial (spec, C3).

    Que o plano tem os 7 dias, e que o dia de cada diaria cai na semana dele,
    e garantido SO pelo servico (`cycle_service.criar_plano`), e esta
    declarado assim na spec: nenhuma restricao do banco o expressa.
    """

    __tablename__ = "weekly_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )
    week_start: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint(
            "user_id", "week_start", name="uq_weekly_plans_user_id_week_start"
        ),
        UniqueConstraint("id", "user_id", name="uq_weekly_plans_id_user_id"),
        CheckConstraint(
            "EXTRACT(ISODOW FROM week_start) = 1",
            name="ck_weekly_plans_week_start_segunda",
        ),
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
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # O tipo e passado por quem cria (sem default no modelo nem no banco),
    # pelo mesmo motivo do `state` explicito em `criar_missao`.
    mission_type: Mapped[MissionType] = mapped_column(TextoDeEnum(MissionType))
    plan_id: Mapped[int | None] = mapped_column(Integer, default=None)
    day: Mapped[date | None] = mapped_column(Date, default=None)
    # O estado e texto no banco (TEXT + CHECK) e StrEnum no Python.
    state: Mapped[MissionState] = mapped_column(
        TextoDeEnum(MissionState), server_default=MissionState.PENDENTE.value
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

    # Um-para-um (PK/UNIQUE em mission_id). `lazy="select"` para a leitura de
    # UMA missao (conclusao, avaliacao), onde carregar sob demanda e o certo.
    # A listagem, que le as duas de todas as missoes, pede `selectinload` na
    # propria consulta (`listar_missoes`, pendencia 96).
    evidence: Mapped[MissionEvidence | None] = relationship(
        cascade="all, delete-orphan", lazy="select"
    )
    evaluation: Mapped[MissionEvaluation | None] = relationship(
        cascade="all, delete-orphan", lazy="select"
    )
    # Em ordem de gravacao (F12). `lazy="select"` pelo mesmo motivo da evidencia
    # e da avaliacao; a listagem pede `selectinload` (pendencia 96).
    reschedules: Mapped[list[MissionReschedule]] = relationship(
        order_by="MissionReschedule.id", cascade="all, delete-orphan", lazy="select"
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
        CheckConstraint(
            f"mission_type IN ({_TIPOS_SQL})", name="ck_missions_mission_type"
        ),
        CheckConstraint(
            "(mission_type = 'avulsa') = (plan_id IS NULL)",
            name="ck_missions_plano_do_tipo",
        ),
        CheckConstraint(
            "(mission_type = 'diaria') = (day IS NOT NULL)",
            name="ck_missions_dia_do_tipo",
        ),
        CheckConstraint(
            "(mission_type = 'avulsa') = (deadline IS NOT NULL)",
            name="ck_missions_prazo_do_tipo",
        ),
        CheckConstraint(
            "mission_type <> 'especial' OR difficulty = 5",
            name="ck_missions_dificuldade_da_especial",
        ),
        CheckConstraint(
            "mission_type = 'avulsa' OR estimated_minutes <= 1440",
            name="ck_missions_estimativa_do_ciclo",
        ),
        ForeignKeyConstraint(
            ["plan_id", "user_id"],
            ["weekly_plans.id", "weekly_plans.user_id"],
            name="fk_missions_plano_do_usuario",
        ),
        CheckConstraint(
            "state <> 'em_andamento' OR started_at IS NOT NULL",
            name="ck_missions_em_andamento_iniciada",
        ),
        CheckConstraint(
            "started_at IS NULL OR completed_at IS NULL OR started_at <= completed_at",
            name="ck_missions_inicio_antes_da_conclusao",
        ),
        UniqueConstraint("plan_id", "day", name="uq_missions_plan_id_day"),
        Index(
            "uq_missions_especial_por_plano",
            "plan_id",
            unique=True,
            postgresql_where=text("mission_type = 'especial'"),
        ),
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
        # Alvo da FK composta de `mission_reschedules` (pendencia 165): o
        # PostgreSQL exige um UNIQUE sobre exatamente as colunas referenciadas.
        UniqueConstraint(
            "operation_id", "mission_id", "kind", name="uq_mission_operations_vinculo"
        ),
        CheckConstraint(
            f"kind IN ({_TIPOS_DE_OPERACAO_SQL})", name="ck_mission_operations_kind"
        ),
    )


class MissionReschedule(Base):
    """Um reagendamento do prazo (F12). So de insercao: o servico nunca faz
    UPDATE nem DELETE aqui -- e o historico que nao se reescreve (README s8)."""

    __tablename__ = "mission_reschedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("missions.id", ondelete="CASCADE")
    )
    # A operacao que o gravou (F13): o reenvio acha a linha por aqui.
    operation_id: Mapped[str] = mapped_column(Text)
    # Parte do elo composto: o banco so aceita a operacao DESTA missao e do tipo
    # `reschedule` (pendencia 165). O servico nunca precisa informa-lo.
    operation_kind: Mapped[str] = mapped_column(
        Text,
        default=TipoDeOperacao.REAGENDAMENTO.value,
        server_default=TipoDeOperacao.REAGENDAMENTO.value,
    )
    previous_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    new_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reason: Mapped[MotivoDoReagendamento] = mapped_column(
        TextoDeEnum(MotivoDoReagendamento)
    )
    origin: Mapped[OrigemDoReagendamento] = mapped_column(OrigemDoReagendamentoText)
    rescheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("operation_id", name="uq_mission_reschedules_operation_id"),
        ForeignKeyConstraint(
            ["operation_id", "mission_id", "operation_kind"],
            [
                "mission_operations.operation_id",
                "mission_operations.mission_id",
                "mission_operations.kind",
            ],
            name="fk_mission_reschedules_operacao",
            ondelete="CASCADE",
        ),
        CheckConstraint(
            f"operation_kind = '{TipoDeOperacao.REAGENDAMENTO.value}'",
            name="ck_mission_reschedules_operation_kind",
        ),
        CheckConstraint(
            f"reason IN ({_MOTIVOS_SQL})", name="ck_mission_reschedules_reason"
        ),
        CheckConstraint(
            f"origin IN ({_ORIGENS_SQL})", name="ck_mission_reschedules_origin"
        ),
        CheckConstraint(
            "new_deadline <> previous_deadline",
            name="ck_mission_reschedules_prazo_mudou",
        ),
        Index("ix_mission_reschedules_mission_id", "mission_id"),
    )


class MissionEvidence(Base):
    """A evidencia entregue ao concluir a missao (uma por missao)."""

    __tablename__ = "mission_evidence"

    mission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("missions.id", ondelete="CASCADE"), primary_key=True
    )
    text: Mapped[str] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(Text, default=None)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            "char_length(text) BETWEEN 1 AND 4000", name="ck_mission_evidence_text"
        ),
        CheckConstraint(
            "link IS NULL OR (link ~* '^https?://\\S+$' AND char_length(link) <= 2000)",
            name="ck_mission_evidence_link",
        ),
    )


class MissionEvaluation(Base):
    """A avaliacao da Kairya sobre a evidencia (uma por missao, E9)."""

    __tablename__ = "mission_evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("missions.id", ondelete="CASCADE")
    )
    state: Mapped[EstadoDaAvaliacao] = mapped_column(TextoDeEnum(EstadoDaAvaliacao))
    attempt: Mapped[int] = mapped_column(Integer)
    verdict: Mapped[Veredito | None] = mapped_column(
        TextoDeEnum(Veredito, anulavel=True), default=None
    )
    feedback: Mapped[str | None] = mapped_column(Text, default=None)
    error_code: Mapped[FalhaDaAvaliacao | None] = mapped_column(
        TextoDeEnum(FalhaDaAvaliacao, anulavel=True), default=None
    )
    model: Mapped[str] = mapped_column(Text)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )

    __table_args__ = (
        UniqueConstraint("mission_id", name="uq_mission_evaluations_mission_id"),
        CheckConstraint(
            f"state IN ({_ESTADOS_DA_AVALIACAO_SQL})",
            name="ck_mission_evaluations_state",
        ),
        CheckConstraint("attempt >= 1", name="ck_mission_evaluations_attempt"),
        CheckConstraint(
            f"verdict IN ({_VEREDITOS_SQL})", name="ck_mission_evaluations_verdict"
        ),
        CheckConstraint(
            f"error_code IN ({_FALHAS_SQL})", name="ck_mission_evaluations_error_code"
        ),
        CheckConstraint(
            "char_length(feedback) BETWEEN 1 AND 1500",
            name="ck_mission_evaluations_feedback",
        ),
        CheckConstraint(
            "(state = 'concluida') = (verdict IS NOT NULL AND feedback IS NOT NULL)",
            name="ck_mission_evaluations_concluida_com_veredito",
        ),
        CheckConstraint(
            "(state = 'falhou') = (error_code IS NOT NULL)",
            name="ck_mission_evaluations_falha_com_codigo",
        ),
        CheckConstraint(
            "(state = 'avaliando') = (finished_at IS NULL)",
            name="ck_mission_evaluations_avaliando_sem_fim",
        ),
    )


class IdempotencyKey(Base):
    """A reserva de uma `Idempotency-Key` do POST /api/missions.

    `mission_id` so e NULL dentro da transacao que reserva: a linha nasce
    antes da missao (e a reserva que serializa os pedidos concorrentes) e
    recebe o id no mesmo `flush` da criacao. Nenhum commit sai com NULL.

    `created_at` vem do relogio injetado, e nao do `now()` do banco: aqui ele
    e regra (a validade de 24 h), nao auditoria.
    """

    __tablename__ = "idempotency_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )
    key: Mapped[UUID] = mapped_column(Uuid)
    request_fingerprint: Mapped[str] = mapped_column(Text)
    mission_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("missions.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_idempotency_keys_user_id_key"),
        CheckConstraint(
            "request_fingerprint ~ '^[0-9a-f]{64}$'",
            name="ck_idempotency_keys_request_fingerprint",
        ),
    )
