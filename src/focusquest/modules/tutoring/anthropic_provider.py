"""O adaptador Anthropic: a unica peca da aplicacao que importa o SDK."""

from collections.abc import Generator
from typing import Any

import anthropic
import httpx2
from anthropic.types import MessageParam, ToolParam, ToolUseBlock

from focusquest.modules.missions.schemas import MissionCreate
from focusquest.modules.tutoring.domain import TipoDeAcao
from focusquest.modules.tutoring.provider import (
    Delta,
    EventoDoProvedor,
    Fim,
    Proposta,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)

# Tentativas do proprio SDK, alem da primeira chamada. Elas so acontecem antes
# do primeiro evento: depois que o stream comecou, o SDK nao tenta de novo
# (medido: 3 chamadas com demora nos cabecalhos ou 500; 1 com o corte no meio).
TENTATIVAS = 2

DESCRICAO_DA_FERRAMENTA = (
    "Propõe uma missão de estudo. NÃO cria nada: a pessoa vê a proposta num "
    "cartão e decide se confirma ou recusa. Use no máximo uma vez por "
    "resposta. O prazo (deadline) é um instante ISO 8601 com fuso horário, "
    "no futuro."
)


def esquema_da_proposta() -> dict[str, Any]:
    """O `input_schema` da ferramenta, gerado do MESMO `MissionCreate` do
    `POST /api/missions`, para os dois contratos nao divergirem.

    O `description` do topo e a docstring de manutencao do schema (medicao
    M8): fala de 422 e de defeitos medidos, e nao serve ao modelo. A descricao
    para o modelo e `DESCRICAO_DA_FERRAMENTA`.
    """
    esquema = MissionCreate.model_json_schema()
    esquema.pop("description", None)
    esquema.pop("title", None)
    return esquema


class ProvedorAnthropic:
    """Fala com a API de Mensagens pelo SDK oficial, sincrono."""

    def __init__(
        self,
        *,
        chave: str,
        base_url: str,
        modelo: str,
        max_tokens: int,
        timeout_segundos: float,
    ) -> None:
        # A chave e o endereco SEMPRE explicitos: sem eles o SDK procura
        # credencial e endereco no ambiente sozinho (medicoes M6 e M7).
        self._cliente = anthropic.Anthropic(
            api_key=chave,
            base_url=base_url,
            timeout=timeout_segundos,
            max_retries=TENTATIVAS,
        )
        self._modelo = modelo
        self._max_tokens = max_tokens

    def responder(self, turno: Turno) -> Generator[EventoDoProvedor]:
        ferramenta: ToolParam = {
            "name": TipoDeAcao.CRIAR_MISSAO.value,
            "description": DESCRICAO_DA_FERRAMENTA,
            "input_schema": esquema_da_proposta(),
        }
        mensagens: list[MessageParam] = [
            {"role": mensagem.papel, "content": mensagem.texto}
            for mensagem in turno.mensagens
        ]
        try:
            with self._cliente.messages.stream(
                model=self._modelo,
                max_tokens=self._max_tokens,
                system=turno.sistema,
                messages=mensagens,
                tools=[ferramenta],
                # Uma proposta por resposta (README s14).
                tool_choice={"type": "auto", "disable_parallel_tool_use": True},
            ) as stream:
                for evento in stream:
                    if evento.type == "text":
                        yield Delta(evento.text)
                    elif evento.type == "content_block_stop" and isinstance(
                        evento.content_block, ToolUseBlock
                    ):
                        yield Proposta(dict(evento.content_block.input))
                    elif evento.type == "message_stop":
                        if evento.message.stop_reason == "max_tokens":
                            raise ProvedorIndisponivelError(
                                "o provedor encerrou a resposta no limite de tokens"
                            )
                        yield Fim()
        except (anthropic.APITimeoutError, httpx2.TimeoutException) as erro:
            # Os DOIS tipos, e nao so o do SDK: a demora no meio do stream sai
            # como `httpx2.ReadTimeout` cru (medicao M4).
            raise TempoEsgotadoError("o provedor demorou alem do limite") from erro
        except (anthropic.APIError, httpx2.TransportError) as erro:
            raise ProvedorIndisponivelError(
                f"o provedor falhou: {type(erro).__name__}"
            ) from erro
