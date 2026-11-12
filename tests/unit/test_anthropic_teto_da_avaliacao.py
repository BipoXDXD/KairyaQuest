"""O teto de tempo TOTAL da avaliacao (P-teto-stream-1), sem `sleep` nem rede.

`avaliar` consome por dentro um stream (`messages.stream`), e nao uma resposta
unica: o timeout do SDK e o `read` do httpx, que limita o SILENCIO entre dois
bytes. O SDK descarta o `ping` (ver a premissa abaixo), mas os bytes do `ping`
reiniciam esse relogio: um provedor que pinga, ou que manda um evento a cada
50 s, mantem a chamada viva muito alem dos 54 s e dos 60 s que o proxy tolera
depois da folga do orfao. A conferencia do servico (`clock() - inicio >
limite`) so roda quando a chamada VOLTA.

Estes testes provam que `avaliar` corta no teto de parede mesmo sem evento
nenhum. O leitor e a fila sao os de verdade (`leitura.ler_com_prazo`); o tempo
so anda quando o falso diz que andou, como em `test_tutoring_teto_do_stream`.
"""

import logging
import math
import queue
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any, cast

import anthropic
import httpx2
import pytest
from anthropic import Stream
from anthropic.types import RawMessageStreamEvent, ToolUseBlock

from focusquest.modules.tutoring import leitura
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.leitura import Espera, LeitoresVivos
from focusquest.modules.tutoring.provider import (
    ProvedorIndisponivelError,
    TempoEsgotadoError,
)
from unit.anthropic_falso import FERRAMENTA, TURNO

# O limite de producao (`Settings.tutor_timeout_seconds`).
TETO = 54.0
ESPERA_DO_LEITOR = 5.0


def _meio() -> SimpleNamespace:
    """Um evento qualquer que nao termina a resposta."""
    return SimpleNamespace(
        type="message_delta", delta=SimpleNamespace(stop_reason=None)
    )


def _fim_com_veredito() -> list[Any]:
    bloco = ToolUseBlock(
        id="toolu_1",
        input={"verdict": "atende"},
        name=FERRAMENTA.nome,
        type="tool_use",
    )
    return [
        SimpleNamespace(type="content_block_stop", content_block=bloco),
        SimpleNamespace(
            type="message_delta", delta=SimpleNamespace(stop_reason="tool_use")
        ),
        SimpleNamespace(type="message_stop"),
    ]


class _Stream:
    """O stream do provedor: entrega `eventos` e pode TRAVAR de verdade (uma
    thread bloqueada, como a leitura do socket) ate `liberar`."""

    def __init__(
        self,
        eventos: tuple[Any, ...] = (),
        *,
        travar_no_fim: bool = False,
        erro: Exception | None = None,
    ) -> None:
        self._eventos = eventos
        self._travar_no_fim = travar_no_fim
        self._erro = erro
        self.aberto = threading.Event()
        self.travou = threading.Event()
        self.liberar = threading.Event()
        self.fechado = threading.Event()

    def __iter__(self) -> Iterator[Any]:
        yield from self._eventos
        if self._erro is not None:
            raise self._erro
        if self._travar_no_fim:
            self.travou.set()
            assert self.liberar.wait(ESPERA_DO_LEITOR), "o teste nao liberou"
            yield _meio()


class _Mensagens:
    def __init__(self, corpo: _Stream) -> None:
        self._corpo = corpo
        self.pedidos: list[dict[str, Any]] = []

    @contextmanager
    def stream(self, **kwargs: Any) -> Iterator[_Stream]:
        self.pedidos.append(kwargs)
        self._corpo.aberto.set()
        try:
            yield self._corpo
        finally:
            self._corpo.fechado.set()


class EsperaFalsa:
    """O relogio e a espera pela fila, sem tempo real.

    O evento `i` leva `atrasos[i]` segundos para chegar depois do anterior; sem
    atraso listado, nunca chega (`math.inf`: o provedor calou).
    """

    def __init__(self, atrasos: tuple[float, ...]) -> None:
        self.agora = 1000.0
        self.inicio = self.agora
        self._atrasos: Iterator[float] = iter(atrasos)

    def monotonic(self) -> float:
        return self.agora

    def esperar(self, fila: queue.Queue[object], segundos: float) -> object:
        atraso = next(self._atrasos, math.inf)
        if atraso > segundos:
            self.agora += segundos
            raise queue.Empty
        item = fila.get(timeout=ESPERA_DO_LEITOR)
        self.agora += atraso
        return item

    @property
    def injetavel(self) -> Espera:
        return Espera(monotonic=self.monotonic, esperar=self.esperar)

    @property
    def decorrido(self) -> float:
        return self.agora - self.inicio


def _provedor(
    monkeypatch: pytest.MonkeyPatch, corpo: _Stream, espera: EsperaFalsa
) -> tuple[ProvedorAnthropic, _Mensagens]:
    mensagens = _Mensagens(corpo)
    cliente = SimpleNamespace(messages=mensagens)
    monkeypatch.setattr(anthropic, "Anthropic", lambda **_: cliente)
    provedor = ProvedorAnthropic(
        chave="sk-ant-ficticia",
        base_url="http://127.0.0.1:9",
        modelo="claude-sonnet-5-5",
        max_tokens=256,
        timeout_segundos=TETO,
        fallback=False,
        esforco="low",
        esforco_da_avaliacao="medium",
        espera=espera.injetavel,
    )
    return provedor, mensagens


def _leitores_da_tutoria() -> list[threading.Thread]:
    return [t for t in threading.enumerate() if t.name == "tutoria-leitor"]


def _esperar_o_leitor_terminar() -> None:
    for leitor in _leitores_da_tutoria():
        leitor.join(timeout=ESPERA_DO_LEITOR)
    assert _leitores_da_tutoria() == []


def test_a_premissa_o_sdk_nao_entrega_o_ping_mas_os_bytes_dele_chegam() -> None:
    # O SDK descarta o `ping` (`anthropic/_streaming.py`: `if sse.event ==
    # "ping": continue`): o consumidor nao ve evento nenhum, e o `read` do
    # httpx, que conta bytes recebidos, reinicia a cada `ping`. Por isso o
    # timeout por leitura nao limita o total. Se o SDK mudar isto, o teto de
    # parede deve ser revisto junto.
    corpo = b'event: ping\ndata: {"type": "ping"}\n\n' * 3
    resposta = httpx2.Response(
        200, content=corpo, headers={"content-type": "text/event-stream"}
    )
    cliente = anthropic.Anthropic(api_key="x", base_url="http://127.0.0.1:9")
    assert (
        list(
            Stream(
                cast_to=cast(Any, RawMessageStreamEvent),
                response=resposta,
                client=cliente,
            )
        )
        == []
    )


def test_o_stream_que_goteja_e_cortado_no_teto_de_parede(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    # Um evento chega em 50 s (dentro do timeout por leitura do SDK) e o
    # provedor segue pingando. Sem o teto, a avaliacao so voltaria quando o
    # stream terminasse, passando dos 60 s do orcamento.
    corpo = _Stream((_meio(),), travar_no_fim=True)
    espera = EsperaFalsa(atrasos=(50.0,))
    provedor, _ = _provedor(monkeypatch, corpo, espera)

    with caplog.at_level(logging.WARNING), pytest.raises(TempoEsgotadoError):
        provedor.avaliar(TURNO, FERRAMENTA)

    # Cortou NO teto, nem um segundo depois.
    assert espera.decorrido == TETO
    assert [r.getMessage() for r in caplog.records if "teto" in r.getMessage()] == [
        "stream da avaliacao passou do teto: decorrido_ms=54000 teto_ms=54000 eventos=1"
    ]
    # O leitor segue preso na leitura; ao acordar, ve o cancelamento, fecha o
    # stream do provedor e termina.
    assert corpo.travou.wait(ESPERA_DO_LEITOR)
    corpo.liberar.set()
    _esperar_o_leitor_terminar()
    assert corpo.fechado.is_set()


def test_o_provedor_que_nao_manda_nada_e_cortado_no_teto_de_parede(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    corpo = _Stream(travar_no_fim=True)
    espera = EsperaFalsa(atrasos=())
    provedor, _ = _provedor(monkeypatch, corpo, espera)

    with pytest.raises(TempoEsgotadoError):
        provedor.avaliar(TURNO, FERRAMENTA)

    assert espera.decorrido == TETO
    corpo.liberar.set()
    _esperar_o_leitor_terminar()


def test_o_stream_que_termina_dentro_do_teto_devolve_a_entrada(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    corpo = _Stream(tuple(_fim_com_veredito()))
    espera = EsperaFalsa(atrasos=(1.0, 1.0, 1.0, 0.0))
    provedor, mensagens = _provedor(monkeypatch, corpo, espera)

    assert provedor.avaliar(TURNO, FERRAMENTA) == {"verdict": "atende"}

    assert len(mensagens.pedidos) == 1
    assert corpo.fechado.is_set()
    _esperar_o_leitor_terminar()


@pytest.mark.parametrize(
    ("erro", "esperado"),
    [
        pytest.param(
            httpx2.ReadTimeout("lento"), TempoEsgotadoError, id="read-timeout"
        ),
        pytest.param(
            httpx2.ConnectError("recusada"), ProvedorIndisponivelError, id="conexao"
        ),
    ],
)
def test_o_erro_do_transporte_dentro_do_leitor_sobe_traduzido(
    monkeypatch: pytest.MonkeyPatch, erro: Exception, esperado: type[Exception]
) -> None:
    corpo = _Stream(erro=erro)
    provedor, _ = _provedor(monkeypatch, corpo, EsperaFalsa(atrasos=(0.0,)))

    with pytest.raises(esperado):
        provedor.avaliar(TURNO, FERRAMENTA)

    _esperar_o_leitor_terminar()


def test_com_o_gauge_cheio_a_avaliacao_e_recusada_sem_abrir_a_chamada(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cheio = LeitoresVivos(teto=1)
    assert cheio.reservar()
    monkeypatch.setattr(leitura, "LEITORES_VIVOS", cheio)
    corpo = _Stream(tuple(_fim_com_veredito()))
    provedor, mensagens = _provedor(monkeypatch, corpo, EsperaFalsa(atrasos=()))

    with pytest.raises(ProvedorIndisponivelError):
        provedor.avaliar(TURNO, FERRAMENTA)

    assert mensagens.pedidos == []
    assert not corpo.aberto.is_set()
    assert cheio.vivos == 1


def test_o_leitor_devolve_a_vaga_do_gauge_ao_terminar(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    gauge = LeitoresVivos(teto=1)
    monkeypatch.setattr(leitura, "LEITORES_VIVOS", gauge)
    corpo = _Stream(tuple(_fim_com_veredito()))
    provedor, _ = _provedor(
        monkeypatch, corpo, EsperaFalsa(atrasos=(1.0, 1.0, 1.0, 0.0))
    )

    provedor.avaliar(TURNO, FERRAMENTA)
    _esperar_o_leitor_terminar()

    assert gauge.vivos == 0
