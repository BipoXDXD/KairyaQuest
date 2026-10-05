"""Iniciar a missao (pendencia 3, decisoes F1-F4): servico e API."""

from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from focusquest.core.clock import get_clock
from focusquest.core.database import get_session
from focusquest.core.errors import (
    MissaoExpiradaError,
    MissaoNaoEncontradaError,
    NaoPertenceAoUsuarioError,
    OperacaoReutilizadaError,
)
from focusquest.main import app
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
    ler_ciclo,
)
from focusquest.modules.missions.domain import (
    MissionState,
    MissionType,
    TransicaoIlegalError,
    duracao_real,
    xp_da_missao,
)
from focusquest.modules.missions.models import (
    Mission,
    MissionEvidence,
    MissionOperation,
    User,
)
from focusquest.modules.missions.service import (
    NovaEvidencia,
    concluir_missao,
    criar_missao,
    iniciar_missao,
)
from focusquest.modules.progression.models import XpEntry

ESTUDANTE = 1
OUTRO = 2
SEGUNDA = date(2026, 9, 21)
QUARTA = SEGUNDA + timedelta(days=2)
AGORA = datetime(2026, 9, 23, 15, 0, tzinfo=UTC)  # quarta, meio-dia em SP


def relogio(instante: datetime) -> Callable[[], datetime]:
    return lambda: instante


def _avulsa(session: Session, user_id: int = ESTUDANTE) -> Mission:
    return criar_missao(
        session,
        user_id=user_id,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina",
        difficulty=2,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=2),
    )


def _plano(session: Session) -> None:
    criar_plano(
        session,
        user_id=ESTUDANTE,
        semana=SEGUNDA,
        diarias=[NovaDiaria(f"D{i}", "c", 2, 30) for i in range(7)],
        especial=NovaEspecial("E", "c", 60),
        clock=relogio(datetime(2026, 9, 21, 15, tzinfo=UTC)),
    )


def _diaria(session: Session, dia: date) -> Mission:
    return session.scalars(
        select(Mission).where(
            Mission.mission_type == MissionType.DIARIA, Mission.day == dia
        )
    ).one()


def _operacoes(session: Session, mission_id: int, kind: str) -> int:
    return session.execute(
        select(func.count())
        .select_from(MissionOperation)
        .where(MissionOperation.mission_id == mission_id, MissionOperation.kind == kind)
    ).scalar_one()


def _iniciar(
    session: Session, missao: Mission, chave: str, agora: datetime = AGORA
) -> Mission:
    return iniciar_missao(session, ESTUDANTE, missao.id, chave, clock=relogio(agora))


# --- servico -------------------------------------------------------------


def test_inicia_a_pendente_com_o_relogio_injetado(session: Session) -> None:
    missao = _iniciar(session, _avulsa(session), "op-i1")
    assert missao.state is MissionState.EM_ANDAMENTO
    assert missao.started_at == AGORA
    assert _operacoes(session, missao.id, "start") == 1


def test_reenvio_da_mesma_chave_devolve_o_mesmo_inicio(session: Session) -> None:
    missao = _avulsa(session)
    _iniciar(session, missao, "op-i2")
    de_novo = _iniciar(session, missao, "op-i2", AGORA + timedelta(hours=1))
    assert de_novo.started_at == AGORA
    assert _operacoes(session, missao.id, "start") == 1


@pytest.mark.parametrize("concluir_antes", [False, True])
def test_chave_nova_depois_de_iniciada_ou_concluida_e_transicao_ilegal(
    session: Session, concluir_antes: bool
) -> None:
    missao = _avulsa(session)
    if concluir_antes:
        concluir_missao(session, ESTUDANTE, missao.id, "op-c", clock=relogio(AGORA))
    else:
        _iniciar(session, missao, "op-i3")
    with pytest.raises(TransicaoIlegalError, match="em_andamento"):
        _iniciar(session, missao, "op-i4")


def test_a_chave_da_conclusao_nao_serve_para_iniciar_e_vice_versa(
    session: Session,
) -> None:
    """A UNIQUE e sobre a chave sozinha, e o tipo e conferido."""
    concluida = _avulsa(session)
    concluir_missao(
        session, ESTUDANTE, concluida.id, "op-gasta-c", clock=relogio(AGORA)
    )
    with pytest.raises(OperacaoReutilizadaError):
        _iniciar(session, concluida, "op-gasta-c")

    iniciada = _avulsa(session)
    _iniciar(session, iniciada, "op-gasta-i")
    with pytest.raises(OperacaoReutilizadaError):
        concluir_missao(
            session,
            ESTUDANTE,
            iniciada.id,
            "op-gasta-i",
            clock=relogio(AGORA),
            evidencia=NovaEvidencia("Evidencia do pedido recusado", None),
        )
    # SQL com autoflush ANTES do rollback: uma escrita pendente nao pode
    # ficar escondida pela limpeza da fixture nem pelo identity map.
    assert (
        session.scalar(
            select(MissionEvidence).where(MissionEvidence.mission_id == iniciada.id)
        )
        is None
    )
    assert (
        session.scalar(select(XpEntry).where(XpEntry.mission_id == iniciada.id)) is None
    )
    assert session.execute(
        select(Mission.state, Mission.started_at, Mission.completed_at).where(
            Mission.id == iniciada.id
        )
    ).one() == (MissionState.EM_ANDAMENTO, AGORA, None)
    assert session.execute(
        select(MissionOperation.operation_id, MissionOperation.kind).where(
            MissionOperation.mission_id == iniciada.id
        )
    ).all() == [("op-gasta-i", "start")]


def test_a_chave_de_outra_missao_e_chave_gasta(session: Session) -> None:
    primeira, segunda = _avulsa(session), _avulsa(session)
    _iniciar(session, primeira, "op-i5")
    with pytest.raises(OperacaoReutilizadaError):
        _iniciar(session, segunda, "op-i5")


def test_inexistente_e_alheia(session: Session) -> None:
    with pytest.raises(MissaoNaoEncontradaError):
        iniciar_missao(session, ESTUDANTE, 2**31 - 1, "op-i6", clock=relogio(AGORA))
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()
    alheia = _avulsa(session, user_id=OUTRO)
    with pytest.raises(NaoPertenceAoUsuarioError):
        _iniciar(session, alheia, "op-i7")


def test_a_diaria_de_hoje_inicia(session: Session) -> None:
    _plano(session)
    assert (
        _iniciar(session, _diaria(session, QUARTA), "op-d1").state
        is MissionState.EM_ANDAMENTO
    )


def test_a_diaria_perdida_e_expirada_e_a_futura_nao_existe(session: Session) -> None:
    _plano(session)
    with pytest.raises(MissaoExpiradaError):
        _iniciar(session, _diaria(session, QUARTA - timedelta(days=1)), "op-d2")
    with pytest.raises(MissaoNaoEncontradaError):
        _iniciar(session, _diaria(session, QUARTA + timedelta(days=1)), "op-d3")


def test_diaria_futura_com_chave_gasta_responde_como_inexistente(
    session: Session,
) -> None:
    """C11: a ocultacao vem ANTES do reenvio. Uma chave gasta numa missao real,
    mandada ao id de uma diaria ainda nao revelada, e 404 -- e nao 409, que
    revelaria que a diaria existe."""
    _plano(session)
    _iniciar(session, _avulsa(session), "op-gasta-d")
    with pytest.raises(MissaoNaoEncontradaError):
        _iniciar(session, _diaria(session, QUARTA + timedelta(days=1)), "op-gasta-d")


QUARTA_23H50 = datetime(2026, 9, 24, 2, 50, tzinfo=UTC)
QUINTA_00H10 = datetime(2026, 9, 24, 3, 10, tzinfo=UTC)
SEXTA_00H00 = datetime(2026, 9, 25, 3, 0, tzinfo=UTC)  # limite da conclusao tardia


def test_diaria_iniciada_no_dia_e_concluida_depois_da_meia_noite(
    session: Session,
) -> None:
    """F25 (pendencia 115, resolvida). Este teste DOCUMENTAVA o defeito: a
    diaria de quarta iniciada as 23:50 (SP) e concluida as 00:10 de quinta
    virava `perdida`, a conclusao dava `missao_expirada`, e a missao ficava
    `em_andamento` para sempre, sem duracao real. A regra mudou (a pessoa
    comecou a tempo; prender a missao e a perda destrutiva que o README s5
    proibe), e a mudanca DESTE teste e o incremento: agora a conclusao grava
    normalmente, com duracao real, o XP normal da diaria e o dia contando
    para a sequencia -- a diaria pertence ao dia dela, e a sequencia ja e
    derivada do dia da missao.
    """
    _plano(session)
    diaria = _diaria(session, QUARTA)

    _iniciar(session, diaria, "op-d-noite", agora=QUARTA_23H50)
    antes = ler_ciclo(session, ESTUDANTE, clock=relogio(QUINTA_00H10))
    concluir_missao(
        session, ESTUDANTE, diaria.id, "op-d-madrugada", clock=relogio(QUINTA_00H10)
    )
    depois = ler_ciclo(session, ESTUDANTE, clock=relogio(QUINTA_00H10))

    assert diaria.state is MissionState.CONCLUIDA
    assert diaria.started_at == QUARTA_23H50
    assert diaria.completed_at == QUINTA_00H10
    assert duracao_real(diaria.started_at, diaria.completed_at) == timedelta(minutes=20)
    assert _operacoes(session, diaria.id, "complete") == 1
    assert session.scalars(
        select(XpEntry.amount).where(XpEntry.mission_id == diaria.id)
    ).all() == [xp_da_missao(MissionType.DIARIA, 2)]
    # O dia de quarta conta: antes da conclusao a sequencia estava quebrada
    # (quarta sem conclusao), depois ela conta quarta.
    assert (antes.sequencia, depois.sequencia) == (0, 1)


def test_a_conclusao_tardia_vai_ate_o_fim_do_dia_seguinte(session: Session) -> None:
    """F25: o limite e sexta 00:00 para a diaria de quarta. No ultimo instante
    de quinta, conclui; no limite, e `missao_expirada`, como antes."""
    _plano(session)
    no_limite = _diaria(session, QUARTA)
    _iniciar(session, no_limite, "op-lim-i", agora=QUARTA_23H50)
    with pytest.raises(MissaoExpiradaError):
        concluir_missao(
            session, ESTUDANTE, no_limite.id, "op-lim-c", clock=relogio(SEXTA_00H00)
        )
    assert no_limite.state is MissionState.EM_ANDAMENTO

    concluida = concluir_missao(
        session,
        ESTUDANTE,
        no_limite.id,
        "op-lim-c2",
        clock=relogio(SEXTA_00H00 - timedelta(microseconds=1)),
    )
    assert concluida.state is MissionState.CONCLUIDA


def test_diaria_pendente_depois_do_dia_continua_expirada(session: Session) -> None:
    """F25 so vale para quem comecou: a pendente de ontem nao se conclui."""
    _plano(session)
    pendente = _diaria(session, QUARTA)
    with pytest.raises(MissaoExpiradaError):
        concluir_missao(
            session, ESTUDANTE, pendente.id, "op-pend", clock=relogio(QUINTA_00H10)
        )
    assert pendente.state is MissionState.PENDENTE


def test_diaria_em_andamento_depois_do_dia_nao_inicia_de_novo(
    session: Session,
) -> None:
    """Disponivel pela F25 so para concluir: iniciar de novo e transicao
    ilegal (ja esta em andamento), e o `started_at` nao muda."""
    _plano(session)
    diaria = _diaria(session, QUARTA)
    _iniciar(session, diaria, "op-re-1", agora=QUARTA_23H50)
    with pytest.raises(TransicaoIlegalError):
        _iniciar(session, diaria, "op-re-2", agora=QUINTA_00H10)
    assert diaria.started_at == QUARTA_23H50


def test_concluir_depois_de_iniciar_tem_duracao_real(session: Session) -> None:
    missao = _avulsa(session)
    _iniciar(session, missao, "op-i8")
    concluir_missao(
        session,
        ESTUDANTE,
        missao.id,
        "op-c8",
        clock=relogio(AGORA + timedelta(minutes=25)),
    )
    assert missao.completed_at is not None and missao.started_at is not None
    assert missao.completed_at - missao.started_at == timedelta(minutes=25)


# --- API -----------------------------------------------------------------


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_session, None)


@pytest.fixture
def instante() -> Iterator[list[datetime]]:
    """Um relogio que o teste avanca: `instante[0]` e a hora da API."""
    atual = [AGORA]
    app.dependency_overrides[get_clock] = lambda: lambda: atual[0]
    yield atual
    app.dependency_overrides.pop(get_clock, None)


def _criar(client: TestClient) -> dict[str, Any]:
    resposta = client.post(
        "/api/missions",
        json={
            "instructions": "Ler o capitulo 3",
            "completion_criterion": "Resumo",
            "difficulty": 2,
            "estimated_minutes": 30,
            "deadline": (AGORA + timedelta(days=2)).isoformat(),
        },
    )
    assert resposta.status_code == 201, resposta.text
    corpo: dict[str, Any] = resposta.json()
    return corpo


def test_api_inicia_e_depois_mostra_a_duracao(
    client: TestClient, instante: list[datetime]
) -> None:
    criada = _criar(client)
    resposta = client.post(
        f"/api/missions/{criada['id']}/start", json={"operation_id": "op-a1"}
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["state"] == "em_andamento"
    assert datetime.fromisoformat(corpo["started_at"]) == AGORA
    assert corpo["actual_duration_minutes"] is None

    instante[0] = AGORA + timedelta(minutes=25)
    concluida = client.post(
        f"/api/missions/{criada['id']}/complete", json={"operation_id": "op-a2"}
    ).json()
    assert concluida["actual_duration_minutes"] == 25


def test_api_reenvio_e_o_mesmo_corpo(
    client: TestClient, instante: list[datetime]
) -> None:
    criada = _criar(client)
    caminho = f"/api/missions/{criada['id']}/start"
    primeira = client.post(caminho, json={"operation_id": "op-a3"})
    instante[0] = AGORA + timedelta(minutes=5)
    segunda = client.post(caminho, json={"operation_id": "op-a3"})
    assert segunda.status_code == 200
    assert segunda.json() == primeira.json()


@pytest.mark.parametrize(
    ("preparo", "status", "code"),
    [
        ("iniciada", 409, "transicao_ilegal"),
        ("inexistente", 404, "missao_nao_encontrada"),
    ],
)
def test_api_erros_com_code(
    client: TestClient, instante: list[datetime], preparo: str, status: int, code: str
) -> None:
    criada = _criar(client)
    mission_id = 2**31 - 1 if preparo == "inexistente" else criada["id"]
    if preparo == "iniciada":
        client.post(f"/api/missions/{mission_id}/start", json={"operation_id": "op-a4"})
    resposta = client.post(
        f"/api/missions/{mission_id}/start", json={"operation_id": "op-a5"}
    )
    assert (resposta.status_code, resposta.json()["code"]) == (status, code)


def test_api_diaria_perdida_e_missao_expirada(
    client: TestClient, session: Session, instante: list[datetime]
) -> None:
    _plano(session)
    perdida = _diaria(session, QUARTA - timedelta(days=1))
    resposta = client.post(
        f"/api/missions/{perdida.id}/start", json={"operation_id": "op-a6"}
    )
    assert (resposta.status_code, resposta.json()["code"]) == (409, "missao_expirada")


@pytest.mark.parametrize(
    "corpo", [{}, {"operation_id": ""}, {"operation_id": "x" * 201}]
)
def test_api_chave_invalida_e_422(client: TestClient, corpo: dict[str, Any]) -> None:
    criada = _criar(client)
    assert (
        client.post(f"/api/missions/{criada['id']}/start", json=corpo).status_code
        == 422
    )
