"""A rota da avaliacao: `POST /api/missions/{id}/evaluation` (E5, E13).

O `cliente` e o de `test_tutoring_api.py`: o banco de teste, a tutoria contra
o falso e o relogio fixo. Commita de verdade (a avaliacao abre as proprias
sessoes), e a fixture `registro` apaga no fim o que o teste criou.

O relogio fica numa semana que nenhum outro teste usa (janeiro de 2030): o
plano semanal commitado aqui e unico por (usuario, semana), e um plano na
semana dos outros testes os faria reprovar com `plano_existente`.
"""

from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from sqlalchemy import Engine, delete, select
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.clock import get_clock
from focusquest.core.database import get_engine
from focusquest.main import CodigoDeErro, app
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
)
from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    FalhaDaAvaliacao,
    MissionType,
    xp_da_missao,
)
from focusquest.modules.missions.evaluation_records import abrir_tentativa
from focusquest.modules.missions.models import Mission, MissionEvaluation, WeeklyPlan
from focusquest.modules.progression.domain import nivel_do_saldo
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.domain import CodigoDoStream
from focusquest.modules.tutoring.service import Tutoria
from integration.conftest import TIMEOUT_DA_DEMORA, TIMEOUT_FOLGADO
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
)

ESTUDANTE = 1
SEGUNDA = date(2030, 1, 7)
AGORA = datetime(2030, 1, 9, 15, tzinfo=UTC)
DIFICULDADE = 4
BONUS = xp_da_missao(MissionType.AVULSA, DIFICULDADE) // 2


def _veredito(veredito: str) -> Roteiro:
    return Roteiro(
        blocos=(
            ChamadaDeFerramenta(
                {"verdict": veredito, "feedback": "Bom resumo."},
                nome="record_evaluation",
            ),
        )
    )


class Registro:
    """O que o teste commitou, para a limpeza apagar SO isso."""

    def __init__(self) -> None:
        self.missoes: list[int] = []
        self.planos: list[int] = []


@pytest.fixture
def registro(banco_migrado: Engine) -> Iterator[Registro]:
    criado = Registro()
    try:
        yield criado
    finally:
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(delete(Mission).where(Mission.id.in_(criado.missoes)))
            limpeza.execute(delete(Mission).where(Mission.plan_id.in_(criado.planos)))
            limpeza.execute(delete(WeeklyPlan).where(WeeklyPlan.id.in_(criado.planos)))
            limpeza.commit()


@pytest.fixture
def cliente(banco_migrado: Engine, tutoria: Tutoria) -> Iterator[TestClient]:
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
def fabrica_de_teste(banco_migrado: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=banco_migrado, expire_on_commit=False)


def _concluida(
    cliente: TestClient, registro: Registro, evidencia: dict[str, Any] | None
) -> int:
    """Cria e conclui uma avulsa pela API, com ou sem evidencia."""
    criada = cliente.post(
        "/api/missions",
        json={
            "instructions": "Ler o capitulo 3",
            "completion_criterion": "Resumo de uma pagina",
            "difficulty": DIFICULDADE,
            "estimated_minutes": 30,
            "deadline": (AGORA + timedelta(days=1)).isoformat(),
        },
    )
    assert criada.status_code == 201, criada.text
    mission_id: int = criada.json()["id"]
    registro.missoes.append(mission_id)
    corpo: dict[str, Any] = {"operation_id": f"op-api-avaliacao-{mission_id}"}
    if evidencia is not None:
        corpo["evidence"] = evidencia
    concluida = cliente.post(f"/api/missions/{mission_id}/complete", json=corpo)
    assert concluida.status_code == 200, concluida.text
    return mission_id


def _com_evidencia(cliente: TestClient, registro: Registro) -> int:
    return _concluida(cliente, registro, {"text": "Fiz o resumo"})


def _avaliar(cliente: TestClient, mission_id: int) -> Response:
    """Com `{}` no corpo, como o frontend manda: a rota nao tem corpo."""
    return cliente.post(f"/api/missions/{mission_id}/evaluation", json={})


def _estado(fabrica: sessionmaker[Session], mission_id: int) -> MissionEvaluation:
    with fabrica() as sessao:
        return sessao.scalars(
            select(MissionEvaluation).where(MissionEvaluation.mission_id == mission_id)
        ).one()


def test_atende_devolve_o_corpo_da_spec(
    cliente: TestClient, falso: ServidorAnthropicFalso, registro: Registro
) -> None:
    mission_id = _com_evidencia(cliente, registro)
    saldo = cliente.get("/api/progress").json()["xp_total"]
    falso.roteiro = _veredito("atende")
    resposta = _avaliar(cliente, mission_id)
    assert resposta.status_code == 200, resposta.text
    assert resposta.json() == {
        "evaluation": {
            "state": "concluida",
            "verdict": "atende",
            "feedback": "Bom resumo.",
            "error_code": None,
            "model": "claude-opus-5",
            "finished_at": "2030-01-09T15:00:00Z",
        },
        "reward": {
            "xp_awarded": BONUS,
            "xp_total": saldo + BONUS,
            "level_before": nivel_do_saldo(saldo),
            "level_after": nivel_do_saldo(saldo + BONUS),
            "achievements_unlocked": [],
        },
    }
    (lida,) = [m for m in cliente.get("/api/missions").json() if m["id"] == mission_id]
    # EM1: o resumo da missao nao tem o valor do bonus.
    assert lida["evaluation"] == resposta.json()["evaluation"]
    assert cliente.get("/api/progress").json()["xp_total"] == saldo + BONUS


def test_parcial_devolve_reward_nulo(
    cliente: TestClient, falso: ServidorAnthropicFalso, registro: Registro
) -> None:
    mission_id = _com_evidencia(cliente, registro)
    falso.roteiro = _veredito("parcial")
    corpo = _avaliar(cliente, mission_id).json()
    assert (corpo["evaluation"]["verdict"], corpo["reward"]) == ("parcial", None)


def test_o_pedido_repetido_devolve_o_mesmo_corpo(
    cliente: TestClient, falso: ServidorAnthropicFalso, registro: Registro
) -> None:
    mission_id = _com_evidencia(cliente, registro)
    falso.roteiro = _veredito("atende")
    primeira = _avaliar(cliente, mission_id)
    segunda = _avaliar(cliente, mission_id)
    assert segunda.status_code == 200
    assert segunda.content == primeira.content
    assert segunda.json()["reward"]["xp_awarded"] == BONUS
    assert len(falso.recebidas) == 1


def _erro(resposta: Response) -> tuple[int, str]:
    return resposta.status_code, resposta.json()["code"]


def test_autodeclarada_e_409_sem_evidencia(
    cliente: TestClient, falso: ServidorAnthropicFalso, registro: Registro
) -> None:
    mission_id = _concluida(cliente, registro, None)
    assert _erro(_avaliar(cliente, mission_id)) == (409, "sem_evidencia")
    assert falso.recebidas == []


def test_em_andamento_e_409(
    cliente: TestClient,
    falso: ServidorAnthropicFalso,
    registro: Registro,
    fabrica_de_teste: sessionmaker[Session],
) -> None:
    mission_id = _com_evidencia(cliente, registro)
    with fabrica_de_teste() as sessao:
        abrir_tentativa(
            sessao,
            ESTUDANTE,
            mission_id,
            clock=lambda: AGORA,
            modelo="claude-opus-5",
            limite_do_orfao=timedelta(minutes=1),
        )
        sessao.commit()
    assert _erro(_avaliar(cliente, mission_id)) == (409, "avaliacao_em_andamento")
    assert falso.recebidas == []


def test_sem_chave_e_503_antes_de_tocar_no_banco(cliente: TestClient) -> None:
    """Um id que nao existe responderia 404 se a rota fosse ao banco."""
    app.dependency_overrides[get_tutoria] = lambda: None
    assert _erro(_avaliar(cliente, 2**31 - 1)) == (503, "provedor_nao_configurado")


def test_sem_chave_nao_grava_avaliando(
    cliente: TestClient,
    registro: Registro,
    fabrica_de_teste: sessionmaker[Session],
) -> None:
    mission_id = _com_evidencia(cliente, registro)
    app.dependency_overrides[get_tutoria] = lambda: None
    assert _erro(_avaliar(cliente, mission_id)) == (503, "provedor_nao_configurado")
    with fabrica_de_teste() as sessao:
        assert (
            sessao.scalars(
                select(MissionEvaluation).where(
                    MissionEvaluation.mission_id == mission_id
                )
            ).all()
            == []
        )


def _corpo_do_404_da_conclusao(cliente: TestClient, mission_id: int) -> Any:
    resposta = cliente.post(
        f"/api/missions/{mission_id}/complete", json={"operation_id": "op-404"}
    )
    assert resposta.status_code == 404
    return resposta.json()


def test_inexistente_e_404_com_o_corpo_da_conclusao(cliente: TestClient) -> None:
    resposta = _avaliar(cliente, 2**31 - 1)
    assert resposta.status_code == 404
    assert resposta.json() == _corpo_do_404_da_conclusao(cliente, 2**31 - 1)
    assert resposta.json()["code"] == "missao_nao_encontrada"


def test_diaria_futura_e_404_com_o_corpo_da_conclusao(
    cliente: TestClient,
    registro: Registro,
    fabrica_de_teste: sessionmaker[Session],
) -> None:
    with fabrica_de_teste() as sessao:
        criar_plano(
            sessao,
            user_id=ESTUDANTE,
            semana=SEGUNDA,
            diarias=[NovaDiaria(f"D{i}", "c", 2, 30) for i in range(7)],
            especial=NovaEspecial("E", "c", 60),
            clock=lambda: AGORA,
        )
        sessao.commit()
        plano = sessao.scalars(
            select(WeeklyPlan).where(
                WeeklyPlan.user_id == ESTUDANTE, WeeklyPlan.week_start == SEGUNDA
            )
        ).one()
        registro.planos.append(plano.id)
        futura = sessao.scalars(
            select(Mission.id).where(
                Mission.plan_id == plano.id, Mission.day == SEGUNDA + timedelta(days=5)
            )
        ).one()
    resposta = _avaliar(cliente, futura)
    assert resposta.status_code == 404
    assert resposta.json() == _corpo_do_404_da_conclusao(cliente, futura)


def test_id_zero_e_422(cliente: TestClient) -> None:
    assert _avaliar(cliente, 0).status_code == 422


@pytest.mark.parametrize(
    ("roteiro", "status", "codigo", "prazo_do_provedor"),
    [
        (Roteiro(status_http=500), 502, "provedor_indisponivel", TIMEOUT_FOLGADO),
        (
            Roteiro(atrasar_cabecalhos=TIMEOUT_DA_DEMORA * 3),
            504,
            "tempo_esgotado",
            TIMEOUT_DA_DEMORA,
        ),
        (_veredito("otimo"), 502, "avaliacao_invalida", TIMEOUT_FOLGADO),
    ],
    ids=["provedor-fora", "tempo-esgotado", "saida-invalida"],
)
def test_falhas_do_modelo_ja_gravadas(
    cliente: TestClient,
    falso: ServidorAnthropicFalso,
    registro: Registro,
    fabrica_de_teste: sessionmaker[Session],
    roteiro: Roteiro,
    status: int,
    codigo: str,
) -> None:
    mission_id = _com_evidencia(cliente, registro)
    falso.roteiro = roteiro
    assert _erro(_avaliar(cliente, mission_id)) == (status, codigo)
    gravada = _estado(fabrica_de_teste, mission_id)
    assert (gravada.state, gravada.error_code) == (
        EstadoDaAvaliacao.FALHOU,
        FalhaDaAvaliacao(codigo),
    )


def test_os_codigos_http_da_avaliacao_tem_o_valor_do_stream() -> None:
    """Os dois codigos que ja existiam no stream ganham caminho HTTP com o
    MESMO valor (spec, "Erros"): a tela le os dois pelo mesmo vocabulario."""
    assert (
        CodigoDeErro.PROVEDOR_INDISPONIVEL.value
        == CodigoDoStream.PROVEDOR_INDISPONIVEL.value
    )
    assert CodigoDeErro.TEMPO_ESGOTADO.value == CodigoDoStream.TEMPO_ESGOTADO.value


def test_cada_falha_da_avaliacao_tem_um_codigo_http() -> None:
    """O handler traduz `FalhaDaAvaliacao` em `CodigoDeErro` pelo valor: uma
    falha nova sem codigo quebraria ali, com 500."""
    for falha in FalhaDaAvaliacao:
        assert CodigoDeErro(falha.value).value == falha.value
