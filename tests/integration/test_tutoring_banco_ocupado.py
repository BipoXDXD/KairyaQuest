"""O banco corta a gravacao final da resposta, ja dentro do stream (#177).

O handler de `main.py` so age antes de a resposta comecar. Na tutoria o 200
ja saiu quando `transmitir` grava o final, entao o corte transitorio (trava,
comando acima do teto, pool esgotado) vira o evento `error` com
`banco_ocupado`, e nao uma excecao que mata o stream e leva SQL ao log.

A trava e real: um provedor falso, antes do `Fim`, trava a linha `gerando`
numa OUTRA conexao, e a engine da rota tem `lock_timeout` curto. Ninguem
espera por `sleep`: quem segura a trava so solta quando o teste manda.
"""

import json
import logging
from collections.abc import Callable, Generator, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Connection, Engine, create_engine, event, select, text
from sqlalchemy.exc import InternalError
from sqlalchemy.exc import TimeoutError as PoolEsgotadoError
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.clock import get_clock
from focusquest.core.config import Settings
from focusquest.core.database import LimitesDaSessao, create_engine_from_url, get_engine
from focusquest.main import CodigoDeErro, app
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.domain import CodigoDoStream, StatusDaMensagem
from focusquest.modules.tutoring.models import TutorMessage
from focusquest.modules.tutoring.provider import (
    Delta,
    EventoDoProvedor,
    Ferramenta,
    Fim,
    Turno,
)
from focusquest.modules.tutoring.service import (
    EventoDoTurno,
    ParaGerar,
    RespostaConcluida,
    RespostaFalhou,
    Tutoria,
    preparar_turno,
    transmitir,
)
from integration.conftest import Conversa

ESTUDANTE = 1
AGORA = datetime(2026, 9, 23, 15, tzinfo=UTC)
PERGUNTA = "Pergunta-canario-177"
TRECHO = "Trecho-canario-177"
# O teto curto da trava: bem abaixo do prazo do teste.
TETO_CURTO_MS = 300
# Rede de seguranca de quem segura a trava: se o servico nao respeitar o teto,
# o PostgreSQL derruba a conexao que segura, e o teste falha em vez de travar.
PRAZO_DO_TESTE_MS = 5_000
SQL_PROIBIDO = ("SELECT", "UPDATE", "tutor_messages", "LockNotAvailable")


class ProvedorQueTravaAResposta:
    """Responde um trecho e, antes do `Fim`, trava a linha `gerando` em
    `segurando` -- o momento exato entre o fim da geracao e a gravacao."""

    def __init__(self, segurando: Connection | None) -> None:
        self.segurando = segurando

    def responder(self, turno: Turno) -> Generator[EventoDoProvedor]:
        yield Delta(TRECHO)
        if self.segurando is not None:
            self.segurando.execute(
                select(TutorMessage.id)
                .where(
                    TutorMessage.user_id == ESTUDANTE,
                    TutorMessage.status == StatusDaMensagem.GERANDO,
                )
                .with_for_update()
            )
        yield Fim()

    def avaliar(self, turno: Turno, ferramenta: Ferramenta) -> dict[str, Any] | None:
        raise AssertionError("a tutoria nao avalia")


def _tutoria(segurando: Connection | None) -> Tutoria:
    return Tutoria(
        provedor=ProvedorQueTravaAResposta(segurando),
        historico=20,
        turnos_por_dia=60,
        limite=timedelta(seconds=60),
        modelo="falso",
    )


@contextmanager
def _engine_com_trava_curta(settings: Settings) -> Iterator[Engine]:
    engine = create_engine_from_url(
        settings.test_database_url,
        limites=LimitesDaSessao(
            lock_timeout_ms=TETO_CURTO_MS,
            statement_timeout_ms=15_000,
            idle_in_transaction_timeout_ms=60_000,
        ),
    )
    try:
        yield engine
    finally:
        engine.dispose()


@contextmanager
def _segurando(banco_migrado: Engine) -> Iterator[Connection]:
    with banco_migrado.connect() as conexao:
        conexao.execute(
            text(
                "SELECT set_config('idle_in_transaction_session_timeout', :ms, false)"
            ),
            {"ms": str(PRAZO_DO_TESTE_MS)},
        )
        conexao.commit()
        try:
            yield conexao
        finally:
            conexao.rollback()


@contextmanager
def _cliente(engine: Engine, tutoria: Tutoria) -> Iterator[TestClient]:
    sobrepostos: dict[Callable[..., Any], Callable[..., Any]] = {
        get_engine: lambda: engine,
        get_tutoria: lambda: tutoria,
        get_clock: lambda: lambda: AGORA,
    }
    app.dependency_overrides.update(sobrepostos)
    try:
        with TestClient(app, raise_server_exceptions=False) as cliente:
            yield cliente
    finally:
        for chave in sobrepostos:
            app.dependency_overrides.pop(chave, None)


def _enviar(cliente: TestClient, cid: str) -> Any:
    return cliente.post(
        "/api/tutoring/messages", json={"client_message_id": cid, "content": PERGUNTA}
    )


def _eventos(corpo: str) -> list[tuple[str, dict[str, Any]]]:
    eventos = []
    for bloco in corpo.strip().split("\n\n"):
        nome, dados = bloco.split("\n")
        eventos.append(
            (nome.removeprefix("event: "), json.loads(dados.removeprefix("data: ")))
        )
    return eventos


def _resposta_de(banco_migrado: Engine, cid: str) -> TutorMessage:
    with Session(bind=banco_migrado, expire_on_commit=False) as leitura:
        pergunta = leitura.scalars(
            select(TutorMessage).where(TutorMessage.client_message_id == cid)
        ).one()
        return leitura.scalars(
            select(TutorMessage)
            .where(TutorMessage.reply_to_id == pergunta.id)
            .order_by(TutorMessage.id)
        ).first() or pytest.fail("a pergunta ficou sem resposta")


def _preparar(engine: Engine, cid: str, tutoria: Tutoria) -> ParaGerar:
    with Session(bind=engine, expire_on_commit=False) as sessao:
        preparo = preparar_turno(
            sessao,
            user_id=ESTUDANTE,
            client_message_id=cid,
            conteudo=PERGUNTA,
            tutoria=tutoria,
            clock=lambda: AGORA,
        )
        sessao.commit()
    assert isinstance(preparo, ParaGerar)
    return preparo


def test_trava_na_gravacao_final_fecha_o_stream_com_banco_ocupado(
    banco_migrado: Engine,
    settings: Settings,
    conversa: Conversa,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """As DUAS gravacoes esbarram na trava: a final e a do `falhou`. O stream
    termina com o `error`, e a linha fica `gerando` para o recolhimento de
    orfaos. Nem o corpo nem o log levam SQL, parametros ou o texto."""
    cid = conversa.id("banco-ocupado-rota")
    with (
        _engine_com_trava_curta(settings) as engine,
        _segurando(banco_migrado) as segurando,
        _cliente(engine, _tutoria(segurando)) as cliente,
        caplog.at_level(logging.WARNING),
    ):
        resposta = _enviar(cliente, cid)
        segurando.rollback()

    assert resposta.status_code == 200
    eventos = _eventos(resposta.text)
    assert [nome for nome, _ in eventos] == ["user_message", "delta", "error"]
    assert eventos[-1] == ("error", {"code": "banco_ocupado"})
    for proibido in (*SQL_PROIBIDO, "55P03"):
        assert proibido not in resposta.text
    linha = _resposta_de(banco_migrado, cid)
    assert linha.status is StatusDaMensagem.GERANDO
    avisos = [
        r
        for r in caplog.records
        if r.name.startswith("focusquest") and r.levelno >= logging.WARNING
    ]
    assert [r.levelno for r in avisos] == [logging.WARNING, logging.WARNING]
    assert all("55P03" in r.getMessage() for r in avisos)
    assert all(str(linha.id) in r.getMessage() for r in avisos)
    for proibido in (*SQL_PROIBIDO, TRECHO, PERGUNTA, "gerando", "Traceback"):
        assert proibido not in caplog.text


def test_a_segunda_tentativa_grava_falhou_e_o_reenvio_e_aceito(
    banco_migrado: Engine, settings: Settings, conversa: Conversa
) -> None:
    """A gravacao final esbarra na trava; a trava sai antes da segunda
    tentativa, que grava `falhou`/`banco_ocupado`. Por isso o "Tentar de
    novo" com o mesmo `client_message_id` gera de novo, sem 409."""
    cid = conversa.id("banco-ocupado-segunda")
    with (
        _engine_com_trava_curta(settings) as engine,
        _segurando(banco_migrado) as segurando,
    ):
        tutoria = _tutoria(segurando)
        preparo = _preparar(engine, cid, tutoria)
        fabrica = sessionmaker(bind=engine, expire_on_commit=False)
        chamadas = 0

        def solta_antes_da_segunda() -> Session:
            nonlocal chamadas
            chamadas += 1
            if chamadas == 2:
                segurando.rollback()
            return fabrica()

        eventos = list(
            transmitir(solta_antes_da_segunda, preparo, tutoria, clock=lambda: AGORA)
        )

    assert eventos[-1] == RespostaFalhou(CodigoDoStream.BANCO_OCUPADO)
    assert chamadas == 2
    linha = _resposta_de(banco_migrado, cid)
    assert (linha.status, linha.error_code, linha.content) == (
        StatusDaMensagem.FALHOU,
        "banco_ocupado",
        TRECHO,
    )

    with _cliente(banco_migrado, _tutoria(None)) as cliente:
        reenvio = _enviar(cliente, cid)

    assert reenvio.status_code == 200
    assert [nome for nome, _ in _eventos(reenvio.text)][-1] == "done"


def test_pool_esgotado_depois_do_commit_nao_desmente_a_resposta_completa(
    banco_migrado: Engine, settings: Settings, conversa: Conversa
) -> None:
    """Depois do commit que grava `completa`, nada mais pede conexao ao pool.

    Um pedido a mais esbarraria no pool esgotado, justo sob carga, com a linha
    ja commitada: o stream diria `banco_ocupado` sobre uma resposta gravada, e
    o "Tentar de novo" de uma `interrompida` gastaria mais um turno pago."""
    cid = conversa.id("banco-ocupado-depois-do-commit")
    tutoria = _tutoria(None)
    with _engine_com_trava_curta(settings) as engine:
        preparo = _preparar(engine, cid, tutoria)
        pedidos = 0

        def pool_so_tem_uma(*_: object) -> None:
            nonlocal pedidos
            pedidos += 1
            if pedidos > 1:
                raise PoolEsgotadoError("pool esgotado (simulado)")

        event.listen(engine, "checkout", pool_so_tem_uma)
        eventos = list(
            transmitir(
                sessionmaker(bind=engine, expire_on_commit=False),
                preparo,
                tutoria,
                clock=lambda: AGORA,
            )
        )

    final = eventos[-1]
    assert isinstance(final, RespostaConcluida)
    assert (final.mensagem.status, final.mensagem.content) == (
        StatusDaMensagem.COMPLETA,
        TRECHO,
    )
    assert pedidos == 1
    assert _resposta_de(banco_migrado, cid).status is StatusDaMensagem.COMPLETA


def test_erro_de_banco_nao_transitorio_continua_propagando(
    banco_migrado: Engine, settings: Settings, conversa: Conversa
) -> None:
    """Transacao somente leitura: o `SELECT ... FOR UPDATE` da gravacao final
    falha com 25006, que repetir nao resolve. Nada de `banco_ocupado`."""
    cid = conversa.id("banco-ocupado-nao-transitorio")
    tutoria = _tutoria(None)
    preparo = _preparar(banco_migrado, cid, tutoria)
    somente_leitura = create_engine(
        settings.test_database_url,
        connect_args={"options": "-c default_transaction_read_only=on"},
    )
    eventos: list[EventoDoTurno] = []
    try:
        gerador = transmitir(
            sessionmaker(bind=somente_leitura), preparo, tutoria, clock=lambda: AGORA
        )
        with pytest.raises(InternalError) as erro:
            eventos.extend(gerador)
    finally:
        somente_leitura.dispose()

    assert getattr(erro.value.orig, "sqlstate", None) == "25006"
    assert RespostaFalhou(CodigoDoStream.BANCO_OCUPADO) not in eventos


def test_erro_nao_transitorio_na_segunda_tentativa_propaga(
    banco_migrado: Engine, settings: Settings, conversa: Conversa
) -> None:
    """A gravacao final esbarra na trava; a segunda tentativa cai numa
    transacao somente leitura (25006). So o corte transitorio e engolido."""
    cid = conversa.id("banco-ocupado-segunda-nao-transitoria")
    somente_leitura = create_engine(
        settings.test_database_url,
        connect_args={"options": "-c default_transaction_read_only=on"},
    )
    with (
        _engine_com_trava_curta(settings) as engine,
        _segurando(banco_migrado) as segurando,
    ):
        tutoria = _tutoria(segurando)
        preparo = _preparar(engine, cid, tutoria)
        fabricas = iter(
            [
                sessionmaker(bind=engine, expire_on_commit=False),
                sessionmaker(bind=somente_leitura),
            ]
        )
        try:
            gerador = transmitir(
                lambda: next(fabricas)(), preparo, tutoria, clock=lambda: AGORA
            )
            with pytest.raises(InternalError) as erro:
                list(gerador)
        finally:
            somente_leitura.dispose()

    assert getattr(erro.value.orig, "sqlstate", None) == "25006"
    assert _resposta_de(banco_migrado, cid).status is StatusDaMensagem.GERANDO


def test_o_codigo_do_stream_tem_o_valor_do_503() -> None:
    """O mesmo "banco ocupado" chega por dois caminhos -- o 503 antes do
    stream e o `error` dentro dele -- e a tela le os dois pelo mesmo valor."""
    assert CodigoDoStream.BANCO_OCUPADO.value == CodigoDeErro.BANCO_OCUPADO.value
