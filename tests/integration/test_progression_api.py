"""Os endpoints da progressao: `GET /api/progress` e o `reward` da conclusao.

O `client` e o `relogio_fixo` sao copiados de `test_missions_api.py`, pelo
mesmo motivo: a substituicao amarra a requisicao a sessao do teste (o override
de `get_session`) e a um instante fixo (o override de `get_clock`), e o
teardown de cada um remove so a PROPRIA chave -- a mesma licao registrada la.
"""

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from focusquest.core.clock import get_clock
from focusquest.core.database import get_session
from focusquest.main import app
from focusquest.modules.progression.domain import CATALOGO

# O instante que o relogio injetado devolve nos testes que o substituem --
# igual ao de `test_missions_api.py`, mas redeclarado aqui: os dois arquivos
# nao devem depender um do outro.
AGORA = datetime(2026, 9, 18, 15, 0, tzinfo=UTC)


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    """Cliente cuja requisicao usa a SESSAO DO TESTE. Ver `test_missions_api.py`."""
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_session, None)


@pytest.fixture
def relogio_fixo() -> Iterator[datetime]:
    """Substitui o relogio da API por um que devolve sempre `AGORA`."""
    app.dependency_overrides[get_clock] = lambda: lambda: AGORA
    yield AGORA
    app.dependency_overrides.pop(get_clock, None)


# A semana do plano do teste do ciclo: segunda-feira, 21/09/2026.
SEGUNDA = date(2026, 9, 21)


def _ao_meio_dia(dia: date) -> datetime:
    return datetime(dia.year, dia.month, dia.day, 15, tzinfo=UTC)


@pytest.fixture
def relogio_movel() -> Iterator[list[datetime]]:
    """Um relogio que o teste move (`relogio_movel[0] = ...`), como o de
    `test_cycle_api.py`; o teardown remove so a propria chave."""
    instante = [_ao_meio_dia(SEGUNDA)]
    app.dependency_overrides[get_clock] = lambda: lambda: instante[0]
    yield instante
    app.dependency_overrides.pop(get_clock, None)


def _agora_da_api() -> datetime:
    """O instante do relogio que a API vai ler (o sobreposto, ou o real). A
    criacao confere o prazo contra ele (pendencia 26): relativo ao relogio
    REAL, o prazo viraria bomba-relogio com `relogio_fixo`."""
    relogio = app.dependency_overrides.get(get_clock, get_clock)()
    instante: datetime = relogio()
    return instante


def _corpo(**ajustes: Any) -> dict[str, Any]:
    """O corpo de criacao valido de uma missao avulsa, dificuldade 5."""
    corpo: dict[str, Any] = {
        "instructions": "Ler o capitulo 3",
        "completion_criterion": "Resumo de uma pagina entregue",
        "difficulty": 5,
        "estimated_minutes": 30,
        "deadline": (_agora_da_api() + timedelta(days=1)).isoformat(),
    }
    return corpo | ajustes


def _criar(client: TestClient, **ajustes: Any) -> dict[str, Any]:
    resposta = client.post("/api/missions", json=_corpo(**ajustes))
    assert resposta.status_code == 201, resposta.text
    corpo: dict[str, Any] = resposta.json()
    return corpo


def _concluir(client: TestClient, mission_id: int, operation_id: str) -> dict[str, Any]:
    resposta = client.post(
        f"/api/missions/{mission_id}/complete", json={"operation_id": operation_id}
    )
    assert resposta.status_code == 200, resposta.text
    corpo: dict[str, Any] = resposta.json()
    return corpo


def _plano(semana: date) -> dict[str, Any]:
    """Um plano semanal valido (o mesmo formato de `test_cycle_api.py`)."""
    return {
        "week_start": semana.isoformat(),
        "days": [
            {
                "instructions": f"Diaria {i}",
                "completion_criterion": f"Criterio {i}",
                "difficulty": 2,
                "estimated_minutes": 30,
            }
            for i in range(7)
        ],
        "bonus": {
            "instructions": "Prova simulada",
            "completion_criterion": "Nota registrada",
            "estimated_minutes": 120,
        },
    }


# Os sete achievements do catalogo, todos travados: `code` na ordem do
# catalogo, `title`/`description` da spec, `unlocked_at` nulo.
_ACHIEVEMENTS_TRAVADOS = [
    {
        "code": c.codigo.value,
        "title": c.titulo,
        "description": c.descricao,
        "unlocked_at": None,
    }
    for c in CATALOGO
]


def test_progress_sem_conclusoes(client: TestClient) -> None:
    resposta = client.get("/api/progress")

    assert resposta.status_code == 200
    assert resposta.json() == {
        "xp_total": 0,
        "level": 1,
        "level_floor_xp": 0,
        "next_level_xp": 100,
        "achievements": _ACHIEVEMENTS_TRAVADOS,
    }


def test_progress_depois_de_concluir(
    client: TestClient, relogio_fixo: datetime
) -> None:
    criada = _criar(client)
    _concluir(client, criada["id"], "op-abc")

    resposta = client.get("/api/progress")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["xp_total"] == 220
    assert corpo["level"] == 2
    assert corpo["level_floor_xp"] == 100
    assert corpo["next_level_xp"] == 300
    primeiro_passo = next(
        item for item in corpo["achievements"] if item["code"] == "first_steps"
    )
    assert datetime.fromisoformat(primeiro_passo["unlocked_at"]) == relogio_fixo


def test_concluir_devolve_reward(client: TestClient) -> None:
    criada = _criar(client)

    corpo = _concluir(client, criada["id"], "op-abc")

    # Todas as chaves do MissionRead de antes continuam presentes.
    assert corpo["id"] == criada["id"]
    assert corpo["instructions"] == criada["instructions"]
    assert corpo["completion_criterion"] == criada["completion_criterion"]
    assert corpo["difficulty"] == criada["difficulty"]
    assert corpo["estimated_minutes"] == criada["estimated_minutes"]
    assert corpo["mission_type"] == criada["mission_type"]
    assert corpo["day"] == criada["day"]
    assert datetime.fromisoformat(corpo["deadline"]) == datetime.fromisoformat(
        criada["deadline"]
    )
    assert corpo["availability"] == "concluida"
    assert corpo["state"] == "concluida"
    assert corpo["started_at"] == criada["started_at"]
    assert corpo["completed_at"] is not None
    assert corpo["xp"] == criada["xp"]
    # Concluida direto de `pendente`, sem iniciar (F4): `started_at` continua
    # nulo, e a duracao real e None. A duracao real de uma missao iniciada e
    # provada em `test_iniciar_missao.py`.
    assert corpo["actual_duration_minutes"] is None

    assert corpo["reward"] == {
        "xp_awarded": 220,
        "xp_total": 220,
        "level_before": 1,
        "level_after": 2,
        "achievements_unlocked": [
            {
                "code": "first_steps",
                "title": "Primeiros passos",
                "description": "Conclua a sua primeira missão.",
            }
        ],
    }


def test_reenvio_devolve_o_mesmo_corpo_com_reward(client: TestClient) -> None:
    """Reenvio antigo depois de outras conclusoes.

    Conclui A (fica no nivel 2), cria e conclui B (nivel 3), e o reenvio de A
    tem de devolver EXATAMENTE o corpo do primeiro envio de A -- inclusive o
    `reward` daquele momento --, nunca o saldo atual.
    """
    a = _criar(client)
    primeira_de_a = _concluir(client, a["id"], "op-a")

    b = _criar(client)
    _concluir(client, b["id"], "op-b")

    reenvio_de_a = _concluir(client, a["id"], "op-a")

    # A chave precisa existir E ser a de A, nao o saldo atual (nivel 3): sem
    # esta asserção explícita, a igualdade dos dois corpos passaria mesmo sem
    # `reward` nenhum nos dois, antes desta Task existir.
    assert "reward" in primeira_de_a
    assert primeira_de_a["reward"]["level_after"] == 2
    assert reenvio_de_a == primeira_de_a


def test_openapi_publica_reward_e_progress(client: TestClient) -> None:
    esquema = client.get("/openapi.json").json()

    assert "/api/progress" in esquema["paths"]
    assert "get" in esquema["paths"]["/api/progress"]

    caminho_conclusao = esquema["paths"]["/api/missions/{mission_id}/complete"]
    ref_resposta = caminho_conclusao["post"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]["$ref"]
    nome_do_schema = ref_resposta.rsplit("/", 1)[-1]
    schema_da_resposta = esquema["components"]["schemas"][nome_do_schema]

    assert "reward" in schema_da_resposta["required"]


def test_get_missions_e_ciclo_nao_mudam(
    client: TestClient, relogio_movel: list[datetime]
) -> None:
    """D14: `reward` e exclusivo da conclusao -- listagem e ciclo nao ganham a chave.

    O ciclo precisa de um plano com a diaria de HOJE e a especial CONCLUIDAS:
    sem plano, `mission` e `special` voltam nulos e a metade do ciclo nao
    afirmaria nada; a especial so aparece depois de sete dias seguidos.
    """
    criada = _criar(client)
    _concluir(client, criada["id"], "op-abc")

    missoes = client.get("/api/missions").json()
    assert missoes, "esperava ao menos uma missao na listagem"
    for item in missoes:
        assert "reward" not in item

    plano = client.post("/api/plans", json=_plano(SEGUNDA))
    assert plano.status_code == 201, plano.text
    for i in range(7):
        relogio_movel[0] = _ao_meio_dia(SEGUNDA + timedelta(days=i))
        de_hoje = client.get("/api/cycle").json()["mission"]
        assert "reward" in _concluir(client, de_hoje["id"], f"op-dia-{i}")
    especial = client.get("/api/cycle").json()["special"]
    assert "reward" in _concluir(client, especial["id"], "op-especial")

    ciclo = client.get("/api/cycle").json()
    assert ciclo["mission"]["state"] == "concluida"
    assert ciclo["special"]["state"] == "concluida"
    for chave in ("mission", "special"):
        assert "reward" not in ciclo[chave]
