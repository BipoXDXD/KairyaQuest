"""Concluir com evidencia (Task 3 do incremento E, `submit_activity`).

O `client` e o `relogio_fixo` sao copiados de `test_progression_api.py`, pelo
mesmo motivo: a substituicao amarra a requisicao a sessao do teste e a um
instante fixo, e o teardown de cada um remove so a PROPRIA chave.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from sqlalchemy.orm import Session

from focusquest.core.clock import get_clock
from focusquest.core.database import get_session
from focusquest.main import app
from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    FalhaDaAvaliacao,
)
from focusquest.modules.missions.models import MissionEvaluation, MissionEvidence
from focusquest.modules.missions.service import NovaEvidencia, concluir_missao
from focusquest.modules.progression.models import FONTE_BONUS, XpEntry

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


def _criar(client: TestClient) -> dict[str, Any]:
    resposta = client.post(
        "/api/missions",
        json={
            "instructions": "Ler o capitulo 3",
            "completion_criterion": "Resumo de uma pagina entregue",
            "difficulty": 5,
            "estimated_minutes": 30,
            "deadline": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
        },
    )
    assert resposta.status_code == 201, resposta.text
    corpo: dict[str, Any] = resposta.json()
    return corpo


def _concluir(client: TestClient, mission_id: int, corpo: dict[str, Any]) -> Response:
    return client.post(f"/api/missions/{mission_id}/complete", json=corpo)


def test_concluir_com_evidencia_grava_e_publica(
    client: TestClient, relogio_fixo: datetime
) -> None:
    missao = _criar(client)
    resposta = _concluir(
        client,
        missao["id"],
        {
            "operation_id": "op-1",
            "evidence": {
                "text": "  Fiz os 10 exercicios  ",
                "link": "HTTPS://exemplo.com/a",
            },
        },
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["verification"] == "com_evidencia"
    assert corpo["evidence"] == {
        "text": "Fiz os 10 exercicios",
        "link": "HTTPS://exemplo.com/a",
    }
    assert corpo["evaluation"] is None
    assert corpo["reward"]["xp_awarded"] == corpo["xp"]
    lista = client.get("/api/missions").json()
    assert [m["evidence"] for m in lista if m["id"] == missao["id"]] == [
        corpo["evidence"]
    ]


def test_concluir_sem_evidencia_e_autodeclarada(
    client: TestClient, relogio_fixo: datetime
) -> None:
    missao = _criar(client)
    corpo = _concluir(client, missao["id"], {"operation_id": "op-2"}).json()
    assert (corpo["verification"], corpo["evidence"], corpo["evaluation"]) == (
        "autodeclarada",
        None,
        None,
    )


def test_pendente_nao_tem_verificacao(client: TestClient) -> None:
    missao = _criar(client)
    assert (missao["verification"], missao["evidence"], missao["evaluation"]) == (
        None,
        None,
        None,
    )


def test_reenvio_com_a_mesma_evidencia_devolve_o_mesmo_200(
    client: TestClient, relogio_fixo: datetime
) -> None:
    missao = _criar(client)
    corpo = {"operation_id": "op-3", "evidence": {"text": "Feito"}}
    primeira = _concluir(client, missao["id"], corpo)
    segunda = _concluir(client, missao["id"], corpo)
    assert segunda.status_code == 200
    assert segunda.json() == primeira.json()


@pytest.mark.parametrize(
    "reenvio",
    [
        {"evidence": {"text": "Outro texto"}},
        {"evidence": {"text": "Feito", "link": "https://exemplo.com"}},
        {},
    ],
    ids=["texto-diferente", "link-a-mais", "sem-evidencia"],
)
def test_reenvio_com_outra_evidencia_e_operacao_reutilizada(
    client: TestClient, relogio_fixo: datetime, reenvio: dict[str, Any]
) -> None:
    missao = _criar(client)
    _concluir(
        client, missao["id"], {"operation_id": "op-4", "evidence": {"text": "Feito"}}
    )
    resposta = _concluir(client, missao["id"], {"operation_id": "op-4"} | reenvio)
    assert resposta.status_code == 409
    assert resposta.json()["code"] == "operacao_reutilizada"


def test_reenvio_com_evidencia_onde_nao_havia_e_operacao_reutilizada(
    client: TestClient, relogio_fixo: datetime
) -> None:
    missao = _criar(client)
    _concluir(client, missao["id"], {"operation_id": "op-5"})
    resposta = _concluir(
        client, missao["id"], {"operation_id": "op-5", "evidence": {"text": "Feito"}}
    )
    assert resposta.status_code == 409
    assert resposta.json()["code"] == "operacao_reutilizada"


@pytest.mark.parametrize(
    ("evidencia", "campo"),
    [
        ({"text": "   "}, "text"),
        ({"text": "x" * 4001}, "text"),
        ({"text": "ok", "link": "javascript:alert(1)"}, "link"),
        ({"text": "ok", "link": "https://a b"}, "link"),
        ({"text": "ok", "link": "https://" + "a" * 1993}, "link"),
        ({"text": "ok", "extra": 1}, "extra"),
        # NUL: o PostgreSQL recusa o byte em `text`; sem a guarda do schema
        # viraria 500 em vez de 422.
        ({"text": "a\x00b"}, "text"),
        ({"text": "ok", "link": "https://a.b/\x00"}, "link"),
        # o strip do pydantic (Rust, Unicode White_Space) remove U+0085: sobra vazio.
        ({"text": "\u0085"}, "text"),
        ({"text": "🔥" * 4001}, "text"),
        ({"text": "é" * 2001 + "é" * 2000}, "text"),
        ({"text": "ok", "link": "https://"}, "link"),
        ({"text": "ok", "link": ""}, "link"),
        ({"text": "ok", "link": "http://"}, "link"),
    ],
)
def test_evidencia_invalida_e_422(
    client: TestClient, evidencia: dict[str, Any], campo: str
) -> None:
    missao = _criar(client)
    resposta = _concluir(
        client, missao["id"], {"operation_id": "op-6", "evidence": evidencia}
    )
    assert resposta.status_code == 422
    assert resposta.json()["detail"][0]["loc"][-1] == campo


def test_quatro_mil_emojis_passam(client: TestClient, relogio_fixo: datetime) -> None:
    """Review Focus 1: o teto conta pontos de codigo, como a tela."""
    missao = _criar(client)
    resposta = _concluir(
        client,
        missao["id"],
        {"operation_id": "op-7", "evidence": {"text": "🔥" * 4000}},
    )
    assert resposta.status_code == 200, resposta.text


@pytest.mark.parametrize(
    ("texto", "gravado"),
    [
        ("  " + "a" * 4000 + "  ", "a" * 4000),
        ("é" * 4000, "é" * 4000),
        # CONTRATO (medido): o strip e o do pydantic (Rust, Unicode
        # White_Space), NAO o `str.strip()` do Python. U+FEFF nao e removido
        # (o trim() do JS remove); U+0085 e removido.
        ("\ufeffabc", "\ufeffabc"),
        ("\u0085abc\u0085", "abc"),
        # medido: `str.strip()` removeria U+001C..U+001F; o pydantic NAO.
        ("\u001c\u001fabc", "\u001c\u001fabc"),
    ],
    ids=[
        "teto-depois-do-strip",
        "4000-pontos-de-codigo-combinantes",
        "feff-fica",
        "nel-sai",
        "fs-fica",
    ],
)
def test_texto_valido_e_gravado_como_o_strip_do_pydantic_o_deixa(
    client: TestClient, relogio_fixo: datetime, texto: str, gravado: str
) -> None:
    missao = _criar(client)
    resposta = _concluir(
        client,
        missao["id"],
        {"operation_id": "op-t", "evidence": {"text": texto}},
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["evidence"]["text"] == gravado


@pytest.mark.parametrize(
    ("evidencia", "link"),
    [
        ({"text": "ok", "link": None}, None),
        ({"text": "ok"}, None),
        ({"text": "ok", "link": "  https://a.b/x  "}, "https://a.b/x"),
    ],
    ids=["null", "ausente", "com-espacos"],
)
def test_link_opcional_e_sem_espacos_nas_pontas(
    client: TestClient,
    relogio_fixo: datetime,
    evidencia: dict[str, Any],
    link: str | None,
) -> None:
    missao = _criar(client)
    resposta = _concluir(
        client, missao["id"], {"operation_id": "op-l", "evidence": evidencia}
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["evidence"]["link"] == link


def test_a_recompensa_da_conclusao_nao_muda_com_um_bonus_gravado(
    client: TestClient, session: Session, relogio_fixo: datetime
) -> None:
    """E14: com dois lancamentos da mesma missao, o reenvio continua achando o
    da conclusao (sem o filtro de fonte, o `.one()` estourava)."""
    missao = _criar(client)
    corpo = {"operation_id": "op-8", "evidence": {"text": "Feito"}}
    primeira = _concluir(client, missao["id"], corpo).json()
    session.add(
        XpEntry(
            user_id=1,
            mission_id=missao["id"],
            amount=110,
            source=FONTE_BONUS,
            credited_at=relogio_fixo,
        )
    )
    session.flush()
    segunda = _concluir(client, missao["id"], corpo).json()
    assert segunda["reward"] == primeira["reward"]


def test_o_servico_grava_a_evidencia_no_instante_da_conclusao(
    client: TestClient, session: Session
) -> None:
    missao = _criar(client)
    concluida = concluir_missao(
        session,
        1,
        missao["id"],
        "op-9",
        clock=lambda: AGORA,
        evidencia=NovaEvidencia("Feito", None),
    )
    gravada = session.get(MissionEvidence, missao["id"])
    assert gravada is not None
    assert (gravada.text, gravada.link) == ("Feito", None)
    assert gravada.submitted_at == concluida.completed_at == AGORA


def test_a_avaliacao_gravada_aparece_na_lista_e_no_reenvio(
    client: TestClient, session: Session, relogio_fixo: datetime
) -> None:
    """O resumo da avaliacao sai pelos DOIS montadores de `MissionRead`, e sem
    `bonus_xp` (EM1)."""
    missao = _criar(client)
    corpo = {"operation_id": "op-10", "evidence": {"text": "Feito"}}
    _concluir(client, missao["id"], corpo)
    session.add(
        MissionEvaluation(
            mission_id=missao["id"],
            state=EstadoDaAvaliacao.FALHOU,
            attempt=1,
            error_code=FalhaDaAvaliacao.TEMPO_ESGOTADO,
            model="modelo-x",
            requested_at=relogio_fixo,
            finished_at=relogio_fixo,
        )
    )
    session.flush()
    session.expire_all()
    esperado = {
        "state": "falhou",
        "verdict": None,
        "feedback": None,
        "error_code": "tempo_esgotado",
        "model": "modelo-x",
        "finished_at": "2026-09-18T15:00:00Z",
    }
    reenvio = _concluir(client, missao["id"], corpo).json()
    assert reenvio["evaluation"] == esperado
    lista = client.get("/api/missions").json()
    assert [m["evaluation"] for m in lista if m["id"] == missao["id"]] == [esperado]
