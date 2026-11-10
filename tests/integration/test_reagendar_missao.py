"""Reagendar o prazo (decisoes F6-F13): servico e API.

Os auxiliares (`relogio`, `_avulsa`, `_plano`, `_diaria`, `client`, `instante`,
`_criar`) sao COPIADOS de `test_iniciar_missao.py`, nao importados: a regra de
`test_missions_concorrencia.py` -- um teste nao depende do arquivo de outro.
"""

from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from focusquest.core.clock import get_clock
from focusquest.core.database import get_session
from focusquest.core.errors import (
    OperacaoReutilizadaError,
    PrazoDerivadoError,
    PrazoExpiradoError,
    PrazoForaDoLimite,
    PrazoInalteradoError,
)
from focusquest.main import app
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
)
from focusquest.modules.missions.domain import (
    MissionState,
    MissionType,
    MotivoDoReagendamento,
    OrigemDoReagendamento,
    TransicaoIlegalError,
)
from focusquest.modules.missions.models import (
    Mission,
    MissionOperation,
    MissionReschedule,
    User,
)
from focusquest.modules.missions.service import (
    concluir_missao,
    criar_missao,
    iniciar_missao,
    missao_reagendavel,
    reagendar_missao,
)

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


SAO_PAULO = timezone(timedelta(hours=-3))
NOVO = AGORA + timedelta(days=5)


def _reagendar(
    session: Session,
    missao: Mission,
    chave: str,
    *,
    prazo: datetime = NOVO,
    motivo: MotivoDoReagendamento = MotivoDoReagendamento.FALTA_DE_TEMPO,
    agora: datetime = AGORA,
) -> Mission:
    return reagendar_missao(
        session,
        ESTUDANTE,
        missao.id,
        chave,
        novo_prazo=prazo,
        motivo=motivo,
        origem=OrigemDoReagendamento.USUARIO,
        clock=relogio(agora),
    )


def _historico(session: Session, mission_id: int) -> list[MissionReschedule]:
    return list(
        session.scalars(
            select(MissionReschedule)
            .where(MissionReschedule.mission_id == mission_id)
            .order_by(MissionReschedule.id)
        )
    )


def test_reagenda_e_grava_o_historico(session: Session) -> None:
    missao = _avulsa(session)
    antes = missao.deadline
    _reagendar(session, missao, "op-r1")
    assert missao.deadline == NOVO
    (linha,) = _historico(session, missao.id)
    assert (linha.previous_deadline, linha.new_deadline) == (antes, NOVO)
    assert linha.reason is MotivoDoReagendamento.FALTA_DE_TEMPO
    assert linha.origin is OrigemDoReagendamento.USUARIO
    assert linha.rescheduled_at == AGORA
    assert linha.operation_id == "op-r1"
    assert _operacoes(session, missao.id, "reschedule") == 1


def test_em_andamento_continua_em_andamento(session: Session) -> None:
    missao = _avulsa(session)
    iniciar_missao(session, ESTUDANTE, missao.id, "op-i", clock=relogio(AGORA))
    _reagendar(session, missao, "op-r2", agora=AGORA + timedelta(hours=1))
    assert missao.state is MissionState.EM_ANDAMENTO
    assert missao.started_at == AGORA


def test_dois_reagendamentos_viram_dois_elos(session: Session) -> None:
    missao = _avulsa(session)
    _reagendar(session, missao, "op-r3")
    _reagendar(session, missao, "op-r4", prazo=NOVO + timedelta(days=1))
    primeiro, segundo = _historico(session, missao.id)
    assert segundo.previous_deadline == primeiro.new_deadline == NOVO


def test_reenvio_igual_nao_grava_de_novo(session: Session) -> None:
    missao = _avulsa(session)
    _reagendar(session, missao, "op-r5")
    # O mesmo instante em outro fuso e o mesmo pedido (F13).
    _reagendar(
        session,
        missao,
        "op-r5",
        prazo=NOVO.astimezone(SAO_PAULO),
        agora=AGORA + timedelta(hours=2),
    )
    assert len(_historico(session, missao.id)) == 1


@pytest.mark.parametrize(
    "mudanca",
    [
        {"prazo": NOVO + timedelta(minutes=1)},
        {"motivo": MotivoDoReagendamento.DIFICULDADE},
    ],
)
def test_mesma_chave_com_outro_conteudo_e_chave_gasta(
    session: Session, mudanca: dict[str, Any]
) -> None:
    missao = _avulsa(session)
    _reagendar(session, missao, "op-r6")
    with pytest.raises(OperacaoReutilizadaError):
        _reagendar(session, missao, "op-r6", **mudanca)


def test_a_chave_do_inicio_nao_serve_para_reagendar(session: Session) -> None:
    missao = _avulsa(session)
    iniciar_missao(session, ESTUDANTE, missao.id, "op-gasta", clock=relogio(AGORA))
    with pytest.raises(OperacaoReutilizadaError):
        _reagendar(session, missao, "op-gasta")


def test_antecipar_e_permitido(session: Session) -> None:
    missao = _avulsa(session)
    _reagendar(session, missao, "op-r7", prazo=AGORA + timedelta(hours=1))
    assert missao.deadline == AGORA + timedelta(hours=1)


@pytest.mark.parametrize(
    ("preparo", "prazo", "erro"),
    [
        ("concluida", NOVO, TransicaoIlegalError),
        ("nada", AGORA, PrazoExpiradoError),
        ("nada", AGORA - timedelta(days=1), PrazoExpiradoError),
        ("nada", "atual", PrazoInalteradoError),
        ("nada", "atual_sp", PrazoInalteradoError),
        # Pendencia 26: o teto do prazo vale tambem no reagendamento.
        ("nada", AGORA + timedelta(days=365, seconds=1), PrazoForaDoLimite),
    ],
)
def test_cada_recusa_vem_antes_de_qualquer_escrita(
    session: Session, preparo: str, prazo: datetime | str, erro: type[Exception]
) -> None:
    """F17: a confirmacao da Kairya grava a falha DEPOIS da recusa; por isso
    nenhuma recusa pode ter escrito nada antes."""
    missao = _avulsa(session)
    if preparo == "concluida":
        concluir_missao(session, ESTUDANTE, missao.id, "op-c", clock=relogio(AGORA))
    atual = missao.deadline
    assert atual is not None
    alvo = {"atual": atual, "atual_sp": atual.astimezone(SAO_PAULO)}.get(
        str(prazo), prazo
    )
    assert isinstance(alvo, datetime)
    with pytest.raises(erro):
        _reagendar(session, missao, "op-r8", prazo=alvo)
    assert missao.deadline == atual
    assert _historico(session, missao.id) == []
    assert _operacoes(session, missao.id, "reschedule") == 0


@pytest.mark.parametrize(
    "prazo",
    [AGORA + timedelta(seconds=1), AGORA + timedelta(days=365)],
    ids=["agora+1s", "agora+365d"],
)
def test_prazo_na_borda_da_janela_e_reagendado(
    session: Session, prazo: datetime
) -> None:
    """Pendencia 26, borda ACEITA: um segundo depois de agora e exatamente um
    ano depois. O passado (`agora`) segue com `PrazoExpiradoError` e o teto+1s
    com `PrazoForaDoLimite`, no teste de recusas acima."""
    missao = _avulsa(session)
    _reagendar(session, missao, "op-r-borda", prazo=prazo)
    assert missao.deadline == prazo
    assert len(_historico(session, missao.id)) == 1


@pytest.mark.parametrize(
    ("prazo", "mensagem"),
    [
        # Sem fuso: o servico nao pode adivinhar o fuso da maquina.
        (datetime(2026, 9, 28, 12, 0), "sem fuso"),
        # Com fuso, mas o instante em UTC passa do ano 9999.
        (datetime(9999, 12, 31, 23, 59, 59, tzinfo=SAO_PAULO), "fora da faixa"),
    ],
)
def test_prazo_que_nao_e_instante_utc_e_recusado_sem_escrita(
    session: Session, prazo: datetime, mensagem: str
) -> None:
    """A borda (`PrazoComFuso`) ja recusa os dois, mas o
    servico tambem e chamado pela Kairya. Recusado ANTES de normalizar e
    de qualquer escrita, com `ValueError` -- nunca aceito com o fuso da
    maquina, nunca `OverflowError` cru."""
    missao = _avulsa(session)
    atual = missao.deadline
    with pytest.raises(ValueError, match=mensagem):
        _reagendar(session, missao, "op-r10", prazo=prazo)
    assert missao.deadline == atual
    assert _historico(session, missao.id) == []
    assert _operacoes(session, missao.id, "reschedule") == 0


def test_reenvio_depois_de_outro_reagendamento_devolve_a_missao_como_esta(
    session: Session,
) -> None:
    """F13: o reenvio compara com a linha GRAVADA da operacao, nao com o prazo
    corrente, e devolve a missao como esta agora. `op-a`
    leva ao prazo A, `op-b` ao B; o reenvio de `op-a` e o mesmo pedido de
    antes, responde com o prazo B e nao grava um terceiro elo."""
    missao = _avulsa(session)
    prazo_a, prazo_b = NOVO, NOVO + timedelta(days=1)
    _reagendar(session, missao, "op-ra", prazo=prazo_a)
    _reagendar(session, missao, "op-rb", prazo=prazo_b)
    devolvida = _reagendar(
        session, missao, "op-ra", prazo=prazo_a, agora=AGORA + timedelta(hours=1)
    )
    assert devolvida.deadline == prazo_b
    assert [linha.operation_id for linha in _historico(session, missao.id)] == [
        "op-ra",
        "op-rb",
    ]


def test_a_diaria_tem_prazo_derivado(session: Session) -> None:
    _plano(session)
    diaria = _diaria(session, QUARTA)
    with pytest.raises(PrazoDerivadoError):
        _reagendar(session, diaria, "op-r9")
    assert _historico(session, diaria.id) == []


def test_missao_reagendavel(session: Session) -> None:
    pendente = _avulsa(session)
    assert missao_reagendavel(session, ESTUDANTE, pendente.id) is pendente
    concluida = _avulsa(session)
    concluir_missao(session, ESTUDANTE, concluida.id, "op-c9", clock=relogio(AGORA))
    _plano(session)
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()
    alheia = _avulsa(session, user_id=OUTRO)
    for mission_id in (concluida.id, _diaria(session, QUARTA).id, alheia.id, 2**31 - 1):
        assert missao_reagendavel(session, ESTUDANTE, mission_id) is None


# --- API -----------------------------------------------------------------


def _corpo(chave: str, **ajustes: Any) -> dict[str, Any]:
    corpo: dict[str, Any] = {
        "operation_id": chave,
        "new_deadline": NOVO.astimezone(SAO_PAULO).isoformat(),
        "reason": "falta_de_tempo",
    }
    corpo.update(ajustes)
    return corpo


def test_api_reagenda_e_publica_o_historico(
    client: TestClient, instante: list[datetime]
) -> None:
    criada = _criar(client)
    assert criada["reschedules"] == []
    resposta = client.post(
        f"/api/missions/{criada['id']}/reschedule", json=_corpo("op-a1")
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert datetime.fromisoformat(corpo["deadline"]) == NOVO
    (linha,) = corpo["reschedules"]
    assert datetime.fromisoformat(linha["previous_deadline"]) == AGORA + timedelta(
        days=2
    )
    assert datetime.fromisoformat(linha["new_deadline"]) == NOVO
    assert (linha["reason"], linha["origin"]) == ("falta_de_tempo", "usuario")
    assert datetime.fromisoformat(linha["rescheduled_at"]) == AGORA
    listada = next(
        m for m in client.get("/api/missions").json() if m["id"] == criada["id"]
    )
    assert listada["reschedules"] == corpo["reschedules"]


def test_api_reenvio_e_o_mesmo_corpo(
    client: TestClient, instante: list[datetime]
) -> None:
    criada = _criar(client)
    caminho = f"/api/missions/{criada['id']}/reschedule"
    primeira = client.post(caminho, json=_corpo("op-a2"))
    instante[0] = AGORA + timedelta(minutes=3)
    segunda = client.post(caminho, json=_corpo("op-a2"))
    assert segunda.json() == primeira.json()


def test_api_reenvio_em_outro_fuso_e_o_mesmo_corpo(
    client: TestClient, instante: list[datetime]
) -> None:
    """Na borda o cliente troca de grafia. O 1o pedido vai
    em `-03:00`, o reenvio no MESMO instante em `Z`: e o mesmo pedido (F13),
    e o corpo e o mesmo."""
    criada = _criar(client)
    caminho = f"/api/missions/{criada['id']}/reschedule"
    primeira = client.post(caminho, json=_corpo("op-a3"))
    assert primeira.status_code == 200, primeira.text
    instante[0] = AGORA + timedelta(minutes=3)
    segunda = client.post(
        caminho,
        json=_corpo("op-a3", new_deadline=NOVO.isoformat().replace("+00:00", "Z")),
    )
    assert segunda.status_code == 200, segunda.text
    assert segunda.json() == primeira.json()
    assert len(primeira.json()["reschedules"]) == 1


@pytest.mark.parametrize(
    ("corpo", "status", "code"),
    [
        (
            {"new_deadline": (AGORA + timedelta(days=2)).isoformat()},
            409,
            "prazo_inalterado",
        ),
        ({"new_deadline": AGORA.isoformat()}, 422, "prazo_expirado"),
        (
            {"new_deadline": (AGORA + timedelta(days=365, seconds=1)).isoformat()},
            422,
            "prazo_fora_do_limite",
        ),
    ],
)
def test_api_prazo_recusado_com_code(
    client: TestClient,
    instante: list[datetime],
    corpo: dict[str, Any],
    status: int,
    code: str,
) -> None:
    criada = _criar(client)
    resposta = client.post(
        f"/api/missions/{criada['id']}/reschedule", json=_corpo("op-a3", **corpo)
    )
    assert (resposta.status_code, resposta.json()["code"]) == (status, code)
    # Toda recusa deixa o banco como estava: mesmo prazo, nenhum elo.
    (relida,) = [
        m for m in client.get("/api/missions").json() if m["id"] == criada["id"]
    ]
    assert relida["deadline"] == criada["deadline"]
    assert relida["reschedules"] == []


def test_api_concluida_e_transicao_ilegal(
    client: TestClient, instante: list[datetime]
) -> None:
    criada = _criar(client)
    client.post(f"/api/missions/{criada['id']}/complete", json={"operation_id": "op-c"})
    resposta = client.post(
        f"/api/missions/{criada['id']}/reschedule", json=_corpo("op-a4")
    )
    assert (resposta.status_code, resposta.json()["code"]) == (409, "transicao_ilegal")


def test_api_diaria_e_prazo_derivado(
    client: TestClient, session: Session, instante: list[datetime]
) -> None:
    _plano(session)
    diaria = _diaria(session, QUARTA)
    resposta = client.post(
        f"/api/missions/{diaria.id}/reschedule", json=_corpo("op-a5")
    )
    assert (resposta.status_code, resposta.json()["code"]) == (409, "prazo_derivado")


def test_api_chave_gasta_e_operacao_reutilizada(
    client: TestClient, instante: list[datetime]
) -> None:
    criada = _criar(client)
    caminho = f"/api/missions/{criada['id']}/reschedule"
    client.post(caminho, json=_corpo("op-a6"))
    resposta = client.post(caminho, json=_corpo("op-a6", reason="dificuldade"))
    assert (resposta.status_code, resposta.json()["code"]) == (
        409,
        "operacao_reutilizada",
    )


@pytest.mark.parametrize(
    ("ajustes", "campo"),
    [
        ({"new_deadline": "2026-10-01T10:00:00"}, "new_deadline"),
        ({"reason": "preguica"}, "reason"),
        ({"note": "x"}, "note"),
        ({"operation_id": ""}, "operation_id"),
    ],
)
def test_api_corpo_invalido_e_422(
    client: TestClient, instante: list[datetime], ajustes: dict[str, Any], campo: str
) -> None:
    criada = _criar(client)
    resposta = client.post(
        f"/api/missions/{criada['id']}/reschedule", json=_corpo("op-a7", **ajustes)
    )
    assert resposta.status_code == 422
    assert resposta.json()["detail"][0]["loc"][-1] == campo
