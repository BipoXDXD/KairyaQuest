"""Os contratos da avaliacao: a saida do modelo e a resposta da API."""

from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints

from focusquest.modules.missions.domain import Veredito
from focusquest.modules.missions.schemas import (
    TAMANHO_MAXIMO_DO_FEEDBACK,
    EvaluationSummaryRead,
)
from focusquest.modules.progression.schemas import RewardRead


def _sem_nul(texto: str) -> str:
    """O PostgreSQL nao grava NUL em `TEXT` (`DataError` no flush, medido): a
    saida com NUL seria aceita aqui e quebraria DEPOIS da chamada ao modelo,
    deixando a avaliacao presa em `avaliando` e respondendo 500. Recusada
    aqui, ela vira `avaliacao_invalida` gravada, como qualquer saida fora do
    esquema. Validador, e nao `pattern`: o esquema publicado ao modelo nao
    muda (a ferramenta estrita da API nao garante `pattern`)."""
    if "\x00" in texto:
        raise ValueError("o comentario nao pode conter NUL")
    return texto


# Os limites do CHECK `ck_mission_evaluations_feedback` (1 a 1500), sobre o
# texto APARADO -- o que se grava. Um comentario so de espacos nao e comentario.
Comentario = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=TAMANHO_MAXIMO_DO_FEEDBACK
    ),
    AfterValidator(_sem_nul),
]


class EvaluationOutput(BaseModel):
    """A entrada da ferramenta `record_evaluation`, validada antes de gravar.

    E o esquema publicado ao modelo (`rubric.FERRAMENTA_DA_AVALIACAO`) e a
    guarda da saida dele: o que nao cabe aqui vira `avaliacao_invalida` (E6).
    `extra="forbid"`: um campo a mais (um `bonus`, um `xp`) nao e ignorado em
    silencio, recusa a saida inteira. Toda regra que o banco imporia na
    gravacao esta aqui, ANTES dela: um erro do banco depois da chamada ao
    modelo deixaria a tentativa presa em `avaliando`.
    """

    model_config = ConfigDict(extra="forbid")

    verdict: Veredito
    feedback: Comentario


class EvaluationResultRead(BaseModel):
    """A resposta de `POST /api/missions/{id}/evaluation`: o resumo da
    avaliacao e o bonus reconstruido do livro-razao, ou `None` sem bonus."""

    evaluation: EvaluationSummaryRead
    reward: RewardRead | None
