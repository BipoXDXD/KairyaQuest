"""Servidor falso da API de Mensagens da Anthropic, roteirizavel por teste.

Mora em `tests/`, e nao em `src/`: nao existe "modo falso" na aplicacao que
alguem pudesse ligar por engano. O `anthropic_base_url` aponta o SDK REAL para
ca, e os testes exercitam o adaptador de producao inteiro, inclusive a leitura
que o SDK faz do stream.

Cada evento e construido com os tipos do SDK fixado e serializado pelo modelo
Pydantic dele (camada 1 da spec do 1b, decisao D8): nao ha JSON escrito a mao,
e um campo errado reprova no mypy.
"""

import json
import sys
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import TracebackType
from typing import Any

from anthropic.types import (
    InputJSONDelta,
    Message,
    RawContentBlockDeltaEvent,
    RawContentBlockStartEvent,
    RawContentBlockStopEvent,
    RawMessageDeltaEvent,
    RawMessageStartEvent,
    RawMessageStopEvent,
    RawMessageStreamEvent,
    TextBlock,
    TextDelta,
    ToolUseBlock,
    Usage,
)
from anthropic.types.message_delta_usage import MessageDeltaUsage
from anthropic.types.raw_message_delta_event import Delta as DeltaDaMensagem


@dataclass(frozen=True)
class Texto:
    """Um bloco de texto, entregue em pedacos (um `text_delta` por pedaco)."""

    pedacos: tuple[str, ...]


@dataclass(frozen=True)
class ChamadaDeFerramenta:
    """Um bloco `tool_use`, com a entrada inteira num `input_json_delta` so."""

    entrada: dict[str, Any]
    nome: str = "create_mission"


@dataclass(frozen=True)
class Roteiro:
    """O que o falso responde na proxima chamada.

    - `status_http` diferente de 200: responde um erro JSON, sem stream.
    - `cortar_apos_eventos`: fecha a conexao depois de N eventos, sem
      `message_stop` (o corte que o SDK nao denuncia, medicao M3).
    - `atrasar_evento`: `(indice, segundos)`, uma demora antes do evento.
    - `atrasar_cabecalhos`: uma demora antes de responder qualquer coisa.
    - `segurar_apos_eventos`: depois de N eventos, espera `liberar` antes de
      continuar. E o que deixa um teste desconectar o cliente com a resposta
      comprovadamente no meio.
    """

    blocos: tuple[Texto | ChamadaDeFerramenta, ...] = ()
    status_http: int = 200
    cortar_apos_eventos: int | None = None
    atrasar_evento: tuple[int, float] | None = None
    atrasar_cabecalhos: float = 0.0
    segurar_apos_eventos: int | None = None


@dataclass(frozen=True)
class Recebida:
    corpo: dict[str, Any]
    cabecalhos: dict[str, str]


def eventos_do_roteiro(roteiro: Roteiro) -> list[RawMessageStreamEvent]:
    """A sequencia de eventos de uma resposta, na ordem da API."""
    tem_ferramenta = any(isinstance(b, ChamadaDeFerramenta) for b in roteiro.blocos)
    eventos: list[RawMessageStreamEvent] = [
        RawMessageStartEvent(
            type="message_start",
            message=Message(
                id="msg_falso",
                type="message",
                role="assistant",
                model="claude-opus-5",
                content=[],
                stop_reason=None,
                stop_sequence=None,
                usage=Usage(input_tokens=1, output_tokens=0),
            ),
        )
    ]
    for indice, bloco in enumerate(roteiro.blocos):
        if isinstance(bloco, Texto):
            eventos.append(
                RawContentBlockStartEvent(
                    type="content_block_start",
                    index=indice,
                    content_block=TextBlock(type="text", text=""),
                )
            )
            eventos.extend(
                RawContentBlockDeltaEvent(
                    type="content_block_delta",
                    index=indice,
                    delta=TextDelta(type="text_delta", text=pedaco),
                )
                for pedaco in bloco.pedacos
            )
        else:
            eventos.append(
                RawContentBlockStartEvent(
                    type="content_block_start",
                    index=indice,
                    content_block=ToolUseBlock(
                        type="tool_use", id=f"toolu_{indice}", name=bloco.nome, input={}
                    ),
                )
            )
            eventos.append(
                RawContentBlockDeltaEvent(
                    type="content_block_delta",
                    index=indice,
                    delta=InputJSONDelta(
                        type="input_json_delta", partial_json=json.dumps(bloco.entrada)
                    ),
                )
            )
        eventos.append(
            RawContentBlockStopEvent(type="content_block_stop", index=indice)
        )
    eventos.append(
        RawMessageDeltaEvent(
            type="message_delta",
            delta=DeltaDaMensagem(
                stop_reason="tool_use" if tem_ferramenta else "end_turn",
                stop_sequence=None,
            ),
            usage=MessageDeltaUsage(output_tokens=1),
        )
    )
    eventos.append(RawMessageStopEvent(type="message_stop"))
    return eventos


class _Tratador(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self) -> None:
        servidor = self.server
        assert isinstance(servidor, _Servidor)
        falso = servidor.falso
        tamanho = int(self.headers["content-length"])
        corpo = json.loads(self.rfile.read(tamanho))
        falso.recebidas.append(
            Recebida(
                corpo=corpo, cabecalhos={k.lower(): v for k, v in self.headers.items()}
            )
        )
        roteiro = falso.roteiro
        if roteiro.atrasar_cabecalhos:
            time.sleep(roteiro.atrasar_cabecalhos)
        if roteiro.status_http != 200:
            erro = json.dumps(
                {"type": "error", "error": {"type": "api_error", "message": "falso"}}
            ).encode()
            self.send_response(roteiro.status_http)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(erro)))
            self.end_headers()
            self.wfile.write(erro)
            return
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("connection", "close")
        self.end_headers()
        for indice, evento in enumerate(eventos_do_roteiro(roteiro)):
            if roteiro.cortar_apos_eventos == indice:
                self.close_connection = True
                return
            if roteiro.segurar_apos_eventos == indice:
                falso.liberar.wait(timeout=30)
            if roteiro.atrasar_evento and roteiro.atrasar_evento[0] == indice:
                time.sleep(roteiro.atrasar_evento[1])
            self.wfile.write(
                f"event: {evento.type}\ndata: {evento.model_dump_json()}\n\n".encode()
            )
            self.wfile.flush()

    def log_message(self, format: str, *args: Any) -> None:
        """Silencio: o log de acesso do http.server so poluiria a saida do pytest."""


class _Servidor(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, falso: ServidorAnthropicFalso) -> None:
        super().__init__(("127.0.0.1", 0), _Tratador)
        self.falso = falso

    def handle_error(self, request: Any, client_address: Any) -> None:
        """O cliente que some no meio e cenario de teste, nao defeito do falso.
        Qualquer outro erro continua indo para a saida."""
        if isinstance(sys.exc_info()[1], ConnectionError):
            return
        super().handle_error(request, client_address)


@dataclass
class ServidorAnthropicFalso:
    roteiro: Roteiro = field(default_factory=Roteiro)
    recebidas: list[Recebida] = field(default_factory=list)
    liberar: threading.Event = field(default_factory=threading.Event)

    def __post_init__(self) -> None:
        self._servidor = _Servidor(self)
        self._thread = threading.Thread(
            target=self._servidor.serve_forever, daemon=True
        )

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self._servidor.server_port}"

    def __enter__(self) -> ServidorAnthropicFalso:
        self._thread.start()
        return self

    def __exit__(
        self,
        tipo: type[BaseException] | None,
        erro: BaseException | None,
        rastro: TracebackType | None,
    ) -> None:
        self.liberar.set()
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=10)


def iniciar() -> Iterator[ServidorAnthropicFalso]:
    """O ciclo de vida que a fixture usa, fora dela para o 1b-2 reaproveitar."""
    with ServidorAnthropicFalso() as falso:
        yield falso
