"""Surrogates isolados recebidos em JSON escapado falham antes de SSE e banco."""

import json
from collections.abc import Callable, Generator, Iterator
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.clock import get_clock
from focusquest.core.database import get_engine
from focusquest.main import app
from focusquest.modules.missions.models import Mission, MissionOperation, WeeklyPlan
from focusquest.modules.progression.models import UserAchievement, XpEntry
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.domain import CodigoDoStream, Papel, StatusDaMensagem
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.provider import EventoDoProvedor, Provedor, Turno
from focusquest.modules.tutoring.service import (
    ParaGerar,
    PerguntaGravada,
    RespostaFalhou,
    Trecho,
    Tutoria,
    preparar_turno,
    transmitir,
)
from integration.conftest import Conversa
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Recebida,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
    TratadorDoFalso,
    eventos_do_roteiro,
    falso_do_tratador,
)

AGORA = datetime(2026, 9, 21, 15, tzinfo=UTC)
PREFIXO = "Olá 🗡️\nVamos estudar 漢字."
PROPOSTA: dict[str, Any] = {
    "instructions": "Ler o capítulo",
    "completion_criterion": "Entregar resumo",
    "difficulty": 2,
    "estimated_minutes": 30,
    "deadline": "2026-09-22T15:00:00Z",
}
TABELAS = (Mission, MissionOperation, XpEntry, UserAchievement, WeeklyPlan, TutorAction)


class TratadorUnicodeEscapado(TratadorDoFalso):
    """O falso usa JSON ASCII escapado: surrogate e dado real recebido pelo SDK."""

    def do_POST(self) -> None:
        falso = falso_do_tratador(self)
        tamanho = int(self.headers["content-length"])
        falso.recebidas.append(
            Recebida(
                corpo=json.loads(self.rfile.read(tamanho)),
                cabecalhos={k.lower(): v for k, v in self.headers.items()},
            )
        )
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("connection", "close")
        self.end_headers()
        for evento in eventos_do_roteiro(falso.roteiro):
            dados = json.dumps(evento.model_dump(), ensure_ascii=True)
            self.wfile.write(f"event: {evento.type}\ndata: {dados}\n\n".encode("ascii"))
            self.wfile.flush()


@pytest.fixture
def falso() -> Iterator[ServidorAnthropicFalso]:
    with ServidorAnthropicFalso(tratador=TratadorUnicodeEscapado) as servidor:
        yield servidor


class ProvedorObservado:
    """Observa o fechamento mantendo o adaptador, SDK e HTTP falsos reais.

    A referencia ao gerador fica viva: perder a referencia nao pode mascarar
    a falta do close() no servico pelo coletor do CPython.
    """

    def __init__(self, provedor: Provedor) -> None:
        self.provedor = provedor
        self.geradores: list[Generator[EventoDoProvedor]] = []
        self.fechados: list[bool] = []

    def responder(self, turno: Turno) -> Generator[EventoDoProvedor]:
        def observar() -> Generator[EventoDoProvedor]:
            try:
                yield from self.provedor.responder(turno)
            finally:
                self.fechados.append(True)

        gerador = observar()
        self.geradores.append(gerador)
        return gerador


@pytest.fixture
def tutoria_observada(tutoria: Tutoria) -> tuple[Tutoria, ProvedorObservado]:
    observado = ProvedorObservado(tutoria.provedor)
    return replace(tutoria, provedor=observado), observado


@pytest.fixture
def cliente(
    banco_migrado: Engine, tutoria_observada: tuple[Tutoria, ProvedorObservado]
) -> Iterator[TestClient]:
    tutoria, _ = tutoria_observada
    sobrepostos: dict[Callable[..., Any], Callable[..., Any]] = {
        get_engine: lambda: banco_migrado,
        get_clock: lambda: lambda: AGORA,
        get_tutoria: lambda: tutoria,
    }
    app.dependency_overrides.update(sobrepostos)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
    for chave in sobrepostos:
        app.dependency_overrides.pop(chave, None)


def _contagens(fabrica: sessionmaker[Session]) -> tuple[int, ...]:
    with fabrica() as sessao:
        return tuple(
            sessao.scalar(select(func.count()).select_from(tabela)) or 0
            for tabela in TABELAS
        )


def _eventos(corpo: str) -> list[tuple[str, dict[str, Any]]]:
    eventos = []
    for bloco in corpo.strip().split("\n\n") if corpo.strip() else []:
        nome, dados = bloco.split("\n")
        eventos.append(
            (nome.removeprefix("event: "), json.loads(dados.removeprefix("data: ")))
        )
    return eventos


def _roteiro(prefixo: str, invalido: str) -> Roteiro:
    blocos: tuple[Texto | ChamadaDeFerramenta, ...] = (
        (Texto((prefixo,)),) if prefixo else ()
    ) + (
        ChamadaDeFerramenta(PROPOSTA),
        Texto((invalido, "nao deve chegar")),
    )
    return Roteiro(blocos=blocos)


def _resposta_falhou(
    fabrica: sessionmaker[Session], cid: str, prefixo: str
) -> tuple[int, int]:
    with fabrica() as sessao:
        pergunta = sessao.scalars(
            select(TutorMessage).where(TutorMessage.client_message_id == cid)
        ).one()
        respostas = sessao.scalars(
            select(TutorMessage).where(TutorMessage.reply_to_id == pergunta.id)
        ).all()
        assert len(respostas) == 1
        resposta = respostas[0]
        assert pergunta.role is Papel.USUARIO
        assert pergunta.content == "Uma missão?"
        assert resposta.status is StatusDaMensagem.FALHOU
        assert resposta.error_code == "provedor_indisponivel"
        assert resposta.content == prefixo
        assert not any(0xD800 <= ord(char) <= 0xDFFF for char in resposta.content)
        assert resposta.actions == []
        return pergunta.id, resposta.id


def _fechado(observado: ProvedorObservado) -> None:
    assert observado.fechados == [True]
    assert len(observado.geradores) == 1
    with pytest.raises(StopIteration):
        next(observado.geradores[0])


@pytest.mark.parametrize("prefixo", [PREFIXO, ""], ids=["com-prefixo", "sem-prefixo"])
@pytest.mark.parametrize(
    "invalido",
    [
        texto
        for surrogate in ("\ud800", "\udbff", "\udc00", "\udfff")
        for texto in (
            surrogate,
            surrogate + "abc",
            "a" + surrogate + "b",
            "abc" + surrogate,
        )
    ],
    ids=[
        f"{ponto}-{posicao}"
        for ponto in ("d800", "dbff", "dc00", "dfff")
        for posicao in ("isolado", "inicial", "intermediario", "final")
    ],
)
def test_delta_surrogate_termina_sse_sem_emitir_ou_gravar_texto_invalido(
    cliente: TestClient,
    fabrica: sessionmaker[Session],
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    tutoria_observada: tuple[Tutoria, ProvedorObservado],
    prefixo: str,
    invalido: str,
) -> None:
    _, observado = tutoria_observada
    falso.roteiro = _roteiro(prefixo, invalido)
    antes = _contagens(fabrica)
    cid = conversa.id("delta-surrogate-http")
    resposta = cliente.post(
        "/api/tutoring/messages",
        json={"client_message_id": cid, "content": "Uma missão?"},
    )
    assert resposta.status_code == 200
    assert resposta.headers["content-type"].startswith("text/event-stream")
    eventos = _eventos(resposta.text)
    assert [nome for nome, _ in eventos] == [
        "user_message",
        *(["delta"] if prefixo else []),
        "error",
    ]
    assert eventos[-1] == ("error", {"code": "provedor_indisponivel"})
    assert [dados["text"] for nome, dados in eventos if nome == "delta"] == (
        [prefixo] if prefixo else []
    )
    assert not any(0xD800 <= ord(char) <= 0xDFFF for char in resposta.text)
    _resposta_falhou(fabrica, cid, prefixo)
    assert _contagens(fabrica) == antes
    _fechado(observado)
    assert len(falso.recebidas) == 1


@pytest.mark.parametrize("prefixo", [PREFIXO, ""], ids=["com-prefixo", "sem-prefixo"])
@pytest.mark.parametrize("invalido", ["a\ud800b", "a\udfffb"], ids=["alto", "baixo"])
def test_erro_do_delta_so_e_emitido_depois_de_falha_commitada_e_provedor_fechado(
    fabrica: sessionmaker[Session],
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    tutoria_observada: tuple[Tutoria, ProvedorObservado],
    prefixo: str,
    invalido: str,
) -> None:
    tutoria, observado = tutoria_observada
    falso.roteiro = _roteiro(prefixo, invalido)
    cid = conversa.id("delta-surrogate-servico")
    antes = _contagens(fabrica)
    with fabrica() as sessao:
        preparo = preparar_turno(
            sessao,
            user_id=1,
            client_message_id=cid,
            conteudo="Uma missão?",
            tutoria=tutoria,
            clock=lambda: AGORA,
        )
        sessao.commit()
    assert isinstance(preparo, ParaGerar)
    gerador = transmitir(fabrica, preparo, tutoria, clock=lambda: AGORA)
    eventos = []
    try:
        for evento in gerador:
            eventos.append(evento)
            if isinstance(evento, RespostaFalhou):
                assert evento.codigo is CodigoDoStream.PROVEDOR_INDISPONIVEL
                _resposta_falhou(fabrica, cid, prefixo)
                assert _contagens(fabrica) == antes
                _fechado(observado)
    finally:
        gerador.close()
    assert isinstance(eventos[0], PerguntaGravada)
    assert eventos[1:] == [
        *([Trecho(prefixo)] if prefixo else []),
        RespostaFalhou(CodigoDoStream.PROVEDOR_INDISPONIVEL),
    ]


def test_reenviar_apos_delta_surrogate_cria_so_resposta_nova_e_preserva_falha(
    cliente: TestClient,
    fabrica: sessionmaker[Session],
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    tutoria_observada: tuple[Tutoria, ProvedorObservado],
) -> None:
    _, observado = tutoria_observada
    cid = conversa.id("delta-surrogate-reenvio")
    corpo = {"client_message_id": cid, "content": "Uma missão?"}
    antes = _contagens(fabrica)
    falso.roteiro = _roteiro(PREFIXO, "a\ud800b")
    primeira = _eventos(cliente.post("/api/tutoring/messages", json=corpo).text)
    assert primeira and primeira[-1] == ("error", {"code": "provedor_indisponivel"})
    pergunta_id, falha_id = _resposta_falhou(fabrica, cid, PREFIXO)
    falso.roteiro = Roteiro(blocos=(Texto(("Resposta válida 🗡️\n漢字",)),))
    reenvio = cliente.post("/api/tutoring/messages", json=corpo)
    assert reenvio.status_code == 200
    eventos = _eventos(reenvio.text)
    assert [nome for nome, _ in eventos] == ["user_message", "delta", "done"]
    assert eventos[0][1]["id"] == pergunta_id
    assert eventos[-1][1]["id"] != falha_id
    assert eventos[-1][1]["content"] == "Resposta válida 🗡️\n漢字"
    with fabrica() as sessao:
        pergunta = sessao.scalars(
            select(TutorMessage).where(TutorMessage.client_message_id == cid)
        ).one()
        respostas = sessao.scalars(
            select(TutorMessage)
            .where(TutorMessage.reply_to_id == pergunta.id)
            .order_by(TutorMessage.id)
        ).all()
        assert len(respostas) == 2
        assert respostas[0].id == falha_id
        assert respostas[0].status is StatusDaMensagem.FALHOU
        assert respostas[0].content == PREFIXO
        assert respostas[1].status is StatusDaMensagem.COMPLETA
        assert respostas[1].content == "Resposta válida 🗡️\n漢字"
    assert _contagens(fabrica) == antes
    assert len(falso.recebidas) == 2
    assert observado.fechados == [True, True]


@pytest.mark.parametrize(
    "alvo", ["🚀", "\ud83d\ude80"], ids=["emoji", "par-json-escapado"]
)
def test_deltas_unicode_validos_continuam_completos_e_propoem_acao(
    cliente: TestClient,
    fabrica: sessionmaker[Session],
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    tutoria_observada: tuple[Tutoria, ProvedorObservado],
    alvo: str,
) -> None:
    _, observado = tutoria_observada
    falso.roteiro = Roteiro(
        blocos=(
            Texto(("Olá 🗡️\n", alvo + "Vamos estudar 漢字.")),
            ChamadaDeFerramenta(PROPOSTA),
        )
    )
    cid = conversa.id("delta-unicode-8-valido")
    antes = _contagens(fabrica)
    resposta = cliente.post(
        "/api/tutoring/messages",
        json={"client_message_id": cid, "content": "Uma missão?"},
    )
    assert resposta.status_code == 200
    eventos = _eventos(resposta.text)
    assert [nome for nome, _ in eventos] == ["user_message", "delta", "delta", "done"]
    assert [dados["text"] for nome, dados in eventos if nome == "delta"] == [
        "Olá 🗡️\n",
        "🚀Vamos estudar 漢字.",
    ]
    assert eventos[-1][1]["content"] == "Olá 🗡️\n🚀Vamos estudar 漢字."
    assert eventos[-1][1]["status"] == "completa"
    assert len(eventos[-1][1]["actions"]) == 1
    with fabrica() as sessao:
        resposta_gravada = sessao.get(TutorMessage, eventos[-1][1]["id"])
        assert resposta_gravada is not None
        assert resposta_gravada.content == "Olá 🗡️\n🚀Vamos estudar 漢字."
        assert resposta_gravada.status is StatusDaMensagem.COMPLETA
        assert len(resposta_gravada.actions) == 1
        assert resposta_gravada.actions[0].payload == PROPOSTA
    depois = _contagens(fabrica)
    assert depois[:-1] == antes[:-1]
    assert depois[-1] == antes[-1] + 1
    _fechado(observado)
    assert len(falso.recebidas) == 1
