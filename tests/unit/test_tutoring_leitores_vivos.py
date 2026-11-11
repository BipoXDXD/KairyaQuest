"""O gauge e o teto de leitores vivos do stream da tutoria (P-teto-stream-2).

O leitor do stream (`tutoria-leitor`) e uma thread daemon que o consumidor
abandona ao estourar o teto de parede; com `ping` do provedor ela pode seguir
viva ate o proximo evento real. Estes testes provam quatro coisas:

1. o contador de vivos e exato: sobe ao reservar, desce ao liberar, e a vaga
   volta em TODO fim do leitor (normal, erro, cancelado) e se a thread nem
   chega a iniciar;
2. a reserva e atomica: N threads disputando a ultima vaga, so uma vence;
3. acima do teto o stream e recusado ANTES de abrir a chamada ao provedor, com
   o erro que um provedor indisponivel ja produz;
4. o teto vale a premissa que o motiva: o limiter padrao de threads do anyio.

Sem `sleep`: o que precisa esperar espera por `Event` ou por `join` da thread,
e o relogio do leitor e o falso de `Espera`.
"""

import logging
import queue
import threading
import types
from collections.abc import Generator

import anyio
import anyio.to_thread
import pytest

from focusquest.modules.tutoring import leitura
from focusquest.modules.tutoring.leitura import (
    TETO_DE_LEITORES_VIVOS,
    Espera,
    LeitoresVivos,
    ler_com_prazo,
)
from focusquest.modules.tutoring.provider import ProvedorIndisponivelError

ESPERA_DO_TESTE = 5.0
TETO_DO_STREAM = 54.0


class _Relogio:
    """Um relogio que so anda quando o teste manda."""

    def __init__(self) -> None:
        self.agora = 1000.0

    def monotonic(self) -> float:
        return self.agora

    @staticmethod
    def esperar(fila: queue.Queue[object], segundos: float) -> object:
        return fila.get(timeout=ESPERA_DO_TESTE)

    @property
    def injetavel(self) -> Espera:
        return Espera(monotonic=self.monotonic, esperar=self.esperar)


def _leitores_da_tutoria() -> list[threading.Thread]:
    return [t for t in threading.enumerate() if t.name == "tutoria-leitor"]


def _esperar_os_leitores() -> None:
    for leitor in _leitores_da_tutoria():
        leitor.join(timeout=ESPERA_DO_TESTE)
    assert _leitores_da_tutoria() == []


class _Stream:
    """Um stream de provedor que registra se o corpo chegou a rodar e se foi
    fechado, e que pode travar numa leitura ate o teste liberar."""

    def __init__(
        self,
        eventos: tuple[str, ...] = (),
        *,
        travar: bool = False,
        erro: Exception | None = None,
    ) -> None:
        self._eventos = eventos
        self._travar = travar
        self._erro = erro
        self.iniciou = threading.Event()
        self.travou = threading.Event()
        self.liberar = threading.Event()
        self.fechado = threading.Event()

    def gerar(self) -> Generator[str]:
        self.iniciou.set()
        try:
            yield from self._eventos
            if self._erro is not None:
                raise self._erro
            if self._travar:
                self.travou.set()
                assert self.liberar.wait(ESPERA_DO_TESTE), "o teste nao liberou"
                yield "depois-do-teto"
        finally:
            self.fechado.set()


def test_o_teto_e_o_do_limiter_padrao_de_threads_do_anyio() -> None:
    # A premissa do 40: `transmitir` sincrona roda no threadpool do anyio, cujo
    # limiter padrao vale 40. Se o anyio mudar o padrao, este teste pede que o
    # teto seja revisto junto, em vez de divergir calado.
    async def total_de_tokens() -> float:
        return anyio.to_thread.current_default_thread_limiter().total_tokens

    assert anyio.run(total_de_tokens) == TETO_DE_LEITORES_VIVOS == 40


def test_o_gauge_sobe_ao_reservar_e_desce_ao_liberar() -> None:
    leitores = LeitoresVivos(teto=3)
    assert leitores.vivos == 0

    assert leitores.reservar()
    assert leitores.reservar()
    assert leitores.vivos == 2

    leitores.liberar()
    assert leitores.vivos == 1
    leitores.liberar()
    assert leitores.vivos == 0


def test_o_teto_recusa_a_reserva_de_numero_teto_mais_um() -> None:
    leitores = LeitoresVivos(teto=TETO_DE_LEITORES_VIVOS)
    for _ in range(TETO_DE_LEITORES_VIVOS):
        assert leitores.reservar()

    assert not leitores.reservar()
    # A recusa nao consome vaga nem estraga o contador.
    assert leitores.vivos == TETO_DE_LEITORES_VIVOS

    leitores.liberar()
    assert leitores.reservar()


def test_liberar_sem_reserva_falha_alto() -> None:
    # Um decremento a mais esconderia vazamento em outro lugar: falha.
    with pytest.raises(RuntimeError, match="sem reserva"):
        LeitoresVivos(teto=3).liberar()


@pytest.mark.parametrize("teto", [0, -1])
def test_teto_invalido_e_recusado(teto: int) -> None:
    with pytest.raises(ValueError, match="teto"):
        LeitoresVivos(teto=teto)


def test_n_threads_disputando_a_ultima_vaga_so_uma_vence() -> None:
    teto = 8
    disputantes = 64
    leitores = LeitoresVivos(teto=teto)
    for _ in range(teto - 1):
        assert leitores.reservar()
    largada = threading.Barrier(disputantes)
    venceu: list[bool] = []
    trava = threading.Lock()

    def disputar() -> None:
        largada.wait(ESPERA_DO_TESTE)
        ganhou = leitores.reservar()
        with trava:
            venceu.append(ganhou)

    threads = [threading.Thread(target=disputar) for _ in range(disputantes)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(ESPERA_DO_TESTE)

    assert len(venceu) == disputantes
    assert venceu.count(True) == 1
    assert leitores.vivos == teto


def test_a_disputa_nunca_passa_do_teto_do_stream() -> None:
    disputantes = 4 * TETO_DE_LEITORES_VIVOS
    leitores = LeitoresVivos(teto=TETO_DE_LEITORES_VIVOS)
    largada = threading.Barrier(disputantes)
    venceu: list[bool] = []
    trava = threading.Lock()

    def disputar() -> None:
        largada.wait(ESPERA_DO_TESTE)
        ganhou = leitores.reservar()
        with trava:
            venceu.append(ganhou)

    threads = [threading.Thread(target=disputar) for _ in range(disputantes)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(ESPERA_DO_TESTE)

    assert venceu.count(True) == TETO_DE_LEITORES_VIVOS
    assert leitores.vivos == TETO_DE_LEITORES_VIVOS


def test_com_o_teto_cheio_o_proximo_stream_e_recusado_sem_abrir_o_provedor() -> None:
    leitores = LeitoresVivos(teto=TETO_DE_LEITORES_VIVOS)
    for _ in range(TETO_DE_LEITORES_VIVOS):
        assert leitores.reservar()
    stream = _Stream(("a", "b"))

    # O erro e o que um provedor indisponivel ja produz: o servico o traduz em
    # `falhou` / `provedor_indisponivel`, sem codigo novo.
    with pytest.raises(ProvedorIndisponivelError):
        list(
            ler_com_prazo(
                stream.gerar(),
                teto_segundos=TETO_DO_STREAM,
                espera=_Relogio().injetavel,
                leitores=leitores,
            )
        )

    assert not stream.iniciou.is_set()  # o corpo (a chamada paga) nunca rodou
    assert _leitores_da_tutoria() == []  # nem thread nasceu
    assert leitores.vivos == TETO_DE_LEITORES_VIVOS  # a recusa nao mexe no gauge


def test_a_recusa_fecha_o_gerador_do_provedor_que_nao_foi_usado() -> None:
    leitores = LeitoresVivos(teto=1)
    assert leitores.reservar()
    stream = _Stream(("a",))
    gerador = stream.gerar()

    with pytest.raises(ProvedorIndisponivelError):
        next(
            ler_com_prazo(
                gerador,
                teto_segundos=TETO_DO_STREAM,
                espera=_Relogio().injetavel,
                leitores=leitores,
            )
        )

    # Fechado sem nunca ter rodado: um proximo `next` ja nao tem o que ler.
    with pytest.raises(StopIteration):
        next(gerador)
    assert not stream.iniciou.is_set()


def test_a_recusa_vai_para_o_log_so_com_numeros(
    caplog: pytest.LogCaptureFixture,
) -> None:
    leitores = LeitoresVivos(teto=2)
    leitores.reservar()
    leitores.reservar()

    with (
        caplog.at_level(logging.WARNING, logger=leitura.__name__),
        pytest.raises(ProvedorIndisponivelError),
    ):
        list(
            ler_com_prazo(
                _Stream(("texto-do-usuario",)).gerar(),
                teto_segundos=TETO_DO_STREAM,
                espera=_Relogio().injetavel,
                leitores=leitores,
            )
        )

    assert [r.getMessage() for r in caplog.records] == [
        "stream da tutoria recusado: leitores_vivos=2 teto=2"
    ]


def test_a_vaga_volta_quando_o_stream_termina_normalmente() -> None:
    leitores = LeitoresVivos(teto=2)
    stream = _Stream(("a", "b"))

    lidos = list(
        ler_com_prazo(
            stream.gerar(),
            teto_segundos=TETO_DO_STREAM,
            espera=_Relogio().injetavel,
            leitores=leitores,
        )
    )

    assert lidos == ["a", "b"]
    _esperar_os_leitores()
    assert leitores.vivos == 0


def test_a_vaga_volta_quando_o_provedor_levanta() -> None:
    leitores = LeitoresVivos(teto=2)
    stream = _Stream(("a",), erro=ProvedorIndisponivelError("caiu"))

    with pytest.raises(ProvedorIndisponivelError, match="caiu"):
        list(
            ler_com_prazo(
                stream.gerar(),
                teto_segundos=TETO_DO_STREAM,
                espera=_Relogio().injetavel,
                leitores=leitores,
            )
        )

    _esperar_os_leitores()
    assert leitores.vivos == 0


def test_a_vaga_so_volta_quando_o_leitor_cancelado_sai_da_leitura() -> None:
    # O consumidor sai (fechou o gerador), mas o leitor segue preso na leitura
    # do provedor: a vaga continua ocupada ate ele voltar. E ISSO que o gauge
    # mede: leitores que sobrevivem ao consumidor.
    leitores = LeitoresVivos(teto=2)
    stream = _Stream(("a",), travar=True)
    consumidor = ler_com_prazo(
        stream.gerar(),
        teto_segundos=TETO_DO_STREAM,
        espera=_Relogio().injetavel,
        leitores=leitores,
    )
    assert next(consumidor) == "a"
    assert stream.travou.wait(ESPERA_DO_TESTE)

    consumidor.close()

    assert leitores.vivos == 1  # o consumidor saiu; o leitor, nao
    stream.liberar.set()
    assert stream.fechado.wait(ESPERA_DO_TESTE)
    _esperar_os_leitores()
    assert leitores.vivos == 0


def test_o_leitor_que_sobrevive_ao_consumidor_deixa_o_tempo_no_log(
    caplog: pytest.LogCaptureFixture,
) -> None:
    leitores = LeitoresVivos(teto=2)
    relogio = _Relogio()
    stream = _Stream(("a",), travar=True)
    consumidor = ler_com_prazo(
        stream.gerar(),
        teto_segundos=TETO_DO_STREAM,
        espera=relogio.injetavel,
        leitores=leitores,
    )
    assert next(consumidor) == "a"
    assert stream.travou.wait(ESPERA_DO_TESTE)
    consumidor.close()
    relogio.agora += 77.0  # o leitor vive 77 s de relogio falso

    with caplog.at_level(logging.INFO, logger=leitura.__name__):
        stream.liberar.set()
        assert stream.fechado.wait(ESPERA_DO_TESTE)
        _esperar_os_leitores()

    assert [r.getMessage() for r in caplog.records] == [
        "leitor da tutoria encerrou depois do consumidor: "
        "vida_ms=77000 leitores_vivos=0"
    ]


def test_o_leitor_que_termina_com_o_consumidor_presente_nao_gera_log(
    caplog: pytest.LogCaptureFixture,
) -> None:
    leitores = LeitoresVivos(teto=2)

    with caplog.at_level(logging.DEBUG, logger=leitura.__name__):
        list(
            ler_com_prazo(
                _Stream(("a",)).gerar(),
                teto_segundos=TETO_DO_STREAM,
                espera=_Relogio().injetavel,
                leitores=leitores,
            )
        )
        _esperar_os_leitores()

    assert caplog.records == []


def test_a_vaga_volta_se_a_thread_do_leitor_nao_consegue_iniciar(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class ThreadQueNaoInicia(threading.Thread):
        def start(self) -> None:
            raise RuntimeError("can't start new thread")

    leitores = LeitoresVivos(teto=2)
    monkeypatch.setattr(
        leitura,
        "threading",
        types.SimpleNamespace(Thread=ThreadQueNaoInicia, Event=threading.Event),
    )

    with pytest.raises(RuntimeError, match="can't start new thread"):
        list(
            ler_com_prazo(
                _Stream(("a",)).gerar(),
                teto_segundos=TETO_DO_STREAM,
                espera=_Relogio().injetavel,
                leitores=leitores,
            )
        )

    assert leitores.vivos == 0


def test_o_gauge_global_e_o_que_o_stream_usa_por_padrao(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert leitura.LEITORES_VIVOS.teto == TETO_DE_LEITORES_VIVOS
    # Sem `leitores=`, o stream consulta o gauge do modulo (resolvido na hora
    # da chamada, nao na definicao): um gauge cheio o recusa.
    cheio = LeitoresVivos(teto=1)
    assert cheio.reservar()
    monkeypatch.setattr(leitura, "LEITORES_VIVOS", cheio)

    with pytest.raises(ProvedorIndisponivelError):
        list(
            ler_com_prazo(
                _Stream(("a",)).gerar(),
                teto_segundos=TETO_DO_STREAM,
                espera=_Relogio().injetavel,
            )
        )
