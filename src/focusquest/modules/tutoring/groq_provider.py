"""Groq Free: destino/modelo fixos, sem retries, redirecionamento ou fallback.

A gratuidade depende da conta Groq permanecer Free. A API de completions nao
informa o plano de cobranca; este adaptador nunca altera plano nem compra cota.
"""

import json
import logging
import re
from collections.abc import Generator
from typing import Any, Literal

import httpx2
from pydantic import BaseModel, Field, ValidationError

from focusquest.modules.tutoring.domain import TipoDeAcao
from focusquest.modules.tutoring.provider import (
    Delta,
    EventoDoProvedor,
    Ferramenta,
    Fim,
    Parada,
    Proposta,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)
from focusquest.modules.tutoring.tool_definitions import (
    DESCRICAO_DA_FERRAMENTA,
    DESCRICAO_DO_REAGENDAMENTO,
    esquema_da_proposta,
    esquema_do_reagendamento,
)

MODELO_GROQ = "openai/gpt-oss-20b"
_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

_LOGGER = logging.getLogger(__name__)
# Cabecalhos de limite descritos na documentacao "Rate Limits" do Groq; qualquer
# outro (location, set-cookie, x-request-id...) fica fora do log.
_CABECALHOS_DE_LIMITE = (
    "retry-after",
    "x-ratelimit-limit-requests",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-reset-requests",
    "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-tokens",
    "x-ratelimit-reset-tokens",
)
_TAMANHO_MAXIMO_DO_VALOR = 64
# Espaco, "=", quebra de linha e controle forjariam campos ou linhas no log.
_FORA_DO_SEGURO = re.compile(r"[^A-Za-z0-9._:,+-]")


class _Funcao(BaseModel):
    name: str | None = None
    arguments: str | None = None


class _Chamada(BaseModel):
    index: Literal[0]
    function: _Funcao | None = None


class _Delta(BaseModel):
    content: str | None = None
    tool_calls: list[_Chamada] | None = Field(default=None, max_length=1)
    refusal: str | None = None


class _Escolha(BaseModel):
    index: Literal[0]
    delta: _Delta
    finish_reason: Literal["stop", "tool_calls", "length", "content_filter"] | None = (
        None
    )


class _Metadados(BaseModel):
    error: str | None = None


class _Fragmento(BaseModel):
    model: Literal["openai/gpt-oss-20b"]
    choices: list[_Escolha] = Field(max_length=1)
    x_groq: _Metadados | None = None


def _valor_seguro(valor: str) -> str:
    return _FORA_DO_SEGURO.sub("?", valor[:_TAMANHO_MAXIMO_DO_VALOR])


def _descrever_limites(cabecalhos: httpx2.Headers) -> str:
    return "".join(
        f" {nome}={_valor_seguro(cabecalhos[nome])}"
        for nome in _CABECALHOS_DE_LIMITE
        if nome in cabecalhos
    )


def _registrar_falha(erro: Exception) -> None:
    if isinstance(erro, httpx2.HTTPStatusError):
        _LOGGER.warning(
            "Falha HTTP do provedor Groq: status=%d%s",
            erro.response.status_code,
            _descrever_limites(erro.response.headers),
        )
    else:
        _LOGGER.warning("Falha do provedor Groq: tipo=%s", type(erro).__name__)


class ProvedorGroq:
    """Implementa o protocolo existente com Chat Completions em SSE.

    `transporte` injeta somente o transporte HTTP dos testes. Nenhuma URL ou
    variavel de proxy/modelo pode mudar o destino de producao.
    """

    def __init__(
        self,
        *,
        chave: str,
        max_tokens: int,
        timeout_segundos: float,
        transporte: httpx2.BaseTransport | None = None,
    ) -> None:
        self._chave = chave
        self._max_tokens = max_tokens
        self._timeout = timeout_segundos
        self._transporte = transporte

    def responder(self, turno: Turno) -> Generator[EventoDoProvedor]:
        ferramentas = [
            Ferramenta(
                TipoDeAcao.CRIAR_MISSAO.value,
                DESCRICAO_DA_FERRAMENTA,
                esquema_da_proposta(),
            ),
            Ferramenta(
                TipoDeAcao.REAGENDAR_MISSAO.value,
                DESCRICAO_DO_REAGENDAMENTO,
                esquema_do_reagendamento(),
            ),
        ]
        yield from self._eventos(turno, ferramentas, self._max_tokens, forcar=False)

    def avaliar(self, turno: Turno, ferramenta: Ferramenta) -> dict[str, Any] | None:
        entrada: dict[str, Any] | None = None
        for evento in self._eventos(turno, [ferramenta], 2048, forcar=True):
            if isinstance(evento, Proposta) and evento.nome == ferramenta.nome:
                entrada = evento.entrada
        return entrada

    def _eventos(
        self,
        turno: Turno,
        ferramentas: list[Ferramenta],
        max_tokens: int,
        *,
        forcar: bool,
    ) -> Generator[EventoDoProvedor]:
        corpo = {
            "model": MODELO_GROQ,
            "messages": [{"role": "system", "content": turno.sistema}]
            + [{"role": m.papel, "content": m.texto} for m in turno.mensagens],
            "max_completion_tokens": max_tokens,
            "reasoning_effort": "low",
            "stream": True,
            "parallel_tool_calls": False,
            "tool_choice": {
                "type": "function",
                "function": {"name": ferramentas[0].nome},
            }
            if forcar
            else "auto",
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": f.nome,
                        "description": f.descricao,
                        "parameters": f.esquema,
                    },
                }
                for f in ferramentas
            ],
        }
        try:
            # Um cliente por chamada para fechar conexoes mesmo no cancelamento.
            # O transporte HTTP padrao tem zero retries; nao ha SDK lendo chaves.
            with (
                httpx2.Client(
                    timeout=self._timeout,
                    transport=self._transporte,
                    trust_env=False,
                    follow_redirects=False,
                ) as cliente,
                cliente.stream(
                    "POST",
                    _ENDPOINT,
                    json=corpo,
                    headers={"Authorization": f"Bearer {self._chave}"},
                ) as resposta,
            ):
                resposta.raise_for_status()
                nome: str | None = None
                argumentos = ""
                motivo: str | None = None
                recusou = False
                for linha in resposta.iter_lines():
                    if not linha.startswith("data:"):
                        continue
                    dados = linha[5:].lstrip(" ")
                    if dados == "[DONE]":
                        if motivo is None:
                            raise ValueError("fim sem motivo")
                        if motivo == "tool_calls" and not recusou:
                            entrada = json.loads(argumentos)
                            if not nome or not isinstance(entrada, dict):
                                raise ValueError("ferramenta incompleta")
                            yield Proposta(nome, entrada)
                        yield Fim(
                            Parada.RECUSADA
                            if recusou
                            else {
                                "length": Parada.CORTADA,
                                "content_filter": Parada.RECUSADA,
                            }.get(motivo, Parada.TERMINOU)
                        )
                        return
                    fragmento = _Fragmento.model_validate_json(dados)
                    if fragmento.x_groq is not None and fragmento.x_groq.error:
                        raise ValueError("erro no stream do provedor")
                    if not fragmento.choices:
                        continue
                    if motivo is not None:
                        raise ValueError("saida depois do fim")
                    escolha = fragmento.choices[0]
                    recusou = recusou or bool(escolha.delta.refusal)
                    if escolha.delta.content:
                        yield Delta(escolha.delta.content)
                    for chamada in escolha.delta.tool_calls or []:
                        if chamada.function is not None:
                            nome = chamada.function.name or nome
                            argumentos += chamada.function.arguments or ""
                    motivo = escolha.finish_reason
                raise ValueError("stream sem DONE")
        except httpx2.TimeoutException as erro:
            _LOGGER.warning(
                "Tempo esgotado no provedor Groq: tipo=%s", type(erro).__name__
            )
            raise TempoEsgotadoError("o provedor demorou alem do limite") from erro
        except (httpx2.HTTPError, ValidationError, ValueError) as erro:
            # Só status e limites saneados vão ao log; corpo, chave e mensagem da
            # exceção, nunca.
            _registrar_falha(erro)
            raise ProvedorIndisponivelError(
                "o provedor nao concluiu uma resposta valida"
            ) from erro
