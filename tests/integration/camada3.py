"""Camada 3 do servidor falso: a sequencia de TIPOS de evento da API real.

Uso, uma vez, com a chave vinda do Keychain do macOS so para este processo
e o `anthropic_base_url` sem override (roteiro da pendencia 42):

    FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password \\
      -s focusquest-anthropic -w)" PYTHONPATH=tests uv run python -m integration.camada3

Grava `referencia_da_api_real.json`, ao lado deste arquivo, com os NOMES dos
eventos SSE e o tipo de cada bloco/delta -- nunca o texto, a entrada da
ferramenta, os ids ou a chave. Le as linhas CRUAS da resposta
(`with_streaming_response`), e nao os eventos do SDK, porque o SDK descarta
o que ele nao usa (o `ping`), e a camada 3 existe para ver o que a API MANDA.

A requisicao e montada com as MESMAS pecas de producao -- o sistema do
`montar_turno` (persona e contexto, com o quadro vazio), o esquema e a
descricao da ferramenta, o modelo e o `max_tokens` do Settings --
mas nao e a chamada que a tela faz: interceptar aquela exigiria um modo de
captura em `src/` ou um proxy no `anthropic_base_url`, e os dois estao fora
(decisao D8 da spec; o roteiro manda "sem override").
"""

import json
import sys
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

import anthropic

from focusquest.core.config import Settings
from focusquest.modules.tutoring.anthropic_provider import (
    DESCRICAO_DA_FERRAMENTA,
    esquema_da_proposta,
)
from focusquest.modules.tutoring.context import montar_turno
from focusquest.modules.tutoring.domain import TipoDeAcao
from focusquest.modules.tutoring.persona import PERSONA

REFERENCIA = Path(__file__).with_name("referencia_da_api_real.json")

# O que o SDK fixado descarta antes de o adaptador ver
# (`anthropic/_streaming.py`: `if sse.event == "ping": continue`). Retirado so
# na COMPARACAO; o arquivo guarda a sequencia bruta.
DESCARTADOS_PELO_SDK = frozenset({"ping"})

_API_REAL = "api.anthropic.com"

_PEDIDO = (
    "Me propõe uma missão de 30 minutos para revisar recursão, "
    "com prazo amanhã às 18h, horário de Brasília."
)


def sequencia_de_tipos(linhas: Iterable[str]) -> list[str]:
    """Os tipos de evento, na ordem, sem conteudo nenhum.

    `content_block_start` e `content_block_delta` levam o tipo do bloco ou do
    delta (`text`, `tool_use`, `text_delta`, `input_json_delta`): e o que
    distingue uma resposta com proposta de uma so de texto. Repeticoes
    seguidas viram UMA: o numero de `delta` depende do texto, e nao do
    formato.
    """
    tipos: list[str] = []
    evento: str | None = None
    for linha in linhas:
        if linha.startswith("event: "):
            evento = linha.removeprefix("event: ")
        elif linha.startswith("data: ") and evento is not None:
            tipo = evento
            if evento == "content_block_start":
                tipo = f"{evento}:{json.loads(linha[6:])['content_block']['type']}"
            elif evento == "content_block_delta":
                tipo = f"{evento}:{json.loads(linha[6:])['delta']['type']}"
            if not tipos or tipos[-1] != tipo:
                tipos.append(tipo)
            evento = None
    return tipos


def comparavel(tipos: Sequence[str]) -> list[str]:
    return [t for t in tipos if t not in DESCARTADOS_PELO_SDK]


def capturar(
    cliente: anthropic.Anthropic, *, modelo: str, max_tokens: int, agora: datetime
) -> list[str]:
    with cliente.messages.with_streaming_response.create(
        model=modelo,
        max_tokens=max_tokens,
        system=montar_turno(
            persona=PERSONA, agora=agora, pendentes=[], historico=[]
        ).sistema,
        messages=[{"role": "user", "content": _PEDIDO}],
        tools=[
            {
                "name": TipoDeAcao.CRIAR_MISSAO.value,
                "description": DESCRICAO_DA_FERRAMENTA,
                "input_schema": esquema_da_proposta(),
            }
        ],
        tool_choice={"type": "auto", "disable_parallel_tool_use": True},
        stream=True,
    ) as resposta:
        return sequencia_de_tipos(resposta.iter_lines())


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
    cliente = anthropic.Anthropic(
        api_key=settings.anthropic_api_key.get_secret_value(),
        base_url=settings.anthropic_base_url,
        max_retries=0,
    )
    try:
        tipos = capturar(
            cliente,
            modelo=settings.tutor_model,
            max_tokens=settings.tutor_max_tokens,
            agora=datetime.now(UTC),
        )
    except anthropic.APIStatusError as erro:
        # So o status: o corpo do erro nao tem a chave, mas tambem nao interessa.
        raise SystemExit(
            f"a API respondeu {erro.status_code}; nada foi gravado"
        ) from None
    except anthropic.APIError as erro:
        raise SystemExit(f"falha ao falar com a API: {type(erro).__name__}") from None
    if (
        "content_block_start:text" not in tipos
        or "content_block_start:tool_use" not in tipos
    ):
        raise SystemExit(
            "a resposta nao teve texto E proposta; rode de novo (nada foi gravado)"
        )
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
    # So os tipos vao para a tela.
    json.dump(tipos, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
