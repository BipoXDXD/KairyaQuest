"""Le o stream do provedor com um teto de tempo TOTAL, medido de parede.

Serve o chat da tutoria (`transmitir`) e a avaliacao (`ProvedorAnthropic.avaliar`,
que consome um stream por dentro): o mesmo leitor, o mesmo gauge, o mesmo teto.

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
cancelamento na proxima volta da leitura e fecha o stream. Essa volta e o
proximo evento REAL do provedor ou o fim do stream pelo servidor: o timeout por
leitura do SDK NAO a limita, porque o SDK descarta os `ping` e eles reiniciam o
timer de leitura do socket (um modelo lento que manda pings mantem a thread e a
conexao vivas). O que o teto garante e o consumidor liberado no instante certo;
o stream do provedor fecha por conta do leitor, sem prazo proprio.

Esses leitores que sobrevivem ao consumidor sao contados (`LeitoresVivos`) e
limitados: acima de `TETO_DE_LEITORES_VIVOS` o stream NOVO e recusado antes de
abrir a chamada ao provedor, com o erro de um provedor indisponivel. Recusar e
a unica saida segura: nao ha como cancelar uma thread presa numa leitura de
socket (`docs/handoff/2026-11-11-leitores-vivos.md`).
"""

import logging
import queue
import threading
import time
from collections.abc import Callable, Generator
from dataclasses import dataclass
from typing import cast

from focusquest.modules.tutoring.provider import (
    ProvedorIndisponivelError,
    TempoEsgotadoError,
)

_LOG = logging.getLogger(__name__)

# Como o log chama o que esta sendo lido: o chat da tutoria (padrao) e a
# avaliacao, que reaproveita o mesmo leitor, o mesmo gauge e o mesmo teto.
ROTULO_DO_STREAM = "stream da tutoria"
ROTULO_DA_AVALIACAO = "stream da avaliacao"


# O recurso protegido e o do processo: cada leitor orfao ocupa uma thread, um
# socket/FD e uma conexao ao provedor. O leitor e `threading.Thread` daemon e
# NAO consome ficha do limiter do anyio; so o `next()` do consumidor consome (e
# e liberado no teto de 54 s). O 40 e uma escolha de DIMENSIONAMENTO: igual ao
# total do limiter padrao do anyio (40), para que consumidores ativos mais
# leitores orfaos fiquem na mesma ordem de grandeza do que o servidor ja admite
# por processo. Nao e prova de esgotamento do limiter. O teste
# `test_o_teto_acompanha_o_numero_do_limiter_padrao_do_anyio` amarra o NUMERO,
# nao a premissa.
TETO_DE_LEITORES_VIVOS = 40


class LeitoresVivos:
    """O gauge de leitores vivos e o seu teto, thread-safe.

    `reservar` confere e incrementa sob o MESMO lock (nada de checa-e-depois-
    age): N threads disputando a ultima vaga, so uma vence. Quem reserva deve
    `liberar` exatamente uma vez, aconteca o que acontecer: `_Vaga` garante isso
    por leitor.
    """

    def __init__(self, teto: int = TETO_DE_LEITORES_VIVOS) -> None:
        if teto < 1:
            raise ValueError(f"o teto de leitores precisa ser positivo: {teto}")
        self.teto = teto
        self._vivos = 0
        self._trava = threading.Lock()

    @property
    def vivos(self) -> int:
        """Quantos leitores estao vivos agora (para o codigo e para o log)."""
        with self._trava:
            return self._vivos

    def reservar(self) -> bool:
        """Toma uma vaga; `False`, sem tomar nada, se o teto ja esta cheio."""
        with self._trava:
            if self._vivos >= self.teto:
                return False
            self._vivos += 1
            return True

    def liberar(self) -> int:
        """Devolve uma vaga e diz quantos leitores seguem vivos."""
        with self._trava:
            if self._vivos == 0:
                # Um decremento a mais esconderia um vazamento noutro lugar.
                raise RuntimeError("liberar um leitor sem reserva")
            self._vivos -= 1
            return self._vivos


LEITORES_VIVOS = LeitoresVivos()


class _Vaga:
    """A vaga de UM leitor: liberacao idempotente, sob lock.

    Duas saidas podem devolver a mesma vaga (a thread do leitor ao terminar e
    `ler_com_prazo` se `start()` lancar depois de a thread ter nascido). Sem
    este objeto, a segunda liberacao decrementaria a vaga de OUTRO leitor.
    """

    def __init__(self, leitores: LeitoresVivos) -> None:
        self._leitores = leitores
        self._trava = threading.Lock()
        self._tomada = False

    def reservar(self) -> bool:
        with self._trava:
            self._tomada = self._leitores.reservar()
            return self._tomada

    def liberar(self) -> int:
        """Devolve a vaga uma unica vez; leitores vivos depois da chamada."""
        with self._trava:
            if not self._tomada:
                return self._leitores.vivos
            self._tomada = False
            return self._leitores.liberar()


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
    vaga: _Vaga,
    espera: Espera,
) -> None:
    """A thread do leitor: dona da leitura, do fechamento do stream e da vaga."""
    try:
        inicio = espera.monotonic()
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
    finally:
        vivos = vaga.liberar()
        if cancelado.is_set():
            # Sobreviveu ao consumidor: e o que o gauge existe para medir.
            _LOG.info(
                "leitor da tutoria encerrou depois do consumidor: "
                "vida_ms=%d leitores_vivos=%d",
                round((espera.monotonic() - inicio) * 1000),
                vivos,
            )


def ler_com_prazo[E](
    eventos: Generator[E],
    *,
    teto_segundos: float,
    espera: Espera = ESPERA_REAL,
    leitores: LeitoresVivos | None = None,
    rotulo: str = ROTULO_DO_STREAM,
) -> Generator[E]:
    """Os eventos de `eventos`, com `teto_segundos` de parede para o stream todo.

    O teto conta do primeiro `next()`: inclui a conexao, a espera pelos
    cabecalhos e cada silencio entre eventos. Estourou: levanta
    `TempoEsgotadoError` e registra o tempo usado (so numeros, nunca o texto).
    Fechar este gerador, ou ele terminar de qualquer forma, cancela o leitor.

    Antes de abrir a chamada, reserva uma vaga no gauge de leitores vivos
    (`leitores`, por padrao o do processo, resolvido a cada chamada). Sem vaga,
    levanta `ProvedorIndisponivelError` sem ter iniciado `eventos` (a chamada
    paga nunca abre); o leitor devolve a vaga ao terminar, de qualquer forma.
    """
    leitores = LEITORES_VIVOS if leitores is None else leitores
    # Tudo o que pode lancar (Queue, Event, Thread) nasce ANTES da reserva: entre
    # `reservar()` e o `try` do `start()` nao ha nada que possa deixar a vaga presa.
    # Fila sem limite de proposito: o leitor so empilha o que o provedor emite, e
    # uma resposta tem o teto de `max_tokens` (centenas de eventos).
    fila: queue.Queue[object] = queue.Queue()
    cancelado = threading.Event()
    vaga = _Vaga(leitores)
    leitor = threading.Thread(
        target=_ler,
        args=(eventos, fila, cancelado, vaga, espera),
        name="tutoria-leitor",
        daemon=True,
    )
    inicio = espera.monotonic()
    if not vaga.reservar():
        eventos.close()
        _LOG.warning(
            "%s recusado: leitores_vivos=%d teto=%d",
            rotulo,
            leitores.vivos,
            leitores.teto,
        )
        raise ProvedorIndisponivelError("leitores do provedor acima do teto")
    try:
        leitor.start()
    except BaseException:
        # Se a thread chegou a nascer, que pare; a vaga volta uma unica vez (a
        # liberacao do leitor e a daqui sao idempotentes por vaga).
        cancelado.set()
        vaga.liberar()
        raise
    entregues = 0
    try:
        while True:
            restante = teto_segundos - (espera.monotonic() - inicio)
            try:
                if restante <= 0:
                    # O tempo acabou, mas o que o leitor JA enfileirou e
                    # aproveitado: uma resposta completa nao vira `falhou` so
                    # porque o relogio passou entre dois itens. Fila vazia e
                    # tempo esgotado: sem espera nenhuma.
                    item = fila.get_nowait()
                else:
                    item = espera.esperar(fila, restante)
            except queue.Empty:
                _LOG.warning(
                    "%s passou do teto: decorrido_ms=%d teto_ms=%d eventos=%d",
                    rotulo,
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
