"""Os contratos da avaliacao: a saida do modelo e a resposta da API."""

from pydantic import BaseModel, ConfigDict, Field

from focusquest.modules.missions.domain import Veredito
from focusquest.modules.missions.schemas import (
    TAMANHO_MAXIMO_DO_FEEDBACK,
    EvaluationSummaryRead,
)
from focusquest.modules.progression.schemas import RewardRead


class EvaluationOutput(BaseModel):
    """A entrada da ferramenta `record_evaluation`, validada antes de gravar.

    E o esquema publicado ao modelo (`rubric.FERRAMENTA_DA_AVALIACAO`) e a
    guarda da saida dele: o que nao cabe aqui vira `avaliacao_invalida` (E6).
    `extra="forbid"`: um campo a mais (um `bonus`, um `xp`) nao e ignorado em
    silencio, recusa a saida inteira.
    """

    model_config = ConfigDict(extra="forbid")

    verdict: Veredito
    feedback: str = Field(min_length=1, max_length=TAMANHO_MAXIMO_DO_FEEDBACK)


class EvaluationResultRead(BaseModel):
    """A resposta de `POST /api/missions/{id}/evaluation`: o resumo da
    avaliacao e o bonus reconstruido do livro-razao, ou `None` sem bonus."""

    evaluation: EvaluationSummaryRead
    reward: RewardRead | None
