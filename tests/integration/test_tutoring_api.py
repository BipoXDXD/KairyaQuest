"""As rotas da tutoria: contrato de entrada, de saida, de erro e o stream."""

import json
import logging
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.clock import get_clock
from focusquest.core.database import get_engine, get_session
from focusquest.main import CodigoDeErro, app
from focusquest.modules.missions.schemas import TAMANHO_MAXIMO_DO_IDENTIFICADOR
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.domain import (
    PRAZO_EXPIRADO,
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.schemas import TAMANHO_MAXIMO_DA_PERGUNTA
from focusquest.modules.tutoring.service import Tutoria
from integration.conftest import Conversa
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    MotivoDeParada,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

ESTUDANTE = 1
AGORA = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
SEGREDO = "sk-ant-segredo-que-nao-pode-vazar"
PROPOSTA: dict[str, Any] = {
    "instructions": "Ler o capitulo 3",
    "completion_criterion": "Resumo de uma pagina",
    "difficulty": 2,
    "estimated_minutes": 30,
    "deadline": "2026-09-20T12:00:00Z",
}


def _sobrepor(chave: Any, valor: Any) -> None:
    app.dependency_overrides[chave] = valor


@pytest.fixture
def cliente(banco_migrado: Engine, tutoria: Tutoria) -> Iterator[TestClient]:
    """A tutoria contra o falso, o banco de teste e o relogio fixo.

    Commita de verdade: o stream grava em sessoes proprias. Quem usa este
    cliente registra seus `client_message_id` na fixture `conversa`.
    """
    sobrepostos: dict[Callable[..., Any], Callable[..., Any]] = {
        get_engine: lambda: banco_migrado,
        get_tutoria: lambda: tutoria,
        get_clock: lambda: lambda: AGORA,
    }
    app.dependency_overrides.update(sobrepostos)
    with TestClient(app) as c:
        yield c
    for chave in sobrepostos:
        app.dependency_overrides.pop(chave, None)


@pytest.fixture
def cliente_na_sessao(session: Session) -> Iterator[TestClient]:
    """Leituras e decisoes na sessao do teste, revertida no fim."""
    sobrepostos: dict[Callable[..., Any], Callable[..., Any]] = {
        get_session: lambda: session,
        get_clock: lambda: lambda: AGORA,
    }
    app.dependency_overrides.update(sobrepostos)
    with TestClient(app) as c:
        yield c
    for chave in sobrepostos:
        app.dependency_overrides.pop(chave, None)


def _eventos(corpo: str) -> list[tuple[str, dict[str, Any]]]:
    """Le o `text/event-stream` como (nome, dados)."""
    eventos = []
    for bloco in corpo.strip().split("\n\n"):
        nome, dados = bloco.split("\n")
        corpo_do_evento = json.loads(dados.removeprefix("data: "))
        eventos.append((nome.removeprefix("event: "), corpo_do_evento))
    return eventos


def _enviar(cliente: TestClient, cid: str, conteudo: str = "Me da uma missao?") -> Any:
    return cliente.post(
        "/api/tutoring/messages", json={"client_message_id": cid, "content": conteudo}
    )


def _acao_proposta(session: Session, prazo: str = PROPOSTA["deadline"]) -> int:
    pergunta = TutorMessage(
        user_id=ESTUDANTE,
        role=Papel.USUARIO,
        content="oi",
        status=StatusDaMensagem.COMPLETA,
        client_message_id="api-acao",
        created_at=AGORA,
    )
    session.add(pergunta)
    session.flush()
    resposta = TutorMessage(
        user_id=ESTUDANTE,
        role=Papel.TUTORA,
        content="toma",
        status=StatusDaMensagem.COMPLETA,
        reply_to_id=pergunta.id,
        created_at=AGORA,
    )
    session.add(resposta)
    session.flush()
    acao = TutorAction(
        message_id=resposta.id,
        kind=TipoDeAcao.CRIAR_MISSAO,
        payload=PROPOSTA | {"deadline": prazo},
        state=EstadoDaAcao.PROPOSTA,
        created_at=AGORA,
    )
    session.add(acao)
    session.flush()
    return acao.id


# --- Status ----------------------------------------------------------------


def test_status_disponivel_com_tutoria(cliente: TestClient) -> None:
    assert cliente.get("/api/tutoring/status").json() == {"available": True}


def test_status_indisponivel_sem_chave(cliente: TestClient) -> None:
    _sobrepor(get_tutoria, lambda: None)
    assert cliente.get("/api/tutoring/status").json() == {"available": False}


# --- Enviar ----------------------------------------------------------------


def test_sem_chave_responde_503_e_nao_grava(
    cliente: TestClient, fabrica: sessionmaker[Session], conversa: Conversa
) -> None:
    _sobrepor(get_tutoria, lambda: None)
    cid = conversa.id("sem-chave")
    resposta = _enviar(cliente, cid)
    assert resposta.status_code == 503
    assert resposta.json()["code"] == "provedor_nao_configurado"
    with fabrica() as sessao:
        assert (
            sessao.scalar(
                select(func.count())
                .select_from(TutorMessage)
                .where(TutorMessage.client_message_id == cid)
            )
            == 0
        )


def test_o_stream_na_ordem_do_contrato(
    cliente: TestClient, falso: ServidorAnthropicFalso, conversa: Conversa
) -> None:
    falso.roteiro = Roteiro(
        blocos=(Texto(("Bora, ", "estudar!")), ChamadaDeFerramenta(PROPOSTA))
    )
    resposta = _enviar(cliente, conversa.id("stream"))

    assert resposta.status_code == 200
    assert resposta.headers["content-type"].startswith("text/event-stream")
    eventos = _eventos(resposta.text)
    assert [nome for nome, _ in eventos] == ["user_message", "delta", "delta", "done"]
    pergunta = eventos[0][1]
    assert (pergunta["role"], pergunta["status"]) == ("user", "completa")
    assert eventos[1][1] == {"text": "Bora, "}
    final = eventos[-1][1]
    assert (final["role"], final["status"], final["content"]) == (
        "tutor",
        "completa",
        "Bora, estudar!",
    )
    assert final["reply_to_id"] == pergunta["id"]
    (acao,) = final["actions"]
    assert (acao["kind"], acao["state"], acao["payload"]) == (
        "create_mission",
        "proposta",
        PROPOSTA,
    )


@pytest.mark.parametrize("stop_reason", ["max_tokens", "model_context_window_exceeded"])
def test_resposta_cortada_chega_no_done_como_interrompida_com_o_motivo(
    cliente: TestClient,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    stop_reason: MotivoDeParada,
) -> None:
    """Pendencias 45, 120 e 122, pelo contrato: o `done` traz a mensagem com
    `status` `interrompida`, sem acao e com `error_code` `resposta_longa` --
    e por ele que a tela sabe que a resposta ficou longa demais, e nao que o
    resultado e desconhecido. Ate o lote g-tifa este teste fixava
    `error_code` nulo; a mudanca e a mudanca principal do incremento.

    A ferramenta completa antes do corte e o pior caso de proposito
    (ver `test_proposta_cortada_nao_vira_acao`)."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Comeco",)), ChamadaDeFerramenta(PROPOSTA)),
        stop_reason=stop_reason,
    )
    eventos = _eventos(_enviar(cliente, conversa.id("teto")).text)

    assert [nome for nome, _ in eventos] == ["user_message", "delta", "done"]
    final = eventos[-1][1]
    assert (final["status"], final["content"], final["actions"]) == (
        "interrompida",
        "Comeco",
        [],
    )
    assert final["error_code"] == "resposta_longa"
    *_, gravada = cliente.get("/api/tutoring/messages").json()
    assert (gravada["status"], gravada["error_code"]) == (
        "interrompida",
        "resposta_longa",
    )


def test_resposta_recusada_vira_evento_error_sem_o_parcial(
    cliente: TestClient, falso: ServidorAnthropicFalso, conversa: Conversa
) -> None:
    """Pendencia 120, pelo contrato: a recusa sai como `error`
    `resposta_recusada`, depois do `delta` que ja tinha saido; o historico
    traz a resposta `falhou` com o mesmo codigo e SEM o texto parcial."""
    falso.roteiro = Roteiro(blocos=(Texto(("Comeco",)),), stop_reason="refusal")
    eventos = _eventos(_enviar(cliente, conversa.id("recusa")).text)

    assert eventos[1:] == [
        ("delta", {"text": "Comeco"}),
        ("error", {"code": "resposta_recusada"}),
    ]
    *_, gravada = cliente.get("/api/tutoring/messages").json()
    assert (gravada["status"], gravada["content"], gravada["error_code"]) == (
        "falhou",
        "",
        "resposta_recusada",
    )


def test_falha_do_provedor_vira_evento_error(
    cliente: TestClient, falso: ServidorAnthropicFalso, conversa: Conversa
) -> None:
    falso.roteiro = Roteiro(status_http=500)
    eventos = _eventos(_enviar(cliente, conversa.id("falha")).text)
    assert eventos[-1] == ("error", {"code": "provedor_indisponivel"})


def test_pergunta_com_resposta_gerando_responde_409(
    cliente: TestClient,
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    conversa: Conversa,
) -> None:
    from focusquest.modules.tutoring.service import preparar_turno

    with fabrica() as sessao:
        preparar_turno(
            sessao,
            user_id=ESTUDANTE,
            client_message_id=conversa.id("viva"),
            conteudo="oi",
            tutoria=tutoria,
            clock=lambda: AGORA,
        )
        sessao.commit()
    resposta = _enviar(cliente, conversa.id("atropelo"))
    assert resposta.status_code == 409
    assert resposta.json()["code"] == "mensagem_em_andamento"


def test_mesmo_id_com_outro_conteudo_responde_409(
    cliente: TestClient, falso: ServidorAnthropicFalso, conversa: Conversa
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    cid = conversa.id("reuso")
    _enviar(cliente, cid, "primeira")
    resposta = _enviar(cliente, cid, "segunda")
    assert resposta.status_code == 409
    assert resposta.json()["code"] == "operacao_reutilizada"


def test_reenvio_de_respondida_devolve_done_sem_chamar_o_modelo(
    cliente: TestClient, falso: ServidorAnthropicFalso, conversa: Conversa
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    cid = conversa.id("reenvio")
    primeira = _eventos(_enviar(cliente, cid).text)
    segunda = _eventos(_enviar(cliente, cid).text)
    assert [n for n, _ in segunda] == ["user_message", "done"]
    assert segunda[-1][1]["id"] == primeira[-1][1]["id"]
    assert len(falso.recebidas) == 1


@pytest.mark.parametrize(
    "corpo",
    [
        {"client_message_id": "x", "content": ""},
        {"client_message_id": "x", "content": "   "},
        {"client_message_id": "x", "content": "a" * (TAMANHO_MAXIMO_DA_PERGUNTA + 1)},
        {"client_message_id": "", "content": "oi"},
        {"content": "oi"},
    ],
)
def test_corpo_invalido_responde_422_sem_code(
    cliente: TestClient, corpo: dict[str, Any]
) -> None:
    resposta = cliente.post("/api/tutoring/messages", json=corpo)
    assert resposta.status_code == 422
    assert "code" not in resposta.json()


# --- Listar ----------------------------------------------------------------


def test_listar_mensagens(cliente_na_sessao: TestClient, session: Session) -> None:
    _acao_proposta(session)
    (pergunta, resposta) = cliente_na_sessao.get("/api/tutoring/messages").json()
    assert pergunta["role"] == "user"
    assert resposta["actions"][0]["state"] == "proposta"


# --- Confirmar e recusar ---------------------------------------------------


def test_confirmar_devolve_acao_e_missao(
    cliente_na_sessao: TestClient, session: Session
) -> None:
    acao_id = _acao_proposta(session)
    resposta = cliente_na_sessao.post(
        f"/api/tutoring/actions/{acao_id}/confirm", json={"operation_id": "op-1"}
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["action"]["state"] == "executada"
    assert corpo["mission"]["instructions"] == "Ler o capitulo 3"
    assert corpo["action"]["mission_id"] == corpo["mission"]["id"]

    de_novo = cliente_na_sessao.post(
        f"/api/tutoring/actions/{acao_id}/confirm", json={"operation_id": "op-1"}
    )
    assert de_novo.json() == corpo


def test_confirmar_executada_com_chave_nova_responde_409(
    cliente_na_sessao: TestClient, session: Session
) -> None:
    acao_id = _acao_proposta(session)
    url = f"/api/tutoring/actions/{acao_id}/confirm"
    cliente_na_sessao.post(url, json={"operation_id": "op-1"})
    resposta = cliente_na_sessao.post(url, json={"operation_id": "op-2"})
    assert (resposta.status_code, resposta.json()["code"]) == (409, "transicao_ilegal")


@pytest.mark.parametrize(
    ("tamanho", "status"),
    [
        (TAMANHO_MAXIMO_DO_IDENTIFICADOR, 200),
        (TAMANHO_MAXIMO_DO_IDENTIFICADOR + 1, 422),
    ],
)
def test_confirmar_tem_teto_no_identificador_de_operacao(
    cliente_na_sessao: TestClient, session: Session, tamanho: int, status: int
) -> None:
    """O `operation_id` no limite confirma; um caractere a mais e 422, sem `code`."""
    acao_id = _acao_proposta(session)
    resposta = cliente_na_sessao.post(
        f"/api/tutoring/actions/{acao_id}/confirm", json={"operation_id": "o" * tamanho}
    )
    assert resposta.status_code == status, resposta.text
    if status == 422:
        assert "code" not in resposta.json()
        locais = [erro["loc"] for erro in resposta.json()["detail"]]
        assert ["body", "operation_id"] in locais


def test_prazo_expirado_responde_422_e_a_falha_fica_gravada(
    banco_migrado: Engine, conversa: Conversa
) -> None:
    """Com commit de verdade: a rota grava o `falhou` ANTES de responder 422.
    Na sessao do teste isso nao se distinguiria."""
    with Session(bind=banco_migrado) as sessao:
        acao_id = _acao_proposta(sessao, prazo="2026-09-19T11:00:00Z")
        sessao.commit()
    conversa.client_message_ids.append("api-acao")
    _sobrepor(get_engine, lambda: banco_migrado)
    _sobrepor(get_clock, lambda: lambda: AGORA)
    try:
        with TestClient(app) as c:
            resposta = c.post(
                f"/api/tutoring/actions/{acao_id}/confirm",
                json={"operation_id": "op-1"},
            )
    finally:
        app.dependency_overrides.pop(get_engine, None)
        app.dependency_overrides.pop(get_clock, None)
    assert resposta.status_code == 422
    assert resposta.json()["code"] == "prazo_expirado"
    with Session(bind=banco_migrado) as sessao:
        acao = sessao.get(TutorAction, acao_id)
        assert acao is not None
        assert (acao.state, acao.error_code) == (EstadoDaAcao.FALHOU, PRAZO_EXPIRADO)


def test_o_codigo_do_422_e_o_mesmo_gravado_na_acao() -> None:
    assert CodigoDeErro.PRAZO_EXPIRADO == PRAZO_EXPIRADO


def test_recusar(cliente_na_sessao: TestClient, session: Session) -> None:
    acao_id = _acao_proposta(session)
    url = f"/api/tutoring/actions/{acao_id}/reject"
    primeira = cliente_na_sessao.post(url)
    assert primeira.status_code == 200
    assert primeira.json()["action"]["state"] == "recusada"
    assert cliente_na_sessao.post(url).json() == primeira.json()


def test_acao_inexistente_responde_404(
    cliente_na_sessao: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="focusquest")
    for sufixo, corpo in (("confirm", {"operation_id": "op"}), ("reject", None)):
        url = f"/api/tutoring/actions/999999/{sufixo}"
        resposta = cliente_na_sessao.post(url, json=corpo)
        assert resposta.status_code == 404
        assert resposta.json() == {
            "detail": "acao nao encontrada",
            "code": "acao_nao_encontrada",
        }
    assert "999999" in caplog.text


@pytest.mark.parametrize("acao_id", [0, 2**31])
def test_id_de_acao_fora_da_faixa_responde_422(
    cliente_na_sessao: TestClient, acao_id: int
) -> None:
    resposta = cliente_na_sessao.post(f"/api/tutoring/actions/{acao_id}/reject")
    assert resposta.status_code == 422


# --- O segredo -------------------------------------------------------------


def test_a_chave_nao_aparece_na_resposta_nem_no_log(
    cliente: TestClient,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Com o provedor recusando a chave (401), o caminho onde um vazamento
    seria mais provavel: mensagem de erro montada a partir da excecao."""
    caplog.set_level(logging.DEBUG)
    falso.roteiro = Roteiro(status_http=401)
    _sobrepor(
        get_tutoria,
        lambda: Tutoria(
            provedor=ProvedorAnthropic(
                chave=SEGREDO,
                base_url=falso.url,
                modelo="claude-opus-5",
                max_tokens=8,
                timeout_segundos=1,
            ),
            historico=20,
            limite=timedelta(seconds=60),
            modelo="claude-opus-5",
        ),
    )
    resposta = _enviar(cliente, conversa.id("segredo"))
    assert falso.recebidas[0].cabecalhos["x-api-key"] == SEGREDO
    assert SEGREDO not in resposta.text
    assert SEGREDO not in str(resposta.headers)
    assert SEGREDO not in caplog.text


# --- A dependencia real ----------------------------------------------------


def test_get_tutoria_sem_chave_devolve_none(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    import focusquest.modules.tutoring.dependencies as dependencias

    monkeypatch.setattr(dependencias, "_tutoria", None)
    monkeypatch.delenv("FOCUSQUEST_ANTHROPIC_API_KEY", raising=False)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", "postgresql+psycopg://u:p@h:1/d")
    monkeypatch.setenv("FOCUSQUEST_TEST_DATABASE_URL", "postgresql+psycopg://u:p@h:1/t")
    assert dependencias.get_tutoria() is None


def test_get_tutoria_com_chave_monta_e_reaproveita(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    import focusquest.modules.tutoring.dependencies as dependencias

    monkeypatch.setattr(dependencias, "_tutoria", None)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", "postgresql+psycopg://u:p@h:1/d")
    monkeypatch.setenv("FOCUSQUEST_TEST_DATABASE_URL", "postgresql+psycopg://u:p@h:1/t")
    monkeypatch.setenv("FOCUSQUEST_ANTHROPIC_API_KEY", "sk-ant-teste")
    monkeypatch.setenv("FOCUSQUEST_TUTOR_HISTORY_MESSAGES", "7")
    monkeypatch.setenv("FOCUSQUEST_TUTOR_TIMEOUT_SECONDS", "12")
    primeira = dependencias.get_tutoria()
    assert primeira is not None
    assert isinstance(primeira.provedor, ProvedorAnthropic)
    assert (primeira.historico, primeira.limite) == (7, timedelta(seconds=12))
    assert dependencias.get_tutoria() is primeira


def test_get_tutoria_leva_o_modelo_configurado(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    """O modelo que interpreta vai gravado em cada avaliacao (spec, `model`):
    a tutoria o carrega do `Settings`, o mesmo que o adaptador usa."""
    import focusquest.modules.tutoring.dependencies as dependencias

    monkeypatch.setattr(dependencias, "_tutoria", None)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", "postgresql+psycopg://u:p@h:1/d")
    monkeypatch.setenv("FOCUSQUEST_TEST_DATABASE_URL", "postgresql+psycopg://u:p@h:1/t")
    monkeypatch.setenv("FOCUSQUEST_ANTHROPIC_API_KEY", "sk-ant-teste")
    monkeypatch.setenv("FOCUSQUEST_TUTOR_MODEL", "modelo-de-teste")
    tutoria = dependencias.get_tutoria()
    assert tutoria is not None
    assert tutoria.modelo == "modelo-de-teste"
