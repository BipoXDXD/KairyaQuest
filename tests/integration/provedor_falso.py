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
from typing import Any, Literal

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
    SignatureDelta,
    TextBlock,
    TextDelta,
    ThinkingBlock,
    ThinkingDelta,
    ToolUseBlock,
    Usage,
)
from anthropic.types.message_delta_usage import MessageDeltaUsage
from anthropic.types.raw_message_delta_event import Delta as DeltaDaMensagem

# O texto do bloco de thinking que o falso emite. Exportado para um teste
# provar que ele NUNCA chega ao dominio (`test_anthropic_provider.py`).
PENSAMENTO = "raciocinio interno do falso, que a tela nunca mostra"


def _eventos_do_pensamento() -> list[RawMessageStreamEvent]:
    """O bloco de thinking, sempre o indice 0, na forma que a API real mandou
    (referencia da camada 3, 1b-2): `content_block_start` de um `thinking`
    vazio, um `thinking_delta`, um `signature_delta` e o `content_block_stop`.
    O `ping` que a API manda no meio fica de fora: o SDK o descarta."""
    return [
        RawContentBlockStartEvent(
            type="content_block_start",
            index=0,
            content_block=ThinkingBlock(type="thinking", thinking="", signature=""),
        ),
        RawContentBlockDeltaEvent(
            type="content_block_delta",
            index=0,
            delta=ThinkingDelta(type="thinking_delta", thinking=PENSAMENTO),
        ),
        RawContentBlockDeltaEvent(
            type="content_block_delta",
            index=0,
            delta=SignatureDelta(type="signature_delta", signature="assinatura-falsa"),
        ),
        RawContentBlockStopEvent(type="content_block_stop", index=0),
    ]


# Quantos eventos o thinking poe na frente dos blocos do roteiro. As contagens
# (`cortar_apos_eventos`, `segurar_apos_eventos`, `atrasar_evento`) contam
# TODOS os eventos: com o thinking ligado, "depois do primeiro pedaco de
# texto" deixou de ser 3 (message_start, content_block_start, delta) e passou
# a ser `EVENTOS_DO_PENSAMENTO + 3`.
EVENTOS_DO_PENSAMENTO = len(_eventos_do_pensamento())

# O indice do evento logo DEPOIS do primeiro pedaco de texto, com o roteiro
# comecando por um `Texto` e o thinking ligado: message_start, os eventos do
# thinking, o content_block_start do texto e o primeiro text_delta ja sairam.
# E o ponto que os testes de corte, demora e espera usam para ter "a resposta
# comprovadamente no meio". O E2E (TypeScript) nao importa Python e escreve o
# mesmo numero literal, 7 (`frontend/tests/e2e/tutoring.spec.ts`).
APOS_O_PRIMEIRO_PEDACO = EVENTOS_DO_PENSAMENTO + 3


# Os motivos de parada que um roteiro pode escolher. `max_tokens` e
# `model_context_window_exceeded` cortam a resposta; `refusal` e a recusa (os
# classificadores ou o proprio modelo recusaram), que chega tambem num 200 com
# `message_stop` (pendencia 120). `stop_sequence` e `pause_turn` ficam de fora:
# a conversa nao manda `stop_sequences` nem ferramenta de servidor, e sem eles
# a API nao os emite.
MotivoDeParada = Literal[
    "end_turn", "tool_use", "max_tokens", "model_context_window_exceeded", "refusal"
]


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
      `message_stop` (o corte que o SDK nao denuncia).
    - `atrasar_evento`: `(indice, segundos)`, uma demora antes do evento.
    - `atrasar_cabecalhos`: uma demora antes de responder qualquer coisa.
    - `segurar_apos_eventos`: depois de N eventos, espera `liberar` antes de
      continuar. E o que deixa um teste desconectar o cliente com a resposta
      comprovadamente no meio.
    - `pensar`: emite, antes dos `blocos`, o bloco de thinking que a API real
      manda (`EVENTOS_DO_PENSAMENTO` eventos, que entram nas contagens
      acima). Ligado por padrao, para o falso se parecer com a API real
      (decisao do dono no ponto de parada 3 do 1b-2).
    - `stop_reason`: o motivo de parada do `message_delta`. `None` (padrao)
      deriva do roteiro: `tool_use` com ferramenta, `end_turn` sem ela. Um
      valor explicito (`max_tokens`, `model_context_window_exceeded`,
      `refusal`) deixa o teste roteirizar a parada.
    """

    blocos: tuple[Texto | ChamadaDeFerramenta, ...] = ()
    status_http: int = 200
    cortar_apos_eventos: int | None = None
    atrasar_evento: tuple[int, float] | None = None
    atrasar_cabecalhos: float = 0.0
    segurar_apos_eventos: int | None = None
    pensar: bool = True
    stop_reason: MotivoDeParada | None = None


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
    if roteiro.pensar:
        eventos.extend(_eventos_do_pensamento())
    # Com o thinking no indice 0, os blocos do roteiro comecam no 1.
    for indice, bloco in enumerate(roteiro.blocos, start=int(roteiro.pensar)):
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
                stop_reason=roteiro.stop_reason
                or ("tool_use" if tem_ferramenta else "end_turn"),
                stop_sequence=None,
            ),
            usage=MessageDeltaUsage(output_tokens=1),
        )
    )
    eventos.append(RawMessageStopEvent(type="message_stop"))
    return eventos


class TratadorDoFalso(BaseHTTPRequestHandler):
    """O tratador do falso: `POST` em qualquer caminho responde o roteiro. O do
    E2E (`falso_do_e2e.TratadorComControle`) o estende com o controle HTTP."""

    protocol_version = "HTTP/1.1"

    def do_POST(self) -> None:
        falso = falso_do_tratador(self)
        tamanho = int(self.headers["content-length"])
        corpo = json.loads(self.rfile.read(tamanho))
        falso.recebidas.append(
            Recebida(
                corpo=corpo, cabecalhos={k.lower(): v for k, v in self.headers.items()}
            )
        )
        # `liberar` e `roteiro` sao capturados JUNTOS, aqui, e o tratador
        # espera no `liberar` capturado -- nunca no `falso.liberar` do momento
        # da espera. O reset do E2E (`falso_do_e2e`) troca o `Event` por um
        # novo; um tratador que o lesse depois do reset esperaria no novo, que
        # ninguem aciona, com o roteiro velho mandando segurar: preso ate o
        # teto de 30 s. A ordem importa: `liberar` ANTES de `roteiro`, e o
        # reset troca o roteiro ANTES do `Event` -- quem capturar o `Event`
        # novo captura tambem o roteiro novo, que nao segura. No pytest do
        # 1b-1 o `Event` nunca e trocado, e nada muda.
        liberar = falso.liberar
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
                liberar.wait(timeout=30)
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

    def __init__(
        self,
        falso: ServidorAnthropicFalso,
        porta: int,
        tratador: type[TratadorDoFalso],
    ) -> None:
        super().__init__(("127.0.0.1", porta), tratador)
        self.falso = falso

    def handle_error(self, request: Any, client_address: Any) -> None:
        """O cliente que some no meio e cenario de teste, nao defeito do falso.
        Qualquer outro erro continua indo para a saida."""
        if isinstance(sys.exc_info()[1], ConnectionError):
            return
        super().handle_error(request, client_address)


def falso_do_tratador(tratador: BaseHTTPRequestHandler) -> ServidorAnthropicFalso:
    """O falso dono do servidor que chamou o tratador.

    `self.server` e tipado como `socketserver.BaseServer`; o `assert` estreita
    o tipo para o mypy e reprova alto se o tratador for montado noutro servidor.
    """
    servidor = tratador.server
    assert isinstance(servidor, _Servidor)
    return servidor.falso


@dataclass
class ServidorAnthropicFalso:
    roteiro: Roteiro = field(default_factory=Roteiro)
    recebidas: list[Recebida] = field(default_factory=list)
    liberar: threading.Event = field(default_factory=threading.Event)
    # Porta 0: o sistema escolhe uma livre (o pytest). O E2E passa a 8150 mais
    # o deslocamento do worktree (`frontend/tests/e2e/servers.ts`).
    porta: int = 0
    tratador: type[TratadorDoFalso] = TratadorDoFalso

    def __post_init__(self) -> None:
        self._servidor = _Servidor(self, self.porta, self.tratador)
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
