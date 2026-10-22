"""Ferramentas de proposta compartilhadas pelos adaptadores, sem SDK."""

from typing import Any

from focusquest.modules.missions.schemas import MissionCreate
from focusquest.modules.tutoring.schemas import RescheduleProposal

DESCRICAO_DA_FERRAMENTA = (
    "Propõe uma missão de estudo. NÃO cria nada: a pessoa vê a proposta num "
    "cartão e decide se confirma ou recusa. Use no máximo uma vez por "
    "resposta. O prazo (deadline) é um instante ISO 8601 com fuso horário, "
    "no futuro."
)

DESCRICAO_DO_REAGENDAMENTO = (
    "Propõe mudar o prazo de UMA missão avulsa ainda não concluída da lista do "
    "contexto (pelo número #id dela). NÃO muda "
    "nada: a pessoa vê a proposta num cartão e decide se confirma ou recusa. "
    "Use só depois de conversar o motivo, e no máximo uma proposta por resposta. "
    "O novo prazo (new_deadline) é um instante ISO 8601 com fuso horário, no futuro."
)


def esquema_da_proposta() -> dict[str, Any]:
    """O `input_schema` da ferramenta, gerado do MESMO `MissionCreate` do
    `POST /api/missions`, para os dois contratos nao divergirem.

    O `description` do topo e a docstring de manutencao do schema:
    fala de 422 e de defeitos medidos, e nao serve ao modelo. A descricao
    para o modelo e `DESCRICAO_DA_FERRAMENTA`.
    """
    esquema = MissionCreate.model_json_schema()
    esquema.pop("description", None)
    esquema.pop("title", None)
    return esquema


def esquema_do_reagendamento() -> dict[str, Any]:
    """O `input_schema` de `reschedule_mission`, gerado do `RescheduleProposal`
    (a tecnica de `esquema_da_proposta`)."""
    esquema = RescheduleProposal.model_json_schema()
    esquema.pop("description", None)
    esquema.pop("title", None)
    # A docstring do enum tambem vai para o `$defs`; e de manutencao.
    for definicao in esquema.get("$defs", {}).values():
        definicao.pop("description", None)
    return esquema
