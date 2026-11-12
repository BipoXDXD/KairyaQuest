"""O teto de tempo TOTAL do stream da tutoria, com relogio e espera falsos.

O timeout do SDK e por LEITURA: um provedor que manda um evento a cada 50 s
mantem o stream vivo, e um que cala depois de um evento so e cortado 54 s
depois dele. O limite total que o servico conferia dependia de um evento
chegar (pendencia P-orcamento-tempo-1). Estes testes provam que o servico
corta o stream no teto de parede mesmo SEM evento, sem `sleep` real: o relogio
e a espera pela fila sao injetados (`Espera`), e o tempo so anda quando o falso
diz que andou.

O leitor do stream e uma thread de verdade e a fila e a de verdade; o falso so
decide QUANTO tempo cada evento levou para chegar (`atrasos`) e, quando o
proximo evento demoraria mais que a espera pedida, faz a fila reportar
`queue.Empty` -- o que a `Queue.get(timeout=...)` real faria.
"""

import logging
import math
import queue
import threading
from collections.abc import Generator, Iterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy.orm import Session, sessionmaker

from focusquest.modules.tutoring.domain import CodigoDoStream, StatusDaMensagem
from focusquest.modules.tutoring.leitura import Espera
from focusquest.modules.tutoring.models import TutorMessage
from focusquest.modules.tutoring.provider import (
    Delta,
    EventoDoProvedor,
    Ferramenta,
    Fim,
    ProvedorIndisponivelError,
    Turno,
)
from focusquest.modules.tutoring.service import (
    ParaGerar,
    PerguntaGravada,
    RespostaConcluida,
    RespostaFalhou,
    Trecho,
    Tutoria,
    preparar_turno,
    transmitir,
)
from integration.conftest import Conversa

ESTUDANTE = 1
AGORA = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
# O limite de producao (`Settings.tutor_timeout_seconds`): 54 s.
TETO = timedelta(seconds=54)
ESPERA_DO_LEITOR = 5.0


class ProvedorRoteirizado:
    """Entrega os eventos pela ordem; depois do ultimo, pode TRAVAR de verdade
    (uma thread bloqueada, como a leitura do SDK) ate `liberar`."""

    def __init__(
        self,
        eventos: tuple[EventoDoProvedor, ...],
        *,
        travar_no_fim: bool = False,
        depois_de_liberado: tuple[EventoDoProvedor, ...] = (),
        erro_no_fim: Exception | None = None,
    ) -> None:
        self._eventos = eventos
        self._travar_no_fim = travar_no_fim
        self._depois = depois_de_liberado
        self._erro_no_fim = erro_no_fim
        self.travou = threading.Event()
        self.liberar = threading.Event()
        self.fechado = threading.Event()
        self.entregues_depois_de_liberado = 0

    def avaliar(self, turno: Turno, ferramenta: Ferramenta) -> dict[str, Any] | None:
        raise NotImplementedError("a tutoria so conversa")

    def responder(self, turno: Turno) -> Generator[EventoDoProvedor]:
        try:
            yield from self._eventos
            if self._erro_no_fim is not None:
                raise self._erro_no_fim
            if self._travar_no_fim:
                self.travou.set()
                assert self.liberar.wait(ESPERA_DO_LEITOR), "o teste nao liberou"
                for evento in self._depois:
                    self.entregues_depois_de_liberado += 1
                    yield evento
        finally:
            self.fechado.set()


class EsperaFalsa:
    """O relogio e a espera pela fila, sem tempo real.

    O evento `i` leva `atrasos[i]` segundos para chegar depois do anterior;
    sem atraso listado, nunca chega (`math.inf`: o provedor calou).
    """

    def __init__(self, atrasos: tuple[float, ...]) -> None:
        self.agora = 1000.0
        self.inicio = self.agora
        self.esperas_pedidas: list[float] = []
        self._atrasos: Iterator[float] = iter(atrasos)

    def monotonic(self) -> float:
        return self.agora

    def esperar(self, fila: queue.Queue[object], segundos: float) -> object:
        self.esperas_pedidas.append(segundos)
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


def _preparar(fabrica: sessionmaker[Session], tutoria: Tutoria, cid: str) -> ParaGerar:
    with fabrica() as sessao:
        preparo = preparar_turno(
            sessao,
            user_id=ESTUDANTE,
            client_message_id=cid,
            conteudo="Me da uma missao?",
            tutoria=tutoria,
            clock=lambda: AGORA,
        )
        sessao.commit()
    assert isinstance(preparo, ParaGerar)
    return preparo


def _resposta(fabrica: sessionmaker[Session], resposta_id: int) -> TutorMessage:
    with fabrica() as sessao:
        resposta = sessao.get(TutorMessage, resposta_id)
        assert resposta is not None
        return resposta


def _leitores_vivos() -> list[threading.Thread]:
    return [t for t in threading.enumerate() if t.name == "tutoria-leitor"]


def _esperar_o_leitor_terminar() -> None:
    for leitor in _leitores_vivos():
        leitor.join(timeout=ESPERA_DO_LEITOR)
    assert _leitores_vivos() == []


def test_o_provedor_que_cala_depois_de_um_evento_e_cortado_no_teto_de_parede(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    conversa: Conversa,
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Um evento chega em 1 s e o provedor cala. Sem o teto, a espera pelo
    # proximo duraria o timeout por leitura do SDK (54 s depois do evento, ou
    # seja, 55 s) e uma parada que comecasse mais tarde passaria dos 60 s que
    # o proxy tolera depois da folga do orfao.
    provedor = ProvedorRoteirizado(
        (Delta("meio"),),
        travar_no_fim=True,
        depois_de_liberado=(Delta("tarde"), Fim()),
    )
    espera = EsperaFalsa(atrasos=(1.0,))
    tutoria = replace(tutoria, provedor=provedor, limite=TETO)
    preparo = _preparar(fabrica, tutoria, conversa.id("teto-cala"))

    with caplog.at_level(logging.WARNING):
        eventos = list(
            transmitir(
                fabrica, preparo, tutoria, clock=lambda: AGORA, espera=espera.injetavel
            )
        )

    assert isinstance(eventos[0], PerguntaGravada)
    assert eventos[1:] == [
        Trecho("meio"),
        RespostaFalhou(CodigoDoStream.TEMPO_ESGOTADO),
    ]
    # O stream acabou NO teto, nem um segundo depois.
    assert espera.decorrido == TETO.total_seconds()
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content, vista.error_code) == (
        StatusDaMensagem.FALHOU,
        "meio",
        CodigoDoStream.TEMPO_ESGOTADO,
    )
    # O tempo usado fica no log, sem o conteudo da conversa.
    registro = [r.getMessage() for r in caplog.records if "teto" in r.getMessage()]
    assert registro == [
        "stream da tutoria passou do teto: decorrido_ms=54000 teto_ms=54000 eventos=1"
    ]


def test_o_stream_do_sdk_e_fechado_ao_estourar_e_nada_tardio_e_gravado(
    fabrica: sessionmaker[Session], tutoria: Tutoria, conversa: Conversa
) -> None:
    provedor = ProvedorRoteirizado(
        (Delta("meio"),),
        travar_no_fim=True,
        depois_de_liberado=(Delta("tarde"), Fim()),
    )
    tutoria = replace(tutoria, provedor=provedor, limite=TETO)
    preparo = _preparar(fabrica, tutoria, conversa.id("teto-fecha"))

    *_, final = transmitir(
        fabrica,
        preparo,
        tutoria,
        clock=lambda: AGORA,
        espera=EsperaFalsa(atrasos=(1.0,)).injetavel,
    )
    assert final == RespostaFalhou(CodigoDoStream.TEMPO_ESGOTADO)
    # O leitor esta de fato preso na leitura quando o teto estoura...
    assert provedor.travou.wait(ESPERA_DO_LEITOR)
    assert not provedor.fechado.is_set()
    # ...e, quando a leitura volta, ele ve o cancelamento: fecha o stream sem
    # entregar mais nada, e a thread termina.
    provedor.liberar.set()
    assert provedor.fechado.wait(ESPERA_DO_LEITOR)
    _esperar_o_leitor_terminar()
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content) == (StatusDaMensagem.FALHOU, "meio")
    # Parou no primeiro evento tardio: nem o `Fim` foi lido.
    assert provedor.entregues_depois_de_liberado == 1


def test_um_evento_a_cada_50_s_nao_mantem_o_stream_vivo_alem_do_teto(
    fabrica: sessionmaker[Session], tutoria: Tutoria, conversa: Conversa
) -> None:
    # Cada leitura fica dentro do timeout por leitura (50 < 54), mas o total
    # nao: o segundo evento so chegaria em 100 s.
    provedor = ProvedorRoteirizado((Delta("a"), Delta("b"), Fim()))
    espera = EsperaFalsa(atrasos=(50.0, 50.0, 50.0))
    tutoria = replace(tutoria, provedor=provedor, limite=TETO)
    preparo = _preparar(fabrica, tutoria, conversa.id("teto-gotejo"))

    eventos = list(
        transmitir(
            fabrica, preparo, tutoria, clock=lambda: AGORA, espera=espera.injetavel
        )
    )

    assert eventos[1:] == [Trecho("a"), RespostaFalhou(CodigoDoStream.TEMPO_ESGOTADO)]
    assert espera.decorrido == TETO.total_seconds()
    assert _resposta(fabrica, preparo.resposta_id).status is StatusDaMensagem.FALHOU
    provedor.fechado.wait(ESPERA_DO_LEITOR)
    _esperar_o_leitor_terminar()


def test_com_o_teto_ja_gasto_o_servico_nem_espera_o_proximo_evento(
    fabrica: sessionmaker[Session], tutoria: Tutoria, conversa: Conversa
) -> None:
    # O segundo evento chega exatamente em 54 s: o orcamento acabou, e o
    # terceiro nao ganha nem uma espera de 0 s.
    # O provedor trava depois de `b`: nada esta na fila quando o orcamento acaba
    # (um evento JA enfileirado e aproveitado, ver o teste da drenagem).
    provedor = ProvedorRoteirizado(
        (Delta("a"), Delta("b")),
        travar_no_fim=True,
        depois_de_liberado=(Delta("c"), Fim()),
    )
    espera = EsperaFalsa(atrasos=(27.0, 27.0, 27.0))
    tutoria = replace(tutoria, provedor=provedor, limite=TETO)
    preparo = _preparar(fabrica, tutoria, conversa.id("teto-esgotado"))

    eventos = list(
        transmitir(
            fabrica, preparo, tutoria, clock=lambda: AGORA, espera=espera.injetavel
        )
    )

    assert eventos[1:] == [
        Trecho("a"),
        Trecho("b"),
        RespostaFalhou(CodigoDoStream.TEMPO_ESGOTADO),
    ]
    assert espera.esperas_pedidas == [54.0, 27.0]
    provedor.liberar.set()
    provedor.fechado.wait(ESPERA_DO_LEITOR)
    _esperar_o_leitor_terminar()


def test_o_stream_normal_dentro_do_teto_continua_igual(
    fabrica: sessionmaker[Session], tutoria: Tutoria, conversa: Conversa
) -> None:
    provedor = ProvedorRoteirizado((Delta("Bora, "), Delta("estudar!"), Fim()))
    # Os tres eventos levam 2 s cada; o aviso de fim de stream chega junto.
    espera = EsperaFalsa(atrasos=(2.0, 2.0, 2.0, 0.0))
    tutoria = replace(tutoria, provedor=provedor, limite=TETO)
    preparo = _preparar(fabrica, tutoria, conversa.id("teto-normal"))

    eventos = list(
        transmitir(
            fabrica, preparo, tutoria, clock=lambda: AGORA, espera=espera.injetavel
        )
    )

    assert eventos[1:3] == [Trecho("Bora, "), Trecho("estudar!")]
    final = eventos[3]
    assert isinstance(final, RespostaConcluida)
    assert (final.mensagem.status, final.mensagem.content) == (
        StatusDaMensagem.COMPLETA,
        "Bora, estudar!",
    )
    assert len(eventos) == 4
    assert espera.decorrido == 6.0
    # Terminou sem estouro: o leitor ja saiu e o stream do provedor, fechado.
    assert provedor.fechado.is_set()
    _esperar_o_leitor_terminar()


def test_o_erro_do_provedor_chega_ao_servico_como_o_mesmo_erro(
    fabrica: sessionmaker[Session], tutoria: Tutoria, conversa: Conversa
) -> None:
    provedor = ProvedorRoteirizado(
        (Delta("meio"),), erro_no_fim=ProvedorIndisponivelError("503")
    )
    tutoria = replace(tutoria, provedor=provedor, limite=TETO)
    preparo = _preparar(fabrica, tutoria, conversa.id("teto-erro"))

    eventos = list(
        transmitir(
            fabrica,
            preparo,
            tutoria,
            clock=lambda: AGORA,
            espera=EsperaFalsa(atrasos=(1.0, 1.0)).injetavel,
        )
    )

    assert eventos[-1] == RespostaFalhou(CodigoDoStream.PROVEDOR_INDISPONIVEL)
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content) == (StatusDaMensagem.FALHOU, "meio")
    _esperar_o_leitor_terminar()


def test_fechar_o_gerador_cancela_o_leitor_do_stream(
    fabrica: sessionmaker[Session], tutoria: Tutoria, conversa: Conversa
) -> None:
    # A desconexao do cliente: `close()` com o provedor preso na leitura. O
    # leitor so pode ver o cancelamento quando a leitura volta; ai fecha o
    # stream sem entregar nada.
    provedor = ProvedorRoteirizado(
        (Delta("meio"),),
        travar_no_fim=True,
        depois_de_liberado=(Delta("tarde"), Fim()),
    )
    tutoria = replace(tutoria, provedor=provedor, limite=TETO)
    preparo = _preparar(fabrica, tutoria, conversa.id("teto-fechar"))
    gerador = transmitir(
        fabrica,
        preparo,
        tutoria,
        clock=lambda: AGORA,
        espera=EsperaFalsa(atrasos=(1.0,)).injetavel,
    )
    assert isinstance(next(gerador), PerguntaGravada)
    assert next(gerador) == Trecho("meio")
    assert provedor.travou.wait(ESPERA_DO_LEITOR)

    gerador.close()

    provedor.liberar.set()
    assert provedor.fechado.wait(ESPERA_DO_LEITOR)
    _esperar_o_leitor_terminar()
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content) == (StatusDaMensagem.INTERROMPIDA, "meio")
    # Parou no primeiro evento tardio: nem o `Fim` foi lido.
    assert provedor.entregues_depois_de_liberado == 1


def test_a_espera_real_pela_fila_estoura_no_teto_com_o_provedor_travado(
    fabrica: sessionmaker[Session], tutoria: Tutoria, conversa: Conversa
) -> None:
    # Sem `Espera` injetada: o `Queue.get(timeout=...)` e o `time.monotonic`
    # reais. Um `fila.get()` sem timeout deixaria este teste preso para sempre
    # (o provedor so e liberado no fim), e os testes de relogio falso nao
    # perceberiam: eles substituem a propria espera.
    provedor = ProvedorRoteirizado(
        (Delta("meio"),),
        travar_no_fim=True,
        depois_de_liberado=(Delta("tarde"), Fim()),
    )
    tutoria = replace(tutoria, provedor=provedor, limite=timedelta(milliseconds=50))
    preparo = _preparar(fabrica, tutoria, conversa.id("teto-real"))

    try:
        eventos = list(transmitir(fabrica, preparo, tutoria, clock=lambda: AGORA))
        assert provedor.travou.wait(ESPERA_DO_LEITOR)
    finally:
        provedor.liberar.set()

    assert eventos[-1] == RespostaFalhou(CodigoDoStream.TEMPO_ESGOTADO)
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.error_code) == (
        StatusDaMensagem.FALHOU,
        CodigoDoStream.TEMPO_ESGOTADO,
    )
    assert provedor.fechado.wait(ESPERA_DO_LEITOR)
    _esperar_o_leitor_terminar()


def test_evento_ja_enfileirado_quando_o_tempo_acaba_e_aproveitado(
    fabrica: sessionmaker[Session], tutoria: Tutoria, conversa: Conversa
) -> None:
    # O leitor ja entregou o `Fim` quando o relogio passa do teto: a resposta
    # esta completa e nao pode virar `falhou`. O falso anda o relogio 60 s depois
    # do primeiro evento, e so depois de o leitor terminar (join: sem sleep).
    provedor = ProvedorRoteirizado((Delta("a"), Fim()))
    relogio = {"agora": 1000.0}

    def esperar(fila: queue.Queue[object], segundos: float) -> object:
        item = fila.get(timeout=ESPERA_DO_LEITOR)
        for leitor in _leitores_vivos():
            leitor.join(timeout=ESPERA_DO_LEITOR)
        relogio["agora"] += 60.0
        return item

    espera = Espera(monotonic=lambda: relogio["agora"], esperar=esperar)
    tutoria = replace(tutoria, provedor=provedor, limite=TETO)
    preparo = _preparar(fabrica, tutoria, conversa.id("teto-drenagem"))

    eventos = list(
        transmitir(fabrica, preparo, tutoria, clock=lambda: AGORA, espera=espera)
    )

    assert eventos[1] == Trecho("a")
    final = eventos[-1]
    assert isinstance(final, RespostaConcluida)
    assert (final.mensagem.status, final.mensagem.content) == (
        StatusDaMensagem.COMPLETA,
        "a",
    )
    _esperar_o_leitor_terminar()


def test_intermediario_ja_enfileirado_e_entregue_e_depois_a_fila_vazia_estoura(
    fabrica: sessionmaker[Session], tutoria: Tutoria, conversa: Conversa
) -> None:
    # Teste de caracterizacao da drenagem (`get_nowait` depois do teto): com o
    # tempo esgotado, ha um evento INTERMEDIARIO pronto na fila e, depois dele,
    # a fila vazia (o provedor travou). O intermediario e entregue; so entao o
    # stream estoura, e o texto parcial gravado o inclui.
    provedor = ProvedorRoteirizado(
        (Delta("a"), Delta("b")),
        travar_no_fim=True,
        depois_de_liberado=(Delta("tarde"), Fim()),
    )
    relogio = {"agora": 1000.0}
    esperas: list[float] = []

    def esperar(fila: queue.Queue[object], segundos: float) -> object:
        esperas.append(segundos)
        item = fila.get(timeout=ESPERA_DO_LEITOR)
        # O leitor so seta `travou` depois de enfileirar o `b`: sem sleep, o
        # `b` ja esta na fila quando o relogio passa do teto.
        assert provedor.travou.wait(ESPERA_DO_LEITOR)
        relogio["agora"] += 60.0
        return item

    espera = Espera(monotonic=lambda: relogio["agora"], esperar=esperar)
    tutoria = replace(tutoria, provedor=provedor, limite=TETO)
    preparo = _preparar(fabrica, tutoria, conversa.id("teto-intermediario"))

    eventos = list(
        transmitir(fabrica, preparo, tutoria, clock=lambda: AGORA, espera=espera)
    )

    assert eventos[1:] == [
        Trecho("a"),
        Trecho("b"),
        RespostaFalhou(CodigoDoStream.TEMPO_ESGOTADO),
    ]
    # Uma unica espera real: depois do teto, so `get_nowait`, sem espera nenhuma.
    assert esperas == [54.0]
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content, vista.error_code) == (
        StatusDaMensagem.FALHOU,
        "ab",
        CodigoDoStream.TEMPO_ESGOTADO,
    )
    provedor.liberar.set()
    assert provedor.fechado.wait(ESPERA_DO_LEITOR)
    _esperar_o_leitor_terminar()
