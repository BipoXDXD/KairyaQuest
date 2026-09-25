"""O contrato HTTP do ciclo: formas, recusas, codigos e a ocultacao por 404."""

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from focusquest.core.clock import get_clock
from focusquest.core.database import get_session
from focusquest.main import app
from focusquest.modules.missions.domain import MissionType
from focusquest.modules.missions.models import Mission

SEGUNDA = date(2026, 9, 21)
QUARTA = SEGUNDA + timedelta(days=2)


def ao_meio_dia(dia: date) -> datetime:
    return datetime(dia.year, dia.month, dia.day, 15, tzinfo=UTC)


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    """Como em `test_missions_api.py`: a requisicao usa a sessao do teste, e a
    fixture remove a PROPRIA chave no teardown."""
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_session, None)


@pytest.fixture
def relogio() -> Iterator[list[datetime]]:
    """Um relogio que o teste move: `relogio[0] = ...` muda o instante."""
    instante = [ao_meio_dia(QUARTA)]
    app.dependency_overrides[get_clock] = lambda: lambda: instante[0]
    yield instante
    app.dependency_overrides.pop(get_clock, None)


def _corpo(semana: date = SEGUNDA, **ajustes: Any) -> dict[str, Any]:
    corpo: dict[str, Any] = {
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
    corpo.update(ajustes)
    return corpo


def _id_da_diaria(session: Session, dia: date) -> int:
    return session.scalars(
        select(Mission.id).where(
            Mission.mission_type == MissionType.DIARIA, Mission.day == dia
        )
    ).one()


def _id_da_especial(session: Session) -> int:
    return session.scalars(
        select(Mission.id).where(Mission.mission_type == MissionType.ESPECIAL)
    ).one()


def _concluir(client: TestClient, mission_id: int, operacao: str = "op") -> Any:
    return client.post(
        f"/api/missions/{mission_id}/complete", json={"operation_id": operacao}
    )


def test_criar_o_plano_devolve_a_trilha_sem_revelar_o_futuro(
    client: TestClient, relogio: list[datetime]
) -> None:
    resposta = client.post("/api/plans", json=_corpo())

    assert resposta.status_code == 201
    plano = resposta.json()
    assert plano["week_start"] == "2026-09-21"
    assert [d["availability"] for d in plano["days"]] == [
        "fora_do_plano",
        "fora_do_plano",
        "disponivel",
        "bloqueada",
        "bloqueada",
        "bloqueada",
        "bloqueada",
    ]
    # Bau fechado: a chave `mission` e nula, e o dia e so a data.
    for dia in plano["days"][3:]:
        assert set(dia) == {"day", "availability", "mission"}
        assert dia["mission"] is None
    quarta = plano["days"][2]["mission"]
    assert quarta["mission_type"] == "diaria"
    assert quarta["day"] == "2026-09-23"
    assert quarta["availability"] == "disponivel"
    assert datetime.fromisoformat(quarta["deadline"]) == datetime(
        2026, 9, 24, 3, tzinfo=UTC
    )
    # A especial bloqueada: marcador sem id, sem conteudo e sem dificuldade.
    assert plano["special"] == {
        "availability": "bloqueada",
        "progress": 0,
        "mission": None,
    }


@pytest.mark.parametrize(
    "ajuste",
    [
        {
            "days": [
                {
                    "instructions": "x",
                    "completion_criterion": "y",
                    "difficulty": 2,
                    "estimated_minutes": 30,
                }
            ]
            * 6
        },
        {"week_start": "2026-09-22"},
        {
            "bonus": {
                "instructions": "x",
                "completion_criterion": "y",
                "estimated_minutes": 30,
                "difficulty": 5,
            }
        },
        {
            "days": [
                {
                    "instructions": "x",
                    "completion_criterion": "y",
                    "difficulty": 2,
                    "estimated_minutes": 1441,
                }
            ]
            * 7
        },
        {
            "days": [
                {
                    "instructions": "x",
                    "completion_criterion": "y",
                    "difficulty": 6,
                    "estimated_minutes": 30,
                }
            ]
            * 7
        },
        {
            "bonus": {
                "instructions": "x",
                "completion_criterion": "y",
                "estimated_minutes": 1441,
            }
        },
        {
            "days": [
                {
                    "instructions": "",
                    "completion_criterion": "y",
                    "difficulty": 2,
                    "estimated_minutes": 30,
                }
            ]
            * 7
        },
        {
            "days": [
                {
                    "instructions": "x",
                    "completion_criterion": "y",
                    "difficulty": 2,
                    "estimated_minutes": 30,
                }
            ]
            * 8
        },
        {
            "days": [
                {
                    "instructions": "x",
                    "completion_criterion": "y",
                    "difficulty": 0,
                    "estimated_minutes": 30,
                }
            ]
            * 7
        },
        {
            "days": [
                {
                    "instructions": "x",
                    "completion_criterion": "y",
                    "difficulty": 2,
                    "estimated_minutes": 0,
                }
            ]
            * 7
        },
        {
            "bonus": {
                "instructions": "x",
                "completion_criterion": "y",
                "estimated_minutes": 0,
            }
        },
        {
            "days": [
                {
                    "instructions": "x",
                    "completion_criterion": "",
                    "difficulty": 2,
                    "estimated_minutes": 30,
                }
            ]
            * 7
        },
        {
            "bonus": {
                "instructions": "",
                "completion_criterion": "y",
                "estimated_minutes": 30,
            }
        },
        {
            "days": [
                {
                    "instructions": "x",
                    "completion_criterion": "y",
                    "difficulty": 2,
                    "estimated_minutes": 30,
                    "deadline": "2026-10-01T12:00:00Z",
                }
            ]
            * 7
        },
        {"campo_desconhecido": "x"},
    ],
    ids=[
        "seis-dias",
        "terca",
        "bonus-com-dificuldade",
        "diaria-de-1441",
        "dificuldade-6",
        "bonus-de-1441",
        "instrucao-vazia",
        "oito-dias",
        "dificuldade-0",
        "diaria-de-0-min",
        "bonus-de-0-min",
        "criterio-vazio",
        "bonus-instrucao-vazia",
        "diaria-com-deadline",
        "plano-com-campo-desconhecido",
    ],
)
def test_validacao_do_plano_responde_422(
    client: TestClient, relogio: list[datetime], ajuste: dict[str, Any]
) -> None:
    assert client.post("/api/plans", json=_corpo(**ajuste)).status_code == 422


@pytest.mark.parametrize(
    ("semana", "code"),
    [
        (SEGUNDA - timedelta(days=7), "semana_encerrada"),
        (SEGUNDA + timedelta(days=14), "semana_distante"),
    ],
)
def test_semana_fora_do_alcance_responde_409_com_code(
    client: TestClient, relogio: list[datetime], semana: date, code: str
) -> None:
    resposta = client.post("/api/plans", json=_corpo(semana))
    assert resposta.status_code == 409
    assert resposta.json()["code"] == code


def test_semana_no_ano_9999_e_distante_e_nao_500(
    client: TestClient, relogio: list[datetime]
) -> None:
    """9999-12-27 e a ultima segunda representavel: o fim do domingo seguinte
    estouraria o `datetime`. A recusa `semana_distante` vem antes da conta."""
    resposta = client.post("/api/plans", json=_corpo(date(9999, 12, 27)))
    assert (resposta.status_code, resposta.json()["code"]) == (409, "semana_distante")


def test_plano_repetido_responde_409_plano_existente(
    client: TestClient, relogio: list[datetime]
) -> None:
    assert client.post("/api/plans", json=_corpo()).status_code == 201
    resposta = client.post("/api/plans", json=_corpo())
    assert (resposta.status_code, resposta.json()["code"]) == (409, "plano_existente")


def test_plano_atual_nulo_e_depois_na_mesma_forma_do_201(
    client: TestClient, relogio: list[datetime]
) -> None:
    assert client.get("/api/plans/current").json() == {"plan": None}
    criado = client.post("/api/plans", json=_corpo()).json()
    assert client.get("/api/plans/current").json() == {"plan": criado}


def test_ciclo_sem_plano(client: TestClient, relogio: list[datetime]) -> None:
    assert client.get("/api/cycle").json() == {
        "today": "2026-09-23",
        "mission": None,
        "streak": 0,
        "days_to_milestone": 7,
        "special": None,
    }


def test_concluir_a_diaria_de_hoje_pela_api(
    client: TestClient, relogio: list[datetime], session: Session
) -> None:
    client.post("/api/plans", json=_corpo())
    missao = client.get("/api/cycle").json()["mission"]
    assert missao["availability"] == "disponivel"

    resposta = _concluir(client, missao["id"])

    assert resposta.status_code == 200
    assert resposta.json()["availability"] == "concluida"
    ciclo = client.get("/api/cycle").json()
    assert (ciclo["streak"], ciclo["days_to_milestone"]) == (1, 6)


def test_progresso_da_especial_reflete_a_sequencia_de_diarias_concluidas(
    client: TestClient, relogio: list[datetime], session: Session
) -> None:
    """`special.progress` e a sequencia atual modulo 7 -- e nao um zero fixo,
    que o `plano["special"]` do primeiro teste (sem nenhuma diaria concluida)
    nao teria como distinguir de um valor de verdade calculado."""
    relogio[0] = ao_meio_dia(SEGUNDA)
    client.post("/api/plans", json=_corpo())
    for i in range(2):
        relogio[0] = ao_meio_dia(SEGUNDA + timedelta(days=i))
        missao = client.get("/api/cycle").json()["mission"]
        assert _concluir(client, missao["id"], f"op-prog-{i}").status_code == 200

    assert client.get("/api/cycle").json()["streak"] == 2
    plano = client.get("/api/plans/current").json()["plan"]
    assert plano["special"]["progress"] == 2


def test_o_nao_revelado_responde_o_mesmo_404_de_inexistente(
    client: TestClient, relogio: list[datetime], session: Session
) -> None:
    """Corpo INTEIRO igual, e nao so o status (C11)."""
    client.post("/api/plans", json=_corpo())
    resposta_seguinte = client.post(
        "/api/plans", json=_corpo(SEGUNDA + timedelta(days=7))
    )
    # O 201 da semana seguinte tambem esconde o futuro: os 7 dias vem
    # bloqueados, sem missao nenhuma -- o mesmo bau fechado que o 404 abaixo
    # prova para a conclusao por id.
    assert resposta_seguinte.status_code == 201
    plano_seguinte = resposta_seguinte.json()
    assert [d["availability"] for d in plano_seguinte["days"]] == ["bloqueada"] * 7
    assert all(d["mission"] is None for d in plano_seguinte["days"])
    inexistente = _concluir(client, 999_999)
    ocultas = [
        _id_da_diaria(session, QUARTA + timedelta(days=1)),  # dia futuro desta semana
        _id_da_diaria(session, SEGUNDA + timedelta(days=7)),  # semana seguinte
        session.scalars(  # especial bloqueada
            select(Mission.id)
            .where(Mission.mission_type == MissionType.ESPECIAL)
            .order_by(Mission.id)
        ).first(),
    ]
    assert inexistente.status_code == 404
    for mission_id in ocultas:
        assert mission_id is not None
        resposta = _concluir(client, mission_id)
        assert (resposta.status_code, resposta.json()) == (404, inexistente.json())


def test_diaria_perdida_responde_409_missao_expirada(
    client: TestClient, relogio: list[datetime], session: Session
) -> None:
    client.post("/api/plans", json=_corpo())
    relogio[0] = ao_meio_dia(QUARTA + timedelta(days=1))
    resposta = _concluir(client, _id_da_diaria(session, QUARTA))
    assert (resposta.status_code, resposta.json()["code"]) == (409, "missao_expirada")


def test_reenvio_depois_da_meia_noite_pela_api(
    client: TestClient, relogio: list[datetime], session: Session
) -> None:
    client.post("/api/plans", json=_corpo())
    mission_id = _id_da_diaria(session, QUARTA)
    relogio[0] = datetime(2026, 9, 24, 2, 59, 59, tzinfo=UTC)
    primeira = _concluir(client, mission_id, "op-virada")
    relogio[0] = datetime(2026, 9, 24, 3, 0, 1, tzinfo=UTC)
    reenvio = _concluir(client, mission_id, "op-virada")
    assert (reenvio.status_code, reenvio.json()) == (200, primeira.json())


def test_a_semana_inteira_revela_a_especial_de_660_xp(
    client: TestClient, relogio: list[datetime], session: Session
) -> None:
    relogio[0] = ao_meio_dia(SEGUNDA)
    client.post("/api/plans", json=_corpo())
    for i in range(7):
        relogio[0] = ao_meio_dia(SEGUNDA + timedelta(days=i))
        missao = client.get("/api/cycle").json()["mission"]
        assert _concluir(client, missao["id"], f"op-{i}").status_code == 200

    especial = client.get("/api/cycle").json()["special"]
    assert (especial["mission_type"], especial["difficulty"], especial["xp"]) == (
        "especial",
        5,
        660,
    )
    assert especial["availability"] == "disponivel"
    assert especial["id"] == _id_da_especial(session)
    # C8: a janela da especial vai do marco (domingo 27/09) ate o fim do dia
    # SEGUINTE (segunda 28/09) em SP -- e o prazo derivado e essa meia-noite,
    # que em UTC cai as 03h de terca.
    assert datetime.fromisoformat(especial["deadline"]) == datetime(
        2026, 9, 29, 3, tzinfo=UTC
    )

    # A trilha (`GET /api/plans/current`) tambem publica a especial revelada,
    # e nao so o ciclo: o `special.mission` da trilha e a MESMA missao, com o
    # mesmo xp -- e nao o marcador `None` do plano ainda sem marco.
    plano_atual = client.get("/api/plans/current").json()["plan"]
    assert plano_atual["special"]["availability"] == "disponivel"
    assert plano_atual["special"]["mission"] is not None
    assert plano_atual["special"]["mission"]["id"] == especial["id"]
    assert plano_atual["special"]["mission"]["xp"] == 660

    concluida = _concluir(client, especial["id"], "op-especial").json()
    assert (concluida["availability"], concluida["xp"]) == ("concluida", 660)


def test_a_listagem_tem_so_avulsas_com_os_campos_novos(
    client: TestClient, relogio: list[datetime]
) -> None:
    client.post("/api/plans", json=_corpo())
    criada = client.post(
        "/api/missions",
        json={
            "instructions": "a",
            "completion_criterion": "c",
            "difficulty": 1,
            "estimated_minutes": 10,
            "deadline": "2026-10-01T12:00:00Z",
        },
    ).json()
    lista = client.get("/api/missions").json()
    assert [m["id"] for m in lista] == [criada["id"]]
    assert (criada["mission_type"], criada["day"], criada["availability"]) == (
        "avulsa",
        None,
        "disponivel",
    )
