"""Textos JSON validos devem ser representaveis no PostgreSQL antes de efeitos."""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.clock import get_clock
from focusquest.core.database import get_engine, get_session
from focusquest.main import app
from focusquest.modules.missions.domain import MissionState
from focusquest.modules.missions.models import Mission, MissionOperation, WeeklyPlan
from focusquest.modules.progression.models import UserAchievement, XpEntry
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.domain import (
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.service import Tutoria
from integration.conftest import Conversa
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

AGORA = datetime(2026, 9, 21, 15, tzinfo=UTC)
TEXTO = "  Revisão 🗡️\nÁrvore de decisões 漢字  "
PROPOSTA: dict[str, Any] = {
    "instructions": "Ler o capítulo",
    "completion_criterion": "Entregar resumo",
    "difficulty": 2,
    "estimated_minutes": 30,
    "deadline": "2026-09-22T15:00:00Z",
}
TABELAS = (
    Mission,
    MissionOperation,
    XpEntry,
    UserAchievement,
    WeeklyPlan,
    TutorMessage,
    TutorAction,
)


@pytest.fixture
def cliente(
    session: Session, banco_migrado: Engine, tutoria: Tutoria
) -> Iterator[TestClient]:
    sobrepostos: dict[Callable[..., Any], Callable[..., Any]] = {
        get_session: lambda: session,
        get_engine: lambda: banco_migrado,
        get_clock: lambda: lambda: AGORA,
        get_tutoria: lambda: tutoria,
    }
    app.dependency_overrides.update(sobrepostos)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
    for chave in sobrepostos:
        app.dependency_overrides.pop(chave, None)


def _contagens(session: Session) -> tuple[int, ...]:
    return tuple(
        session.scalar(select(func.count()).select_from(tabela)) or 0
        for tabela in TABELAS
    )


def _plano() -> dict[str, Any]:
    diaria = {chave: valor for chave, valor in PROPOSTA.items() if chave != "deadline"}
    return {
        "week_start": "2026-09-21",
        "days": [dict(diaria) for _ in range(7)],
        "bonus": {
            chave: valor for chave, valor in diaria.items() if chave != "difficulty"
        },
    }


def _proposta(session: Session) -> TutorAction:
    pergunta = TutorMessage(
        user_id=1,
        role=Papel.USUARIO,
        content="Oi",
        status=StatusDaMensagem.COMPLETA,
        client_message_id="nul-confirmar",
        created_at=AGORA,
    )
    session.add(pergunta)
    session.flush()
    resposta = TutorMessage(
        user_id=1,
        role=Papel.TUTORA,
        content="Uma missão",
        status=StatusDaMensagem.COMPLETA,
        reply_to_id=pergunta.id,
        created_at=AGORA,
    )
    session.add(resposta)
    session.flush()
    acao = TutorAction(
        message_id=resposta.id,
        kind=TipoDeAcao.CRIAR_MISSAO,
        payload=PROPOSTA,
        state=EstadoDaAcao.PROPOSTA,
        created_at=AGORA,
    )
    session.add(acao)
    session.flush()
    return acao


def _recusa(resposta: Any, local: list[str | int]) -> None:
    assert resposta.status_code == 422, resposta.text
    (erro,) = resposta.json()["detail"]
    assert erro["loc"] == ["body", *local]
    assert erro["type"] == "value_error"
    assert "texto nao pode conter o caractere NUL (U+0000)" in erro["msg"]


@pytest.mark.parametrize("campo", ["instructions", "completion_criterion"])
def test_missao_com_nul_e_422_sem_efeitos(
    cliente: TestClient, session: Session, campo: str
) -> None:
    antes = _contagens(session)
    resposta = cliente.post("/api/missions", json=PROPOSTA | {campo: "a\x00b"})
    _recusa(resposta, [campo])
    assert _contagens(session) == antes


@pytest.mark.parametrize("parte", ["days", "bonus"])
@pytest.mark.parametrize("campo", ["instructions", "completion_criterion"])
def test_plano_com_nul_e_422_sem_efeitos(
    cliente: TestClient, session: Session, parte: str, campo: str
) -> None:
    corpo = _plano()
    local: list[str | int] = [parte, campo]
    if parte == "days":
        corpo[parte][3][campo] = "a\x00b"
        local.insert(1, 3)
    else:
        corpo[parte][campo] = "a\x00b"
    antes = _contagens(session)
    resposta = cliente.post("/api/plans", json=corpo)
    _recusa(resposta, local)
    assert _contagens(session) == antes


def test_conclusao_com_nul_e_422_sem_xp_ou_transicao(
    cliente: TestClient, session: Session
) -> None:
    criada = cliente.post("/api/missions", json=PROPOSTA).json()
    mission_id = criada["id"]
    antes = _contagens(session)
    resposta = cliente.post(
        f"/api/missions/{mission_id}/complete", json={"operation_id": "a\x00b"}
    )
    _recusa(resposta, ["operation_id"])
    assert _contagens(session) == antes
    session.expire_all()
    missao = session.get(Mission, mission_id)
    assert missao is not None
    assert missao.state is MissionState.PENDENTE
    assert missao.started_at is None and missao.completed_at is None


@pytest.mark.parametrize("campo", ["content", "client_message_id"])
def test_pergunta_com_nul_e_422_sem_gravar_ou_chamar_provedor(
    cliente: TestClient, session: Session, falso: ServidorAnthropicFalso, campo: str
) -> None:
    antes = _contagens(session)
    corpo = {"content": "Oi", "client_message_id": "nul-pergunta", campo: "a\x00b"}
    resposta = cliente.post("/api/tutoring/messages", json=corpo)
    _recusa(resposta, [campo])
    assert _contagens(session) == antes
    assert falso.recebidas == []


def test_confirmacao_com_nul_preserva_a_proposta(
    cliente: TestClient, session: Session, falso: ServidorAnthropicFalso
) -> None:
    acao = _proposta(session)
    antes = _contagens(session)
    resposta = cliente.post(
        f"/api/tutoring/actions/{acao.id}/confirm", json={"operation_id": "a\x00b"}
    )
    _recusa(resposta, ["operation_id"])
    assert _contagens(session) == antes
    session.refresh(acao)
    assert acao.state is EstadoDaAcao.PROPOSTA
    assert (
        acao.mission_id is None
        and acao.operation_id is None
        and acao.decided_at is None
    )
    assert falso.recebidas == []


@pytest.mark.parametrize("campo", ["instructions", "completion_criterion"])
def test_proposta_do_modelo_com_nul_falha_sem_criar_acao(
    cliente: TestClient,
    session: Session,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    fabrica: sessionmaker[Session],
    campo: str,
) -> None:
    falso.roteiro = Roteiro(
        blocos=(
            Texto(("Vamos estudar",)),
            ChamadaDeFerramenta(PROPOSTA | {campo: "a\x00b"}),
        )
    )
    antes = _contagens(session)
    cid = conversa.id(f"proposta-nul-{campo}")
    resposta = cliente.post(
        "/api/tutoring/messages",
        json={"client_message_id": cid, "content": "Uma missão?"},
    )
    assert resposta.status_code == 200
    assert 'event: error\ndata: {"code":"proposta_invalida"}' in resposta.text
    assert "event: done" not in resposta.text
    with fabrica() as leitura:
        depois = _contagens(leitura)
        assert depois[:5] == antes[:5]
        assert depois[5] == antes[5] + 2
        assert depois[6] == antes[6]
        pergunta = leitura.scalars(
            select(TutorMessage).where(TutorMessage.client_message_id == cid)
        ).one()
        resposta_gravada = leitura.scalars(
            select(TutorMessage).where(TutorMessage.reply_to_id == pergunta.id)
        ).one()
        assert resposta_gravada.status is StatusDaMensagem.FALHOU
        assert resposta_gravada.error_code == "proposta_invalida"
        assert resposta_gravada.content == "Vamos estudar"
    assert len(falso.recebidas) == 1


def test_missao_e_conclusao_preservam_unicode(
    cliente: TestClient, session: Session
) -> None:
    resposta = cliente.post(
        "/api/missions",
        json=PROPOSTA | {"instructions": TEXTO, "completion_criterion": TEXTO},
    )
    assert resposta.status_code == 201
    mission_id = resposta.json()["id"]
    session.expire_all()
    missao = session.get(Mission, mission_id)
    assert missao is not None
    assert missao.instructions == TEXTO and missao.completion_criterion == TEXTO
    operacao = " conclusão-🗡️\n漢字 "
    concluida = cliente.post(
        f"/api/missions/{mission_id}/complete", json={"operation_id": operacao}
    )
    assert concluida.status_code == 200
    session.expire_all()
    assert (
        session.scalars(
            select(MissionOperation.operation_id).where(
                MissionOperation.mission_id == mission_id
            )
        ).one()
        == operacao
    )


def test_plano_preserva_unicode_em_diarias_e_especial(
    cliente: TestClient, session: Session
) -> None:
    corpo = _plano()
    for diaria in corpo["days"]:
        diaria.update(instructions=TEXTO, completion_criterion=TEXTO)
    corpo["bonus"].update(instructions=TEXTO, completion_criterion=TEXTO)
    resposta = cliente.post("/api/plans", json=corpo)
    assert resposta.status_code == 201
    session.expire_all()
    missoes = session.scalars(select(Mission)).all()
    assert len(missoes) == 8
    assert all(
        m.instructions == TEXTO and m.completion_criterion == TEXTO for m in missoes
    )


def test_pergunta_preserva_unicode_e_o_trim_existente(
    cliente: TestClient,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    fabrica: sessionmaker[Session],
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("Resposta válida",)),))
    cid = conversa.id("pergunta-🗡️\n漢字 ")
    resposta = cliente.post(
        "/api/tutoring/messages", json={"client_message_id": cid, "content": TEXTO}
    )
    assert resposta.status_code == 200
    assert "event: done" in resposta.text
    with fabrica() as leitura:
        pergunta = leitura.scalars(
            select(TutorMessage).where(TutorMessage.client_message_id == cid)
        ).one()
        assert pergunta.content == TEXTO.strip()
        assert pergunta.client_message_id == cid
    assert len(falso.recebidas) == 1


def test_confirmacao_preserva_identificador_unicode(
    cliente: TestClient, session: Session
) -> None:
    acao = _proposta(session)
    operacao = " confirmação-🗡️\n漢字 "
    resposta = cliente.post(
        f"/api/tutoring/actions/{acao.id}/confirm", json={"operation_id": operacao}
    )
    assert resposta.status_code == 200
    session.refresh(acao)
    assert acao.operation_id == operacao
    assert acao.state is EstadoDaAcao.EXECUTADA


@pytest.mark.parametrize(
    "identificador,tipo,mensagem,contexto",
    [
        (
            "",
            "string_too_short",
            "String should have at least 1 character",
            {"min_length": 1},
        ),
        (
            "🗡" * 201,
            "string_too_long",
            "String should have at most 200 characters",
            {"max_length": 200},
        ),
        (
            " " + "漢" * 200 + " ",
            "string_too_long",
            "String should have at most 200 characters",
            {"max_length": 200},
        ),
    ],
    ids=["vazio", "unicode-201", "unicode-200-mais-padding"],
)
def test_identificador_vazio_ou_acima_do_teto_e_422_sem_efeitos(
    cliente: TestClient,
    session: Session,
    falso: ServidorAnthropicFalso,
    identificador: str,
    tipo: str,
    mensagem: str,
    contexto: dict[str, int],
) -> None:
    antes = _contagens(session)
    resposta = cliente.post(
        "/api/tutoring/messages",
        json={"client_message_id": identificador, "content": "Oi"},
    )
    assert resposta.status_code == 422
    (erro,) = resposta.json()["detail"]
    assert erro["loc"] == ["body", "client_message_id"]
    assert erro["type"] == tipo
    assert erro["msg"] == mensagem
    assert erro["ctx"] == contexto
    assert erro["input"] == identificador
    assert _contagens(session) == antes
    assert falso.recebidas == []


@pytest.mark.parametrize(
    "identificador",
    ["🗡" * 200, " " + "漢" * 198 + " "],
    ids=["unicode-200", "unicode-198-mais-padding"],
)
def test_pergunta_com_identificador_unicode_no_teto_e_persistida_sem_trim(
    cliente: TestClient,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    fabrica: sessionmaker[Session],
    identificador: str,
) -> None:
    conversa.client_message_ids.append(identificador)
    falso.roteiro = Roteiro(blocos=(Texto(("Olá",)),))
    resposta = cliente.post(
        "/api/tutoring/messages",
        json={"client_message_id": identificador, "content": "Oi"},
    )
    assert resposta.status_code == 200
    assert "event: done" in resposta.text
    with fabrica() as leitura:
        pergunta = leitura.scalars(
            select(TutorMessage).where(TutorMessage.client_message_id == identificador)
        ).one()
        assert pergunta.client_message_id == identificador
        assert pergunta.content == "Oi"
    assert len(falso.recebidas) == 1


@pytest.mark.parametrize("acao", ["start", "reschedule"])
def test_chave_de_inicio_ou_reagendamento_com_nul_recusa_antes_de_efeitos(
    cliente: TestClient, session: Session, acao: str
) -> None:
    """As operacoes do F preservam a mesma regra de idempotencia persistivel."""
    corpo: dict[str, Any] = {"operation_id": "a\x00b"}
    if acao == "reschedule":
        corpo.update(new_deadline="2026-09-23T15:00:00Z", reason="falta_de_tempo")
    antes = _contagens(session)
    resposta = cliente.post(f"/api/missions/1/{acao}", json=corpo)
    _recusa(resposta, ["operation_id"])
    assert _contagens(session) == antes
