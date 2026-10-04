"""Limite de tokens preserva o parcial como interrompido, sem proposta.

O contrato atual (pendencias 45 e 120) usa done/interrompida/resposta_longa,
nao error/falhou. As garantias locais de commit, fechamento, texto seguro e
proposta descartada continuam verificadas contra o SDK e o banco reais.
"""

import json
from collections.abc import Callable, Generator, Iterator
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

import anthropic
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.clock import get_clock
from focusquest.core.database import get_engine
from focusquest.main import app
from focusquest.modules.missions.models import Mission, MissionOperation, WeeklyPlan
from focusquest.modules.progression.models import UserAchievement, XpEntry
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.domain import Papel, StatusDaMensagem
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.provider import (
    Delta,
    EventoDoProvedor,
    Ferramenta,
    Fim,
    MensagemDoTurno,
    Parada,
    Proposta,
    Provedor,
    Turno,
)
from focusquest.modules.tutoring.service import (
    ParaGerar,
    PerguntaGravada,
    RespostaConcluida,
    Trecho,
    Tutoria,
    preparar_turno,
    transmitir,
)
from integration.conftest import Conversa
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    MotivoDeParada,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
    eventos_do_roteiro,
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

    def avaliar(self, turno: Turno, ferramenta: Ferramenta) -> dict[str, Any] | None:
        return self.provedor.avaliar(turno, ferramenta)


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


def _roteiro(prefixo: str) -> Roteiro:
    blocos: tuple[Texto | ChamadaDeFerramenta, ...] = (
        (Texto((prefixo,)),) if prefixo else ()
    ) + (ChamadaDeFerramenta(PROPOSTA),)
    return Roteiro(blocos=blocos, stop_reason="max_tokens")


def _resposta_interrompida(
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
        assert resposta.status is StatusDaMensagem.INTERROMPIDA
        assert resposta.error_code == "resposta_longa"
        assert resposta.content == prefixo
        assert resposta.actions == []
        return pergunta.id, resposta.id


def _fechado(observado: ProvedorObservado) -> None:
    assert observado.fechados == [True]
    assert len(observado.geradores) == 1
    with pytest.raises(StopIteration):
        next(observado.geradores[0])


@pytest.mark.parametrize("prefixo", [PREFIXO, ""], ids=["com-prefixo", "sem-prefixo"])
def test_max_tokens_termina_sse_interrompida_sem_gravar_proposta(
    cliente: TestClient,
    fabrica: sessionmaker[Session],
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    tutoria_observada: tuple[Tutoria, ProvedorObservado],
    prefixo: str,
) -> None:
    _, observado = tutoria_observada
    falso.roteiro = _roteiro(prefixo)
    antes = _contagens(fabrica)
    cid = conversa.id("max-tokens-http")
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
        "done",
    ]
    assert eventos[-1][1]["status"] == "interrompida"
    assert eventos[-1][1]["error_code"] == "resposta_longa"
    assert eventos[-1][1]["content"] == prefixo
    assert eventos[-1][1]["actions"] == []
    assert [dados["text"] for nome, dados in eventos if nome == "delta"] == (
        [prefixo] if prefixo else []
    )
    _resposta_interrompida(fabrica, cid, prefixo)
    assert _contagens(fabrica) == antes
    _fechado(observado)
    assert len(falso.recebidas) == 1


@pytest.mark.parametrize("prefixo", [PREFIXO, ""], ids=["com-prefixo", "sem-prefixo"])
def test_max_tokens_so_e_emitido_depois_de_interrupcao_commitada_e_provedor_fechado(
    fabrica: sessionmaker[Session],
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    tutoria_observada: tuple[Tutoria, ProvedorObservado],
    prefixo: str,
) -> None:
    tutoria, observado = tutoria_observada
    falso.roteiro = _roteiro(prefixo)
    cid = conversa.id("max-tokens-servico")
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
            if isinstance(evento, RespostaConcluida):
                assert evento.mensagem.status is StatusDaMensagem.INTERROMPIDA
                assert evento.mensagem.error_code == "resposta_longa"
                assert evento.mensagem.content == prefixo
                assert evento.mensagem.actions == []
                _resposta_interrompida(fabrica, cid, prefixo)
                assert _contagens(fabrica) == antes
                _fechado(observado)
    finally:
        gerador.close()
    assert isinstance(eventos[0], PerguntaGravada)
    assert eventos[1:-1] == ([Trecho(prefixo)] if prefixo else [])
    assert isinstance(eventos[-1], RespostaConcluida)


def test_reenviar_apos_max_tokens_cria_so_resposta_nova_e_preserva_interrupcao(
    cliente: TestClient,
    fabrica: sessionmaker[Session],
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    tutoria_observada: tuple[Tutoria, ProvedorObservado],
) -> None:
    _, observado = tutoria_observada
    cid = conversa.id("max-tokens-reenvio")
    corpo = {"client_message_id": cid, "content": "Uma missão?"}
    antes = _contagens(fabrica)
    falso.roteiro = _roteiro(PREFIXO)
    primeira = _eventos(cliente.post("/api/tutoring/messages", json=corpo).text)
    assert primeira and primeira[-1][0] == "done"
    assert primeira[-1][1]["status"] == "interrompida"
    assert primeira[-1][1]["error_code"] == "resposta_longa"
    pergunta_id, falha_id = _resposta_interrompida(fabrica, cid, PREFIXO)
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
        assert respostas[0].status is StatusDaMensagem.INTERROMPIDA
        assert respostas[0].content == PREFIXO
        assert respostas[1].status is StatusDaMensagem.COMPLETA
        assert respostas[1].content == "Resposta válida 🗡️\n漢字"
    assert _contagens(fabrica) == antes
    assert len(falso.recebidas) == 2
    assert observado.fechados == [True, True]


@pytest.mark.parametrize("motivo", ["end_turn", "tool_use", "stop_sequence"])
def test_encerramentos_validos_continuam_completos_e_propoem_acao(
    cliente: TestClient,
    fabrica: sessionmaker[Session],
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    tutoria_observada: tuple[Tutoria, ProvedorObservado],
    motivo: MotivoDeParada,
) -> None:
    _, observado = tutoria_observada
    falso.roteiro = Roteiro(
        stop_reason=motivo,
        blocos=(
            Texto(("Olá 🗡️\n", "Vamos estudar 漢字.")),
            ChamadaDeFerramenta(PROPOSTA),
        ),
    )
    cid = conversa.id("stop-reason-valido")
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
        "Vamos estudar 漢字.",
    ]
    assert eventos[-1][1]["content"] == PREFIXO
    assert eventos[-1][1]["status"] == "completa"
    assert len(eventos[-1][1]["actions"]) == 1
    with fabrica() as sessao:
        resposta_gravada = sessao.get(TutorMessage, eventos[-1][1]["id"])
        assert resposta_gravada is not None
        assert resposta_gravada.content == PREFIXO
        assert resposta_gravada.status is StatusDaMensagem.COMPLETA
        assert len(resposta_gravada.actions) == 1
        assert resposta_gravada.actions[0].payload == PROPOSTA
    depois = _contagens(fabrica)
    assert depois[:-1] == antes[:-1]
    assert depois[-1] == antes[-1] + 1
    _fechado(observado)
    assert len(falso.recebidas) == 1


def test_sdk_enriquece_message_stop_com_motivo_e_proposta_completa(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = _roteiro(PREFIXO)
    eventos_brutos = eventos_do_roteiro(falso.roteiro)
    assert eventos_brutos[-2].type == "message_delta"
    assert eventos_brutos[-2].delta.stop_reason == "max_tokens"
    assert eventos_brutos[-1].type == "message_stop"
    with (
        anthropic.Anthropic(
            api_key="sk-ant-teste", base_url=falso.url, max_retries=0, timeout=1.0
        ) as cliente_sdk,
        cliente_sdk.messages.stream(
            model="claude-opus-5",
            max_tokens=256,
            messages=[{"role": "user", "content": "Uma missão?"}],
        ) as stream,
    ):
        eventos = list(stream)
    fim = eventos[-1]
    assert fim.type == "message_stop"
    assert fim.message.stop_reason == "max_tokens"
    assert fim.message.content[-1].type == "tool_use"
    assert fim.message.content[-1].input == PROPOSTA
    assert len(falso.recebidas) == 1


def test_adaptador_classifica_max_tokens_depois_da_proposta_como_corte(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = _roteiro(PREFIXO)
    provedor = ProvedorAnthropic(
        chave="sk-ant-teste",
        base_url=falso.url,
        modelo="claude-opus-5",
        max_tokens=256,
        timeout_segundos=1.0,
        fallback=False,
    )
    turno = Turno(sistema="Teste", mensagens=(MensagemDoTurno("user", "Uma missão?"),))
    eventos: list[EventoDoProvedor] = []
    gerador = provedor.responder(turno)
    try:
        eventos.extend(gerador)
    finally:
        gerador.close()
    assert eventos == [
        Delta(PREFIXO),
        Proposta("create_mission", PROPOSTA),
        Fim(Parada.CORTADA),
    ]
    with pytest.raises(StopIteration):
        next(gerador)
    assert len(falso.recebidas) == 1
