"""A recusa de entrada HTTP preserva o diagnostico, inclusive Unicode invalido."""

import json
from collections.abc import Iterator
from copy import deepcopy
from pathlib import Path
from typing import Any, Never, cast

import pytest
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import ResponseValidationError
from fastapi.testclient import TestClient
from pydantic import BaseModel, ValidationError
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from focusquest.core.config import Settings
from focusquest.core.database import get_engine, get_session
from focusquest.main import app
from focusquest.modules.missions.cycle_schemas import PlanCreate
from focusquest.modules.missions.schemas import (
    MissionComplete,
    MissionCreate,
    MissionRescheduleIn,
    MissionStart,
)
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.schemas import ActionConfirm, MessageCreate
from focusquest.modules.tutoring.service import Tutoria

MISSAO: dict[str, Any] = {
    "instructions": "estudar",
    "completion_criterion": "terminar",
    "difficulty": 1,
    "estimated_minutes": 1,
    "deadline": "2026-10-10T12:00:00Z",
}
PERGUNTA: dict[str, Any] = {"client_message_id": "id-de-teste", "content": "pergunta"}
DIARIA: dict[str, Any] = {k: v for k, v in MISSAO.items() if k != "deadline"}
PLANO: dict[str, Any] = {
    "week_start": "2026-10-05",
    "days": [deepcopy(DIARIA) for _ in range(7)],
    "bonus": {k: v for k, v in DIARIA.items() if k != "difficulty"},
}


@pytest.fixture
def client_sem_acesso_externo() -> Iterator[TestClient]:
    """Dependencias podem ser resolvidas; nenhum uso de banco/provedor e permitido."""
    acessos: list[str] = []

    class Sentinela:
        def __getattr__(self, nome: str) -> Never:
            acessos.append(nome)
            raise AssertionError(f"entrada invalida acessou banco/provedor: {nome}")

    sentinela = Sentinela()
    anteriores = app.dependency_overrides.copy()
    app.dependency_overrides.update(
        {
            get_session: lambda: cast(Session, sentinela),
            get_engine: lambda: cast(Engine, sentinela),
            get_tutoria: lambda: cast(Tutoria, sentinela),
        }
    )
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(anteriores)
        assert acessos == []


def _casos_invalidos() -> list[tuple[str, type[BaseModel], dict[str, Any]]]:
    casos: list[tuple[str, type[BaseModel], dict[str, Any]]] = []
    for texto in ("\ud800", "\udc00", "\udc00\ud800"):
        for campo in ("instructions", "completion_criterion", "estimated_minutes"):
            casos.append(("/api/missions", MissionCreate, {**MISSAO, campo: texto}))
        for campo in ("content", "client_message_id"):
            casos.append(
                ("/api/tutoring/messages", MessageCreate, {**PERGUNTA, campo: texto})
            )
        casos.append(
            ("/api/missions/1/complete", MissionComplete, {"operation_id": texto})
        )
        casos.append(("/api/missions/1/start", MissionStart, {"operation_id": texto}))
        casos.append(
            (
                "/api/missions/1/reschedule",
                MissionRescheduleIn,
                {
                    "operation_id": texto,
                    "new_deadline": "2026-10-11T12:00:00Z",
                    "reason": "falta_de_tempo",
                },
            )
        )
        casos.append(
            ("/api/tutoring/actions/1/confirm", ActionConfirm, {"operation_id": texto})
        )
        diaria = deepcopy(PLANO)
        diaria["days"][0]["instructions"] = texto
        casos.append(("/api/plans", PlanCreate, diaria))
        especial = deepcopy(PLANO)
        especial["bonus"]["completion_criterion"] = texto
        casos.append(("/api/plans", PlanCreate, especial))
        # missing ecoa o objeto; extra pode contaminar input OU loc;
        # int_type ecoa um objeto aninhado, e nao uma string simples.
        casos.extend(
            [
                ("/api/missions", MissionCreate, {"unexpected": texto}),
                ("/api/plans", PlanCreate, {**PLANO, "extra": texto}),
                ("/api/plans", PlanCreate, {**PLANO, texto: "desconhecido"}),
                (
                    "/api/missions",
                    MissionCreate,
                    {**MISSAO, "difficulty": {"nested": texto}},
                ),
            ]
        )
    return casos


@pytest.mark.parametrize("rota,modelo,corpo", _casos_invalidos())
def test_unicode_invalido_responde_422_com_diagnostico_inteiro(
    client_sem_acesso_externo: TestClient,
    rota: str,
    modelo: type[BaseModel],
    corpo: dict[str, Any],
) -> None:
    with pytest.raises(ValidationError) as erro:
        modelo.model_validate(corpo)
    detalhes = erro.value.errors(include_url=False)
    for detalhe in detalhes:
        detalhe["loc"] = ("body", *detalhe["loc"])

    # json= falharia no cliente antes de mandar os escapes isolados por HTTP.
    resposta = client_sem_acesso_externo.post(
        rota,
        content=json.dumps(corpo, ensure_ascii=True).encode("ascii"),
        headers={"Content-Type": "application/json"},
    )

    assert resposta.status_code == 422
    assert resposta.headers["content-type"] == "application/json"
    assert json.loads(resposta.content.decode("utf-8")) == {
        "detail": jsonable_encoder(detalhes)
    }


@pytest.mark.parametrize("texto", ["ação", "😀", "\ud83d\ude00"])
@pytest.mark.parametrize(
    "rota,modelo,corpo,campo",
    [
        ("/api/missions", MissionCreate, {**MISSAO, "difficulty": 0}, "instructions"),
        ("/api/tutoring/messages", MessageCreate, {"content": ""}, "content"),
        ("/api/plans", PlanCreate, PLANO, "extra"),
    ],
)
def test_unicode_valido_preserva_o_422_do_outro_campo(
    client_sem_acesso_externo: TestClient,
    texto: str,
    rota: str,
    modelo: type[BaseModel],
    corpo: dict[str, Any],
    campo: str,
) -> None:
    # JSON decode une o par valido como o parser da requisicao real.
    dados = json.loads(json.dumps({**corpo, campo: texto}, ensure_ascii=True))
    with pytest.raises(ValidationError) as erro:
        modelo.model_validate(dados)
    detalhes = erro.value.errors(include_url=False)
    for detalhe in detalhes:
        detalhe["loc"] = ("body", *detalhe["loc"])
    resposta = client_sem_acesso_externo.post(
        rota,
        content=json.dumps(dados, ensure_ascii=True).encode("ascii"),
        headers={"Content-Type": "application/json"},
    )
    assert resposta.status_code == 422
    assert resposta.json() == {"detail": jsonable_encoder(detalhes)}


@pytest.mark.parametrize(
    "modelo,corpo,campo",
    [
        (MissionCreate, MISSAO, "instructions"),
        (MissionComplete, {"operation_id": "id"}, "operation_id"),
        (MessageCreate, PERGUNTA, "content"),
        (ActionConfirm, {"operation_id": "id"}, "operation_id"),
    ],
)
def test_par_valido_continua_aceito_pelos_modelos(
    modelo: type[BaseModel], corpo: dict[str, Any], campo: str
) -> None:
    dados = json.loads('{"texto":"\\ud83d\\ude00"}')
    entrada = {**corpo, campo: dados["texto"]}
    assert modelo.model_validate(entrada).model_dump()[campo] == "😀"
    assert modelo.model_validate_json(json.dumps(entrada)).model_dump()[campo] == "😀"


def test_par_valido_continua_aceito_no_plano() -> None:
    corpo = deepcopy(PLANO)
    corpo["days"][0]["instructions"] = "😀"
    corpo["bonus"]["completion_criterion"] = "😀"
    for plano in (
        PlanCreate.model_validate(corpo),
        PlanCreate.model_validate_json(json.dumps(corpo, ensure_ascii=True)),
    ):
        assert plano.days[0].instructions == "😀"
        assert plano.bonus.completion_criterion == "😀"


@pytest.mark.parametrize(
    "corpo,codigo,tipo",
    [(b'{"instructions":', 422, "json_invalid"), (b"", 422, "missing")],
)
def test_json_malformado_e_corpo_ausente_continuam_422(
    client_sem_acesso_externo: TestClient, corpo: bytes, codigo: int, tipo: str
) -> None:
    resposta = client_sem_acesso_externo.post(
        "/api/missions", content=corpo, headers={"Content-Type": "application/json"}
    )
    assert resposta.status_code == codigo
    assert resposta.json()["detail"][0]["type"] == tipo
    assert "code" not in resposta.json()


def test_bytes_utf8_invalidos_continuam_400(
    client_sem_acesso_externo: TestClient,
) -> None:
    resposta = client_sem_acesso_externo.post(
        "/api/missions",
        content=b'{"instructions":"\xff"}',
        headers={"Content-Type": "application/json"},
    )
    assert resposta.status_code == 400
    assert resposta.json() == {"detail": "There was an error parsing the body"}


@pytest.mark.parametrize(
    "tipo", [RuntimeError, ValidationError, ResponseValidationError]
)
def test_erro_interno_nao_e_traduzido_em_422(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, tipo: type[Exception]
) -> None:
    """Usa uma dependencia da rota existente; nao registra rota de produto."""
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("FOCUSQUEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("FOCUSQUEST_TEST_DATABASE_URL", raising=False)

    def falhar() -> Never:
        if tipo is ValidationError:
            Settings()
            raise AssertionError("Settings sem configuracao deveria recusar")
        if tipo is ResponseValidationError:
            raise ResponseValidationError(
                [{"type": "int_type", "loc": ("response", "available"), "input": []}]
            )
        raise RuntimeError("defeito sintetico interno")

    anteriores = app.dependency_overrides.copy()
    app.dependency_overrides[get_tutoria] = falhar
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            resposta = client.get("/api/tutoring/status")
        assert resposta.status_code == 500
        assert resposta.text == "Internal Server Error"
        with TestClient(app) as client, pytest.raises(tipo):
            client.get("/api/tutoring/status")
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(anteriores)
