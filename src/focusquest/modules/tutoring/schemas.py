"""Contratos de entrada e saida da tutoria. Chaves em ingles: sao contrato."""

from datetime import datetime
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from focusquest.core.validation import TextoPersistivel, rejeitar_nul
from focusquest.modules.missions.schemas import (
    TAMANHO_MAXIMO_DO_IDENTIFICADOR,
    MissionRead,
)
from focusquest.modules.tutoring.domain import (
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)

# Teto TECNICO de custo: cada caractere vai ao modelo, e volta nos turnos
# seguintes como historico. O numero e provisorio e e decisao do dono
# (pendencia no HANDOFF), como os tetos de negocio da missao.
TAMANHO_MAXIMO_DA_PERGUNTA = 4000


class MessageCreate(BaseModel):
    # StringConstraints antes da guarda mantem os erros string_too_short/long.
    client_message_id: Annotated[
        str,
        StringConstraints(min_length=1, max_length=TAMANHO_MAXIMO_DO_IDENTIFICADOR),
        AfterValidator(rejeitar_nul),
    ]
    # `strip_whitespace`: uma pergunta so de espacos e uma pergunta vazia.
    # A guarda vem APOS StringConstraints para preservar trim antes dos
    # limites. Aninhar TextoPersistivel aqui muda essa ordem no Pydantic.
    content: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=TAMANHO_MAXIMO_DA_PERGUNTA
        ),
        AfterValidator(rejeitar_nul),
    ]


class ActionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: TipoDeAcao
    state: EstadoDaAcao
    payload: dict[str, Any]
    mission_id: int | None
    error_code: str | None


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: Papel
    content: str
    status: StatusDaMensagem
    client_message_id: str | None
    reply_to_id: int | None
    error_code: str | None
    created_at: datetime
    actions: list[ActionRead]


class ActionConfirm(BaseModel):
    operation_id: TextoPersistivel = Field(
        min_length=1, max_length=TAMANHO_MAXIMO_DO_IDENTIFICADOR
    )


class ConfirmRead(BaseModel):
    action: ActionRead
    mission: MissionRead


class RejectRead(BaseModel):
    action: ActionRead


class StatusRead(BaseModel):
    available: bool


class DeltaRead(BaseModel):
    text: str


class ErrorRead(BaseModel):
    code: str
