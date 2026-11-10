"""Camada 3 da AVALIACAO (pendencia 91): a sequencia de TIPOS de evento que a
API real manda para o `avaliar` de producao.

Uso, uma vez, com a chave vinda do Keychain do macOS so para este processo
e o `anthropic_base_url` sem override (roteiro da pendencia 42):

    FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password \\
      -s focusquest-anthropic -w)" PYTHONPATH=tests \\
      uv run python -m integration.camada3_da_avaliacao

Diferente de `camada3.py`, a requisicao NAO e remontada a mao: a chamada e o
proprio `ProvedorAnthropic.avaliar`, com a `FERRAMENTA_DA_AVALIACAO` real
(`strict`, `tool_choice` auto) e o turno do `montar_turno_da_avaliacao` de
uma `Tentativa` fixa. O corpo cru chega pelo `Espiao`, no transporte do
cliente. So uma coisa muda em relacao a producao: `max_retries=0`, para a
conta das chamadas pagas ser exata.

Grava `referencia_da_avaliacao_real.json` com os nomes dos eventos e o tipo
de cada bloco/delta -- nunca o veredito, o comentario, os ids ou a chave. Na
tela sai so a sequencia e se a entrada passou no `EvaluationOutput` (o
veredito, que e um de tres valores fixos, sai tambem; o comentario, nao).
"""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import anthropic
from pydantic import ValidationError

from focusquest.core.config import Settings
from focusquest.modules.evaluation.rubric import (
    FERRAMENTA_DA_AVALIACAO,
    montar_turno_da_avaliacao,
)
from focusquest.modules.evaluation.schemas import EvaluationOutput
from focusquest.modules.missions.evaluation_records import Tentativa
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.provider import (
    ProvedorIndisponivelError,
    TempoEsgotadoError,
)
from integration.camada3 import sequencia_de_tipos
from integration.espiao import Espiao, provedor_espionado

REFERENCIA = Path(__file__).with_name("referencia_da_avaliacao_real.json")

_API_REAL = "api.anthropic.com"

# Uma entrega que atende ao criterio, para a chamada ter um veredito claro.
# O conteudo nao vai para a referencia.
TENTATIVA = Tentativa(
    mission_id=1,
    attempt=1,
    instructions="Resolver 3 exercícios de recursão do capítulo 4.",
    completion_criterion=(
        "Os 3 exercícios resolvidos, com a saída de cada um conferida."
    ),
    evidence_text=(
        "Resolvi os 3: fatorial(5) deu 120, fibonacci(10) deu 55 e a soma dos "
        "dígitos de 1234 deu 10. Conferi cada saída rodando o código."
    ),
    evidence_link=None,
)


def capturar(
    provedor: ProvedorAnthropic, espiao: Espiao
) -> tuple[list[str], dict[str, Any] | None]:
    """A sequencia de tipos e o que `avaliar` devolveu."""
    entrada = provedor.avaliar(
        montar_turno_da_avaliacao(TENTATIVA), FERRAMENTA_DA_AVALIACAO
    )
    return sequencia_de_tipos(espiao.linhas()), entrada


def main() -> None:
    settings = Settings()
    if urlsplit(settings.anthropic_base_url).hostname != _API_REAL:
        raise SystemExit(
            "a camada 3 so grava a API real; o anthropic_base_url aponta para "
            f"'{urlsplit(settings.anthropic_base_url).hostname}'"
        )
    if settings.anthropic_api_key is None:
        raise SystemExit(
            "sem FOCUSQUEST_ANTHROPIC_API_KEY no ambiente; nada foi gravado"
        )
    provedor, espiao = provedor_espionado(
        chave=settings.anthropic_api_key.get_secret_value(),
        base_url=settings.anthropic_base_url,
        modelo=settings.tutor_model,
        # A avaliacao usa o proprio `MAX_TOKENS_DA_AVALIACAO`; este e o da
        # conversa, que `avaliar` nao le.
        max_tokens=settings.tutor_max_tokens,
        timeout_segundos=settings.tutor_timeout_seconds,
        fallback=settings.tutor_fallback,
        esforco=settings.tutor_effort,
        esforco_da_avaliacao=settings.evaluation_effort,
    )
    try:
        tipos, entrada = capturar(provedor, espiao)
    except (ProvedorIndisponivelError, TempoEsgotadoError) as erro:
        # A causa e o erro do SDK: o status HTTP e o tipo dele, e o corpo do
        # erro da API (que diz o que foi recusado; nao tem a chave).
        causa = erro.__cause__
        status = getattr(causa, "status_code", None)
        corpo = getattr(causa, "body", None)
        raise SystemExit(
            f"{type(erro).__name__} ({type(causa).__name__}, status {status}): "
            f"{json.dumps(corpo, ensure_ascii=False)}; nada foi gravado"
        ) from None
    if entrada is None:
        json.dump(tipos, sys.stdout)
        raise SystemExit(
            "\navaliar devolveu None (sem ferramenta ou parada diferente de "
            "tool_use); nada foi gravado"
        )
    try:
        veredito = EvaluationOutput.model_validate(entrada).verdict.value
    except ValidationError as erro:
        campos = [".".join(map(str, e["loc"])) for e in erro.errors()]
        raise SystemExit(
            f"a entrada nao passou no EvaluationOutput (campos: {campos}); "
            "nada foi gravado"
        ) from None
    REFERENCIA.write_text(
        json.dumps(
            {
                "capturada_em": datetime.now(UTC).date().isoformat(),
                "sdk": f"anthropic=={anthropic.__version__}",
                "modelo": settings.tutor_model,
                "eventos": tipos,
            },
            indent=2,
        )
        + "\n"
    )
    json.dump({"eventos": tipos, "veredito": veredito}, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
