"""Le o stream do provedor com um teto de tempo TOTAL, medido de parede.

O timeout do SDK e por LEITURA (a espera entre dois chunks): um provedor que
manda um evento a cada 50 s o mantem vivo para sempre, e um que cala depois de
um evento so e cortado `timeout` depois dele, qualquer que seja o momento
(pendencia P-orcamento-tempo-1). O teto total que o servico conferia dependia
de um evento chegar. Aqui a leitura bloqueante fica numa thread propria e quem
consome espera pela fila SO ate o teto: estourou, o consumidor sai com
`TempoEsgotadoError` sem depender de evento nenhum.

O fechamento do stream do provedor e sempre da thread que o le. Um `close()`
vindo de outra thread em cima de um gerador que esta executando levanta
`ValueError`, e fechar o socket por fora nao acorda uma leitura bloqueada de
forma portavel. Estourado o teto (ou fechado o consumidor), o leitor ve o
cancelamento na proxima volta da leitura e fecha o stream; se o provedor
calou, essa volta e o timeout por leitura do SDK, no maximo `timeout` depois,
e a thread termina sozinha. O que o teto garante e o consumidor liberado no
instante certo; o stream do provedor fecha por conta do leitor, em tempo
limitado.
"""

import logging
import queue
import threading
import time
from collections.abc import Callable, Generator
from dataclasses import dataclass
from typing import cast

from focusquest.modules.tutoring.provider import TempoEsgotadoError

_LOG = logging.getLogger(__name__)


def _esperar_na_fila(fila: queue.Queue[object], segundos: float) -> object:
    """O proximo item da fila, ou `queue.Empty` se `segundos` passarem."""
    return fila.get(timeout=segundos)


@dataclass(frozen=True)
class Espera:
    """O relogio de parede e a espera pela fila, injetaveis.

    Em producao sao o `time.monotonic` e o `Queue.get(timeout=...)`. Os testes
    trocam os dois por um falso que anda o tempo sem dormir (a espera real de
    54 s seria o proprio teste). O relogio e MONOTONICO, e nao o `Clock` do
    servico: o teto e uma duracao, e um ajuste de relogio de parede (NTP) no
    meio do stream nao pode encurtar nem esticar a espera.
    """

    monotonic: Callable[[], float] = time.monotonic
    esperar: Callable[[queue.Queue[object], float], object] = _esperar_na_fila


ESPERA_REAL = Espera()


class _Fim:
    """O provedor terminou o stream sem erro."""


@dataclass(frozen=True)
class _Falha:
    """O provedor levantou: o consumidor relevanta o MESMO erro."""

    erro: BaseException


def _ler(
    eventos: Generator[object],
    fila: queue.Queue[object],
    cancelado: threading.Event,
) -> None:
    """A thread do leitor: dona da leitura e do fechamento do stream."""
    try:
        for evento in eventos:
            if cancelado.is_set():
                break
            fila.put(evento)
        else:
            fila.put(_Fim())
    except BaseException as erro:
        # Repassada ao consumidor, que a relevanta: nada e engolido.
        fila.put(_Falha(erro))
    finally:
        eventos.close()


def ler_com_prazo[E](
    eventos: Generator[E],
    *,
    teto_segundos: float,
    espera: Espera = ESPERA_REAL,
) -> Generator[E]:
    """Os eventos de `eventos`, com `teto_segundos` de parede para o stream todo.

    O teto conta do primeiro `next()`: inclui a conexao, a espera pelos
    cabecalhos e cada silencio entre eventos. Estourou: levanta
    `TempoEsgotadoError` e registra o tempo usado (so numeros, nunca o texto).
    Fechar este gerador, ou ele terminar de qualquer forma, cancela o leitor.
    """
    # Fila sem limite de proposito: o leitor so empilha o que o provedor emite, e
    # uma resposta tem o teto de `max_tokens` (centenas de eventos).
    fila: queue.Queue[object] = queue.Queue()
    cancelado = threading.Event()
    leitor = threading.Thread(
        target=_ler,
        args=(eventos, fila, cancelado),
        name="tutoria-leitor",
        daemon=True,
    )
    inicio = espera.monotonic()
    entregues = 0
    leitor.start()
    try:
        while True:
            restante = teto_segundos - (espera.monotonic() - inicio)
            try:
                if restante <= 0:
                    raise queue.Empty
                item = espera.esperar(fila, restante)
            except queue.Empty:
                _LOG.warning(
                    "stream da tutoria passou do teto: "
                    "decorrido_ms=%d teto_ms=%d eventos=%d",
                    round((espera.monotonic() - inicio) * 1000),
                    round(teto_segundos * 1000),
                    entregues,
                )
                raise TempoEsgotadoError("o stream passou do teto de tempo") from None
            if isinstance(item, _Fim):
                leitor.join()
                return
            if isinstance(item, _Falha):
                leitor.join()
                raise item.erro
            entregues += 1
            yield cast(E, item)
    finally:
        cancelado.set()
