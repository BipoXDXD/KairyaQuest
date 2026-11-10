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

# Os tipos do endpoint BETA, que e o que o adaptador chama (pendencia 174): o
# `content_block_start` estavel nao aceita o bloco `fallback`, e o uso estavel
# nao tem `iterations`. O fio de uma resposta sem troca e o mesmo nos dois.
from anthropic.types.beta import (
    BetaFallbackBlock,
    BetaFallbackMessageIterationUsage,
    BetaInputJSONDelta,
    BetaMessage,
    BetaMessageDeltaUsage,
    BetaMessageIterationUsage,
    BetaRawContentBlockDeltaEvent,
    BetaRawContentBlockStartEvent,
    BetaRawContentBlockStopEvent,
    BetaRawMessageDeltaEvent,
    BetaRawMessageStartEvent,
    BetaRawMessageStopEvent,
    BetaRawMessageStreamEvent,
    BetaSignatureDelta,
    BetaTextBlock,
    BetaTextDelta,
    BetaThinkingBlock,
    BetaThinkingDelta,
    BetaToolUseBlock,
    BetaUsage,
)
from anthropic.types.beta.beta_raw_message_delta_event import Delta as DeltaDaMensagem

# O modelo que o falso diz ter respondido, e o PEDIDO quando ha substituicao.
MODELO_DO_FALSO = "claude-opus-5"

# O texto do bloco de thinking que o falso emite. Exportado para um teste
# provar que ele NUNCA chega ao dominio (`test_anthropic_provider.py`).
PENSAMENTO = "raciocinio interno do falso, que a tela nunca mostra"


def _eventos_do_pensamento(indice: int = 0) -> list[BetaRawMessageStreamEvent]:
    """O bloco de thinking na forma que a API real mandou (referencia da
    camada 3, 1b-2): `content_block_start` de um `thinking` vazio, um
    `thinking_delta`, um `signature_delta` e o `content_block_stop`. E o
    indice 0, salvo quando a troca de modelo vem antes (pendencia 174).
    O `ping` que a API manda no meio fica de fora: o SDK o descarta."""
    return [
        BetaRawContentBlockStartEvent(
            type="content_block_start",
            index=indice,
            content_block=BetaThinkingBlock(type="thinking", thinking="", signature=""),
        ),
        BetaRawContentBlockDeltaEvent(
            type="content_block_delta",
            index=indice,
            delta=BetaThinkingDelta(type="thinking_delta", thinking=PENSAMENTO),
        ),
        BetaRawContentBlockDeltaEvent(
            type="content_block_delta",
            index=indice,
            delta=BetaSignatureDelta(
                type="signature_delta", signature="assinatura-falsa"
            ),
        ),
        BetaRawContentBlockStopEvent(type="content_block_stop", index=indice),
    ]


# Quantos eventos o thinking poe na frente dos blocos do roteiro. As contagens
# (`cortar_apos_eventos`, `segurar_apos_eventos`, `atrasar_evento`) contam
# TODOS os eventos: com o thinking ligado, "depois do primeiro pedaco de
# texto" deixou de ser 3 (message_start, content_block_start, delta) e passou
# a ser `EVENTOS_DO_PENSAMENTO + 3`. O bloco `fallback` de uma `Substituicao`
# nao fixa tambem conta: sao `EVENTOS_DA_TROCA` eventos (start e stop, sem
# delta).
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
# `message_stop` (pendencia 120). `stop_sequence` e controle sintetico do
# adaptador: a conversa nao manda stop_sequences. `pause_turn` fica de fora
# (nao ha ferramenta de servidor).
MotivoDeParada = Literal[
    "end_turn",
    "tool_use",
    "max_tokens",
    "model_context_window_exceeded",
    "refusal",
    "stop_sequence",
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
class Substituicao:
    """A recusa do modelo pedido e a troca pelo substituto (fallback, beta).

    - `modelo`: o substituto, que o servidor escolheu.
    - `apos_blocos`: quantos blocos do roteiro o modelo PEDIDO entrega antes
      de recusar. 0 e a recusa antes de qualquer saida: o `message_start` ja
      nomeia o substituto e o bloco `fallback` e o primeiro.
    - `fixa`: o roteamento fixo da API (sticky): sem bloco `fallback`, o
      `message_start` ja com o substituto e so a `fallback_message` no uso.
    O `stop_reason` do roteiro e o da tentativa FINAL: `refusal` com
    substituicao e a cadeia esgotada.
    """

    modelo: str = "claude-opus-4-8"
    apos_blocos: int = 0
    fixa: bool = False


# Quantos eventos o bloco `fallback` poe no stream: start e stop, sem delta.
EVENTOS_DA_TROCA = 2


@dataclass(frozen=True)
class _Troca:
    """O lugar do bloco `fallback` entre os blocos do roteiro."""


@dataclass(frozen=True)
class _Pensamento:
    """O lugar do bloco de thinking entre os blocos do roteiro."""


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
    - `substituicao`: a troca de modelo depois de uma recusa (pendencia 174).
    """

    blocos: tuple[Texto | ChamadaDeFerramenta, ...] = ()
    status_http: int = 200
    cortar_apos_eventos: int | None = None
    atrasar_evento: tuple[int, float] | None = None
    atrasar_cabecalhos: float = 0.0
    segurar_apos_eventos: int | None = None
    pensar: bool = True
    stop_reason: MotivoDeParada | None = None
    substituicao: Substituicao | None = None


@dataclass(frozen=True)
class Recebida:
    corpo: dict[str, Any]
    cabecalhos: dict[str, str]

    @property
    def contexto_do_turno(self) -> str:
        """O texto dos blocos de `system` que ficam fora do prefixo cacheado.

        A conversa manda a persona num bloco com `cache_control` e o contexto
        do turno, que muda a cada pergunta, em bloco proprio depois dele. Ler
        so os blocos sem `cache_control` prova as duas coisas: o contexto
        chegou e nao entrou no cache.
        """
        blocos: list[dict[str, Any]] = self.corpo["system"]
        return "\n\n".join(
            bloco["text"] for bloco in blocos if "cache_control" not in bloco
        )


def _uso_da_troca(
    substituicao: Substituicao | None,
) -> list[BetaMessageIterationUsage | BetaFallbackMessageIterationUsage] | None:
    """O `usage.iterations` do `message_delta`: `None` sem troca, como na
    resposta normal da API; com ela, uma entrada por tentativa, e a do
    substituto e a `fallback_message` que o adaptador le."""
    if substituicao is None:
        return None
    substituto = BetaFallbackMessageIterationUsage(
        type="fallback_message",
        model=substituicao.modelo,
        input_tokens=1,
        output_tokens=1,
        cache_read_input_tokens=0,
        cache_creation_input_tokens=0,
    )
    if substituicao.fixa:
        return [substituto]
    pedido = BetaMessageIterationUsage(
        type="message",
        model=MODELO_DO_FALSO,
        input_tokens=1,
        output_tokens=0,
        cache_read_input_tokens=0,
        cache_creation_input_tokens=0,
    )
    return [pedido, substituto]


def _itens(
    roteiro: Roteiro,
) -> list[Texto | ChamadaDeFerramenta | _Troca | _Pensamento]:
    """Os blocos na ordem do stream, com o thinking e a troca no lugar."""
    itens: list[Texto | ChamadaDeFerramenta | _Troca | _Pensamento] = list(
        roteiro.blocos
    )
    substituicao = roteiro.substituicao
    troca_primeiro = False
    if substituicao is not None and not substituicao.fixa:
        itens.insert(substituicao.apos_blocos, _Troca())
        troca_primeiro = substituicao.apos_blocos == 0
    if roteiro.pensar:
        # Na troca antes da saida, quem pensa e o substituto, depois do bloco.
        itens.insert(1 if troca_primeiro else 0, _Pensamento())
    return itens


def eventos_do_roteiro(roteiro: Roteiro) -> list[BetaRawMessageStreamEvent]:
    """A sequencia de eventos de uma resposta, na ordem da API."""
    tem_ferramenta = any(isinstance(b, ChamadaDeFerramenta) for b in roteiro.blocos)
    substituicao = roteiro.substituicao
    abre_com_o_substituto = substituicao is not None and (
        substituicao.fixa or substituicao.apos_blocos == 0
    )
    eventos: list[BetaRawMessageStreamEvent] = [
        BetaRawMessageStartEvent(
            type="message_start",
            message=BetaMessage(
                id="msg_falso",
                type="message",
                role="assistant",
                model=substituicao.modelo
                if substituicao is not None and abre_com_o_substituto
                else MODELO_DO_FALSO,
                content=[],
                stop_reason=None,
                stop_sequence=None,
                usage=BetaUsage(input_tokens=1, output_tokens=0),
            ),
        )
    ]
    for indice, bloco in enumerate(_itens(roteiro)):
        if isinstance(bloco, _Pensamento):
            eventos.extend(_eventos_do_pensamento(indice))
            continue
        if isinstance(bloco, _Troca):
            assert substituicao is not None
            eventos.append(
                BetaRawContentBlockStartEvent(
                    type="content_block_start",
                    index=indice,
                    # `model_validate` com o nome do fio (`from`): o
                    # construtor por palavra-chave com `from_=` reprova.
                    content_block=BetaFallbackBlock.model_validate(
                        {
                            "type": "fallback",
                            "from": {"model": MODELO_DO_FALSO},
                            "to": {"model": substituicao.modelo},
                            "trigger": {"type": "refusal", "category": "cyber"},
                        }
                    ),
                )
            )
        elif isinstance(bloco, Texto):
            eventos.append(
                BetaRawContentBlockStartEvent(
                    type="content_block_start",
                    index=indice,
                    content_block=BetaTextBlock(type="text", text=""),
                )
            )
            eventos.extend(
                BetaRawContentBlockDeltaEvent(
                    type="content_block_delta",
                    index=indice,
                    delta=BetaTextDelta(type="text_delta", text=pedaco),
                )
                for pedaco in bloco.pedacos
            )
        else:
            eventos.append(
                BetaRawContentBlockStartEvent(
                    type="content_block_start",
                    index=indice,
                    content_block=BetaToolUseBlock(
                        type="tool_use", id=f"toolu_{indice}", name=bloco.nome, input={}
                    ),
                )
            )
            eventos.append(
                BetaRawContentBlockDeltaEvent(
                    type="content_block_delta",
                    index=indice,
                    delta=BetaInputJSONDelta(
                        type="input_json_delta", partial_json=json.dumps(bloco.entrada)
                    ),
                )
            )
        eventos.append(
            BetaRawContentBlockStopEvent(type="content_block_stop", index=indice)
        )
    eventos.append(
        BetaRawMessageDeltaEvent(
            type="message_delta",
            delta=DeltaDaMensagem(
                stop_reason=roteiro.stop_reason
                or ("tool_use" if tem_ferramenta else "end_turn"),
                stop_sequence="FIM" if roteiro.stop_reason == "stop_sequence" else None,
            ),
            usage=BetaMessageDeltaUsage(
                output_tokens=1, iterations=_uso_da_troca(substituicao)
            ),
        )
    )
    eventos.append(BetaRawMessageStopEvent(type="message_stop"))
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
            # `by_alias`: o bloco `fallback` sai com `from`, o nome do fio, e
            # nao `from_`, o do Python (medido; os outros eventos nao mudam).
            dados = evento.model_dump_json(by_alias=True)
            self.wfile.write(f"event: {evento.type}\ndata: {dados}\n\n".encode())
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
