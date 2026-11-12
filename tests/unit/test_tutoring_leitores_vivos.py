"""O gauge e o teto de leitores vivos do stream da tutoria (P-teto-stream-2).

O leitor do stream (`tutoria-leitor`) e uma thread daemon que o consumidor
abandona ao estourar o teto de parede; com `ping` do provedor ela pode seguir
viva ate o proximo evento real. Estes testes provam cinco coisas:

1. o contador de vivos e exato: sobe ao reservar, desce ao liberar, e a vaga
   volta em TODO fim do leitor (normal, erro, cancelado) e se a thread nem
   chega a iniciar;
2. a reserva e atomica: N threads disputando a ultima vaga, so uma vence;
3. acima do teto o stream e recusado ANTES de abrir a chamada ao provedor, com
   o erro que um provedor indisponivel ja produz;
4. o teto acompanha o numero do limiter padrao de threads do anyio (escolha de
   dimensionamento, nao prova de esgotamento do limiter);
5. cada leitor devolve a sua vaga uma unica vez, mesmo se `start()` lancar
   depois de a thread ter iniciado.

Sem `sleep`: o que precisa esperar espera por `Event` ou por `join` da thread,
e o relogio do leitor e o falso de `Espera`.
"""

import inspect
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
from focusquest.modules.tutoring.provider import (
    ProvedorIndisponivelError,
    TempoEsgotadoError,
)

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


def test_o_teto_acompanha_o_numero_do_limiter_padrao_do_anyio() -> None:
    # Amarra o NUMERO, nao a premissa: o 40 foi escolhido igual ao limiter
    # padrao do anyio (dimensionamento: consumidores ativos e leitores orfaos na
    # mesma ordem de grandeza do que o servidor admite por processo). O leitor
    # e thread daemon e nao consome ficha do limiter. Se o anyio mudar o padrao,
    # este teste pede que o teto seja revisto junto, em vez de divergir calado.
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


def _com_thread(
    monkeypatch: pytest.MonkeyPatch, thread: type[threading.Thread]
) -> None:
    monkeypatch.setattr(
        leitura,
        "threading",
        types.SimpleNamespace(
            Thread=thread, Event=threading.Event, Lock=threading.Lock
        ),
    )


def test_a_vaga_e_reservada_antes_do_start_e_volta_se_o_start_falha(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    leitores = LeitoresVivos(teto=2)
    vivos_no_start: list[int] = []

    class ThreadQueNaoInicia(threading.Thread):
        def start(self) -> None:
            vivos_no_start.append(leitores.vivos)
            raise RuntimeError("can't start new thread")

    _com_thread(monkeypatch, ThreadQueNaoInicia)

    with pytest.raises(RuntimeError, match="can't start new thread"):
        list(
            ler_com_prazo(
                _Stream(("a",)).gerar(),
                teto_segundos=TETO_DO_STREAM,
                espera=_Relogio().injetavel,
                leitores=leitores,
            )
        )

    assert vivos_no_start == [1]  # reservada antes de o start ser tentado
    assert leitores.vivos == 0  # e devolvida quando ele falhou


def test_start_que_falha_depois_de_a_thread_iniciar_nao_libera_a_vaga_duas_vezes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Teorico, mas barato de provar: a thread nasce e roda, e o `start()` ainda
    # assim lanca. A vaga deste leitor volta UMA vez; a do outro nao e tocada.
    leitores = LeitoresVivos(teto=3)
    assert leitores.reservar()  # a vaga de outro leitor, que deve sobreviver

    class ThreadQueIniciaELanca(threading.Thread):
        def start(self) -> None:
            super().start()
            self.join(ESPERA_DO_TESTE)  # o leitor ja terminou e liberou
            raise RuntimeError("falhou depois de iniciar")

    _com_thread(monkeypatch, ThreadQueIniciaELanca)

    with pytest.raises(RuntimeError, match="falhou depois de iniciar"):
        list(
            ler_com_prazo(
                _Stream(("a",)).gerar(),
                teto_segundos=TETO_DO_STREAM,
                espera=_Relogio().injetavel,
                leitores=leitores,
            )
        )

    assert leitores.vivos == 1  # so a do outro leitor


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


def _thread_segurada_ate(
    liberada: threading.Event,
) -> type[threading.Thread]:
    """Uma thread que so comeca a rodar quando o teste manda: o consumidor
    pode sair ANTES de o leitor dar o primeiro passo, sem corrida."""

    class ThreadSegurada(threading.Thread):
        def run(self) -> None:
            assert liberada.wait(ESPERA_DO_TESTE), "o teste nao liberou a thread"
            super().run()

    return ThreadSegurada


def test_leitor_cancelado_antes_do_primeiro_evento_nao_chama_o_provedor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # O consumidor estoura (teto 0) antes de o leitor ler o primeiro evento.
    # Abrir o gerador do provedor agora seria uma chamada PAGA que ninguem
    # espera: o leitor confere o cancelamento antes do primeiro `next()`, fecha
    # o gerador sem iterar e devolve a vaga.
    leitores = LeitoresVivos(teto=2)
    liberada = threading.Event()
    _com_thread(monkeypatch, _thread_segurada_ate(liberada))
    stream = _Stream(("a",))
    gerador = stream.gerar()

    with pytest.raises(TempoEsgotadoError):
        list(
            ler_com_prazo(
                gerador,
                teto_segundos=0,
                espera=_Relogio().injetavel,
                leitores=leitores,
            )
        )
    assert leitores.vivos == 1  # o leitor ainda nem comecou, e a vaga e dele

    liberada.set()
    _esperar_os_leitores()

    assert not stream.iniciou.is_set()  # o corpo do provedor nunca rodou
    assert inspect.getgeneratorstate(gerador) == inspect.GEN_CLOSED
    assert leitores.vivos == 0


def test_relogio_que_falha_no_leitor_cancelado_devolve_a_vaga_sem_erro_solto(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # `_ler` mede a vida do leitor para o log. Se o relogio lancar na primeira
    # leitura com o consumidor ja fora, o `finally` nao pode estourar num
    # `UnboundLocalError` por causa de uma variavel que nunca foi atribuida:
    # a vaga volta e nenhuma excecao escapa da thread.
    leitores = LeitoresVivos(teto=2)
    liberada = threading.Event()
    _com_thread(monkeypatch, _thread_segurada_ate(liberada))
    soltas: list[BaseException] = []
    monkeypatch.setattr(
        threading, "excepthook", lambda args: soltas.append(args.exc_value)
    )

    leituras_do_leitor: list[float] = []

    def relogio_quebrado() -> float:
        # So a PRIMEIRA leitura do leitor falha (a que atribui o inicio): as
        # seguintes, como a do log, funcionam.
        if threading.current_thread().name == "tutoria-leitor":
            leituras_do_leitor.append(1000.0)
            if len(leituras_do_leitor) == 1:
                raise OSError("relogio indisponivel")
        return 1000.0

    stream = _Stream(("a",))
    espera = Espera(monotonic=relogio_quebrado, esperar=_Relogio.esperar)
    with pytest.raises(TempoEsgotadoError):
        list(
            ler_com_prazo(
                stream.gerar(),
                teto_segundos=0,
                espera=espera,
                leitores=leitores,
            )
        )

    liberada.set()
    _esperar_os_leitores()

    assert soltas == []
    assert not stream.iniciou.is_set()
    assert leitores.vivos == 0
