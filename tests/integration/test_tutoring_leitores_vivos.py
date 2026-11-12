"""O teto de leitores vivos visto pelo servico da tutoria (P-teto-stream-2).

Com o gauge cheio, o turno NOVO e recusado antes de abrir a chamada ao
provedor, e termina como uma falha de provedor de hoje: mensagem `falhou`,
`provedor_indisponivel`, sem texto e sem acao. A vaga e devolvida em todo fim
de turno. Os detalhes do contador estao em `tests/unit/test_tutoring_leitores_vivos.py`.
"""

import threading
from collections.abc import Generator
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session, sessionmaker

from focusquest.modules.tutoring import leitura
from focusquest.modules.tutoring.domain import CodigoDoStream, StatusDaMensagem
from focusquest.modules.tutoring.leitura import LeitoresVivos
from focusquest.modules.tutoring.models import TutorMessage
from focusquest.modules.tutoring.provider import (
    Delta,
    EventoDoProvedor,
    Ferramenta,
    Fim,
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
ESPERA_DO_TESTE = 5.0


class ProvedorQueConta:
    """Conta as vezes que `responder` foi pedido e que o corpo (a chamada de
    verdade, no SDK) chegou a rodar."""

    def __init__(self, eventos: tuple[EventoDoProvedor, ...]) -> None:
        self._eventos = eventos
        self.pedidos = 0
        self.corpos_iniciados = 0

    def avaliar(self, turno: Turno, ferramenta: Ferramenta) -> None:
        raise NotImplementedError("a tutoria so conversa")

    def responder(self, turno: Turno) -> Generator[EventoDoProvedor]:
        self.pedidos += 1
        return self._corpo()

    def _corpo(self) -> Generator[EventoDoProvedor]:
        self.corpos_iniciados += 1
        yield from self._eventos


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


def _esperar_os_leitores() -> None:
    for leitor in threading.enumerate():
        if leitor.name == "tutoria-leitor":
            leitor.join(timeout=ESPERA_DO_TESTE)


def test_com_40_leitores_vivos_o_41o_turno_falha_sem_chamar_o_provedor(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    conversa: Conversa,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cheio = LeitoresVivos()
    for _ in range(cheio.teto):
        assert cheio.reservar()
    monkeypatch.setattr(leitura, "LEITORES_VIVOS", cheio)
    provedor = ProvedorQueConta((Delta("ola"), Fim()))
    tutoria = replace(tutoria, provedor=provedor, limite=timedelta(seconds=54))
    preparo = _preparar(fabrica, tutoria, conversa.id("leitores-cheio"))

    eventos = list(transmitir(fabrica, preparo, tutoria, clock=lambda: AGORA))

    assert eventos[1:] == [RespostaFalhou(CodigoDoStream.PROVEDOR_INDISPONIVEL)]
    assert isinstance(eventos[0], PerguntaGravada)
    # Nenhuma chamada paga: o corpo do stream nunca rodou.
    assert provedor.corpos_iniciados == 0
    # Mesmo estado de uma falha de provedor: `falhou`, sem texto, com o codigo.
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content, vista.error_code) == (
        StatusDaMensagem.FALHOU,
        "",
        CodigoDoStream.PROVEDOR_INDISPONIVEL,
    )
    # A recusa nao mexe nas vagas de quem ja esta lendo.
    assert cheio.vivos == cheio.teto


def test_o_turno_normal_devolve_a_vaga_e_o_gauge_volta_a_zero(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    conversa: Conversa,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    gauge = LeitoresVivos()
    monkeypatch.setattr(leitura, "LEITORES_VIVOS", gauge)
    provedor = ProvedorQueConta((Delta("ola"), Fim()))
    tutoria = replace(tutoria, provedor=provedor, limite=timedelta(seconds=54))
    preparo = _preparar(fabrica, tutoria, conversa.id("leitores-normal"))

    eventos = list(transmitir(fabrica, preparo, tutoria, clock=lambda: AGORA))

    assert eventos[1] == Trecho("ola")
    assert isinstance(eventos[2], RespostaConcluida)
    _esperar_os_leitores()
    assert provedor.corpos_iniciados == 1
    assert gauge.vivos == 0
