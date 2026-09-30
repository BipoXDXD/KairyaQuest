"""Contratos de entrada e saida da tutoria. Chaves em ingles: sao contrato."""

from datetime import datetime
from typing import Annotated, Any

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictInt,
    StringConstraints,
)

from focusquest.modules.missions.domain import MotivoDoReagendamento
from focusquest.modules.missions.schemas import (
    MAIOR_INTEIRO_DA_COLUNA,
    TAMANHO_MAXIMO_DO_IDENTIFICADOR,
    MissionRead,
    PrazoComFuso,
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

# Os campos do retrato de um reagendamento (F16): quem os escreve e o backend,
# a partir da missao, nunca o modelo.
CAMPOS_DO_RETRATO = ("instructions", "previous_deadline")


def _prazo_em_texto(valor: object) -> object:
    """Aceita so texto ISO 8601 (ou o `datetime` que o proprio backend monta).

    No modo lax o Pydantic le como tempo Unix tanto o NUMERO `1790000000`
    (M10 da revisao da T6) quanto o TEXTO `"1790000000"` ou `"20261005"` (I1
    da revisao da T7): um instante UTC que o modelo nao quis dizer. Por isso o
    texto e convertido AQUI, por `datetime.fromisoformat`, e o Pydantic recebe
    um `datetime` pronto -- a leitura lax de texto nunca roda. Sem fuso, quem
    recusa depois e o `AwareDatetime`."""
    if isinstance(valor, datetime):
        return valor
    if not isinstance(valor, str):
        raise ValueError("o prazo precisa ser um texto ISO 8601 com fuso")
    try:
        return datetime.fromisoformat(valor)
    except ValueError as exc:
        raise ValueError("o prazo precisa ser um texto ISO 8601 com fuso") from exc


class RescheduleProposal(BaseModel):
    """A entrada de `reschedule_mission`, como o modelo a manda.

    O retrato (`CAMPOS_DO_RETRATO`) e escrito pelo backend, nunca pelo modelo
    (F16) -- por isso `extra='forbid'`: um campo a mais e proposta invalida.

    Sem coercao (M10 da revisao da T6): `mission_id: true` viraria a missao #1
    e `"12"` ou `12.0` viraria 12 -- o cartao mostraria uma missao que o
    modelo nao escolheu. `StrictInt` recusa os tres; o prazo so em texto.
    """

    model_config = ConfigDict(extra="forbid")

    mission_id: StrictInt = Field(ge=1, le=MAIOR_INTEIRO_DA_COLUNA)
    new_deadline: Annotated[PrazoComFuso, BeforeValidator(_prazo_em_texto)]
    reason: MotivoDoReagendamento


class RetratoDoReagendamento(BaseModel):
    """O retrato que o backend grava ao lado da entrada do modelo (F16): o que
    a missao era quando a Tifa propos. E o que o cartao mostra ("de ... para
    ..."), sem a feature `tutoring` do frontend importar `missions`. Os campos
    sao exatamente `CAMPOS_DO_RETRATO` (um teste confere)."""

    instructions: str
    previous_deadline: datetime


class MessageCreate(BaseModel):
    client_message_id: Annotated[
        str, StringConstraints(min_length=1, max_length=TAMANHO_MAXIMO_DO_IDENTIFICADOR)
    ]
    # `strip_whitespace`: uma pergunta so de espacos e uma pergunta vazia.
    content: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=TAMANHO_MAXIMO_DA_PERGUNTA
        ),
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
    operation_id: str = Field(min_length=1, max_length=TAMANHO_MAXIMO_DO_IDENTIFICADOR)


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
