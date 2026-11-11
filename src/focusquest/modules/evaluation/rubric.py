"""O pedido de avaliacao ao modelo: o prompt versionado, a ferramenta e o turno.

O prompt mora em `prompts/rubric.<idioma>.md`, versionado como a persona
(README s5), e e texto de produto, um arquivo por idioma; o pacote instalado
o le por `importlib.resources` (`make check-wheel`). A evidencia vai como
DADO: um JSON na mensagem do usuario, nunca interpolado no prompt de sistema
(spec, "O pedido ao modelo").
"""

from collections.abc import Mapping
from functools import cache
from importlib.resources import files
from typing import Any

from focusquest.core.idioma import Idioma
from focusquest.core.prompts import carregar_prompts
from focusquest.modules.evaluation.schemas import EvaluationOutput
from focusquest.modules.missions.evaluation_records import Tentativa
from focusquest.modules.tutoring.provider import (
    Ferramenta,
    MensagemDoTurno,
    Turno,
    como_dado,
)

NOME_DA_FERRAMENTA = "record_evaluation"


@cache
def rubricas() -> Mapping[Idioma, str]:
    """A rubrica de todo idioma, lida e validada uma vez por processo.

    A partida do app chama esta funcao (`main._ciclo_de_vida`): uma rubrica
    ausente ou vazia derruba o boot. Sem isso, a falha so apareceria depois
    do commit da tentativa, e uma rubrica vazia sairia do `system` em
    silencio (o provedor descarta texto vazio).
    """
    return carregar_prompts(files(__package__) / "prompts", "rubric")


def rubrica_do_idioma(idioma: Idioma) -> str:
    """O prompt de sistema da avaliacao no idioma.

    Os vereditos (`atende`, `parcial`, `nao_atende`) e o nome da ferramenta
    aparecem literais nos dois arquivos: sao contrato, nao texto traduzivel.
    """
    return rubricas()[idioma]


DESCRICAO_DA_FERRAMENTA = (
    "Registra a avaliação da entrega: o veredito da rubrica (atende, parcial "
    "ou nao_atende) e um comentário curto para o estudante."
)


# O que a ferramenta estrita (`strict: true`, EM3) nao suporta num esquema:
# os limites de tamanho de string (referencia da API, "JSON Schema
# Limitations"). Saem do esquema publicado e continuam valendo no
# `EvaluationOutput`, que valida a saida antes de qualquer escrita.
_FORA_DO_ESTRITO = ("minLength", "maxLength")


def _sem_limites_de_string(no: Any) -> None:
    """Tira `_FORA_DO_ESTRITO` de todo no do esquema, em qualquer profundidade."""
    if isinstance(no, dict):
        for chave in _FORA_DO_ESTRITO:
            no.pop(chave, None)
        for valor in no.values():
            _sem_limites_de_string(valor)
    elif isinstance(no, list):
        for valor in no:
            _sem_limites_de_string(valor)


def _esquema_da_saida() -> dict[str, Any]:
    """O `input_schema` gerado do `EvaluationOutput`, pronto para a
    ferramenta estrita.

    A tecnica de `esquema_da_proposta`: a docstring do schema, e aqui
    tambem a do enum `Veredito` (que entra em `$defs`), e de manutencao e nao
    serve ao modelo. A descricao para o modelo e `DESCRICAO_DA_FERRAMENTA`.
    O `additionalProperties: false` que o modo estrito exige vem do
    `extra="forbid"` do schema; `enum` e `$ref` sao suportados.
    """
    esquema = EvaluationOutput.model_json_schema()
    esquema.pop("description", None)
    esquema.pop("title", None)
    for definicao in esquema["$defs"].values():
        definicao.pop("description", None)
    _sem_limites_de_string(esquema)
    return esquema


FERRAMENTA_DA_AVALIACAO = Ferramenta(
    nome=NOME_DA_FERRAMENTA,
    descricao=DESCRICAO_DA_FERRAMENTA,
    esquema=_esquema_da_saida(),
)


def montar_turno_da_avaliacao(tentativa: Tentativa, idioma: Idioma) -> Turno:
    """O turno da avaliacao: a rubrica do idioma e UMA mensagem, sem historico.

    O `idioma` chega pronto, lido na transacao que abriu a tentativa: esta
    funcao nao recebe sessao e nao rele o banco depois do commit.

    O JSON e o delimitador: aspas, chaves e tags na evidencia saem
    escapadas dentro de uma string, e nao ha texto que feche o campo `text`.
    A serializacao e a `como_dado` da tutoria (`tutoring/provider.py`), a
    mesma do contexto da Kairya: `ensure_ascii=False` so poupa tokens, e
    U+2028, U+2029 e U+0085, que o `json.dumps` deixa crus e o
    `str.splitlines()` trata como quebra de linha, saem como `\\uXXXX`
    (pendencia 205). A mensagem e uma linha so, e o `json.loads` devolve o
    texto exato que a pessoa escreveu.
    `link_opened` repete ao modelo, no dado, o que o prompt diz (E3).
    """
    dados = {
        "mission": {
            "instructions": tentativa.instructions,
            "completion_criterion": tentativa.completion_criterion,
        },
        "evidence": {
            "text": tentativa.evidence_text,
            "link": tentativa.evidence_link,
            "link_opened": False,
        },
    }
    return Turno(
        sistema=rubrica_do_idioma(idioma),
        mensagens=(MensagemDoTurno("user", como_dado(dados)),),
    )
