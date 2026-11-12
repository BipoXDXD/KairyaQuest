"""A migracao 0004: livro-razao de XP, conquistas, e o backfill retroativo.

Segue o padrao de `tests/integration/test_migrations.py`: o cenario e
populado em 0003, com SQL cru numa conexao commitada, o `upgrade` para
`head` aciona o backfill, e o `finally` sempre volta o esquema para `head`,
apagando so o que o teste inseriu.
"""

from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

import pytest
from alembic import command
from sqlalchemy import Connection, Engine, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
)
from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import (
    Mission,
    WeeklyPlan,
)
from focusquest.modules.missions.service import concluir_missao, criar_missao
from focusquest.modules.progression.domain import Codigo
from focusquest.modules.progression.models import (
    FONTE_CONCLUSAO,
    UserAchievement,
    XpEntry,
)
from focusquest.modules.tutoring.domain import (
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.users.models import User

from .conftest import alembic_config

ESTUDANTE = 1

# O cenario: uma avulsa isolada, um plano da semana com as 7
# diarias e a especial, uma avulsa criada pela Kairya (tutor_actions), e uma
# avulsa pendente que nao pode gerar lancamento.
SEMANA = date(2026, 9, 14)
DIAS_DA_SEMANA = [SEMANA + timedelta(days=i) for i in range(7)]
PLANO_CRIADO_EM = datetime(2026, 9, 14, 12, 0, tzinfo=UTC)
AVULSA1_CONCLUIDA = datetime(2026, 9, 10, 15, 0, tzinfo=UTC)
ESPECIAL_CONCLUIDA = datetime(2026, 9, 21, 15, 0, tzinfo=UTC)
KAIRYA_PROPOSTA_EM = datetime(2026, 9, 8, 12, 0, tzinfo=UTC)
KAIRYA_CONCLUIDA = datetime(2026, 9, 22, 15, 0, tzinfo=UTC)

# Um dia perdido depois do marco (a mutacao que troca a maior sequencia
# pela sequencia ate o marco): sem ele,
# `_maior_sequencia` e `_sequencia_ate(historico, max(historico))` dariam o
# mesmo resultado, e a mutacao nao reprovaria nada.
PROXIMA_SEGUNDA = SEMANA + timedelta(days=14)
PROXIMA_SEMANA_CRIADA = datetime(2026, 9, 25, 12, 0, tzinfo=UTC)


def _as_utc(dia: date, hora: int = 15) -> datetime:
    return datetime.combine(dia, time(hora), tzinfo=UTC)


def _popular_em_0003(conexao: Connection) -> dict[str, Any]:
    """Insere o cenario na tabela crua, em 0003 (antes da migracao 0004).

    A avulsa da Kairya nasce com id MENOR que o das diarias, embora conclua
    DEPOIS delas -- e o que torna discriminante a mutacao que ordena so
    por id (ORDER BY id, sem completed_at, daria uma ordem de processamento
    diferente da ordem cronologica).
    """
    ids: dict[str, Any] = {}

    ids["avulsa1"] = conexao.execute(
        text(
            "INSERT INTO missions (user_id, instructions, completion_criterion, "
            "difficulty, estimated_minutes, deadline, state, mission_type, "
            "completed_at) VALUES (:u, 'Ler um capitulo', 'Resumo entregue', 2, "
            "30, :prazo, 'concluida', 'avulsa', :concl) RETURNING id"
        ),
        {"u": ESTUDANTE, "prazo": AVULSA1_CONCLUIDA, "concl": AVULSA1_CONCLUIDA},
    ).scalar_one()

    pergunta_id = conexao.execute(
        text(
            "INSERT INTO tutor_messages (user_id, role, content, status, "
            "client_message_id, created_at) VALUES "
            "(:u, 'user', 'Preciso de um desafio', 'completa', "
            "'c-progressao-0004', :ts) RETURNING id"
        ),
        {"u": ESTUDANTE, "ts": KAIRYA_PROPOSTA_EM},
    ).scalar_one()
    resposta_id = conexao.execute(
        text(
            "INSERT INTO tutor_messages (user_id, role, content, status, "
            "reply_to_id, created_at) VALUES "
            "(:u, 'tutor', 'Aqui esta', 'completa', :pergunta, :ts) RETURNING id"
        ),
        {"u": ESTUDANTE, "pergunta": pergunta_id, "ts": KAIRYA_PROPOSTA_EM},
    ).scalar_one()
    ids["pergunta_id"] = pergunta_id

    ids["kairya"] = conexao.execute(
        text(
            "INSERT INTO missions (user_id, instructions, completion_criterion, "
            "difficulty, estimated_minutes, deadline, state, mission_type, "
            "completed_at) VALUES (:u, 'Missao da Kairya', 'Resumo entregue', 3, "
            "45, :prazo, 'concluida', 'avulsa', :concl) RETURNING id"
        ),
        {"u": ESTUDANTE, "prazo": KAIRYA_CONCLUIDA, "concl": KAIRYA_CONCLUIDA},
    ).scalar_one()

    conexao.execute(
        text(
            "INSERT INTO tutor_actions (message_id, kind, payload, state, "
            "mission_id, created_at, decided_at) VALUES "
            "(:msg, 'create_mission', '{}', 'executada', :missao, :ts, :ts)"
        ),
        {"msg": resposta_id, "missao": ids["kairya"], "ts": KAIRYA_PROPOSTA_EM},
    )

    plano_id = conexao.execute(
        text(
            "INSERT INTO weekly_plans (user_id, week_start, created_at) "
            "VALUES (:u, :inicio, :criado) RETURNING id"
        ),
        {"u": ESTUDANTE, "inicio": SEMANA, "criado": PLANO_CRIADO_EM},
    ).scalar_one()
    ids["plano_id"] = plano_id

    diarias: list[int] = []
    for dia in DIAS_DA_SEMANA:
        mid = conexao.execute(
            text(
                "INSERT INTO missions (user_id, instructions, "
                "completion_criterion, difficulty, estimated_minutes, state, "
                "mission_type, plan_id, day, completed_at) VALUES "
                "(:u, 'Diaria', 'Feita', 1, 30, 'concluida', 'diaria', :plano, "
                ":dia, :concl) RETURNING id"
            ),
            {"u": ESTUDANTE, "plano": plano_id, "dia": dia, "concl": _as_utc(dia)},
        ).scalar_one()
        diarias.append(mid)
    ids["diarias"] = diarias

    ids["especial"] = conexao.execute(
        text(
            "INSERT INTO missions (user_id, instructions, completion_criterion, "
            "difficulty, estimated_minutes, state, mission_type, plan_id, "
            "completed_at) VALUES (:u, 'Especial', 'Feita', 5, 60, 'concluida', "
            "'especial', :plano, :concl) RETURNING id"
        ),
        {"u": ESTUDANTE, "plano": plano_id, "concl": ESPECIAL_CONCLUIDA},
    ).scalar_one()

    ids["pendente"] = conexao.execute(
        text(
            "INSERT INTO missions (user_id, instructions, completion_criterion, "
            "difficulty, estimated_minutes, deadline, state, mission_type) "
            "VALUES (:u, 'Ainda nao', 'y', 1, 30, :prazo, 'pendente', 'avulsa') "
            "RETURNING id"
        ),
        {"u": ESTUDANTE, "prazo": KAIRYA_CONCLUIDA + timedelta(days=30)},
    ).scalar_one()

    plano2_id = conexao.execute(
        text(
            "INSERT INTO weekly_plans (user_id, week_start, created_at) "
            "VALUES (:u, :inicio, :criado) RETURNING id"
        ),
        {"u": ESTUDANTE, "inicio": PROXIMA_SEGUNDA, "criado": PROXIMA_SEMANA_CRIADA},
    ).scalar_one()
    ids["plano2_id"] = plano2_id

    ids["dia_perdido"] = conexao.execute(
        text(
            "INSERT INTO missions (user_id, instructions, completion_criterion, "
            "difficulty, estimated_minutes, state, mission_type, plan_id, day) "
            "VALUES (:u, 'Diaria perdida', 'y', 1, 30, 'pendente', 'diaria', "
            ":plano, :dia) RETURNING id"
        ),
        {"u": ESTUDANTE, "plano": plano2_id, "dia": PROXIMA_SEGUNDA},
    ).scalar_one()

    return ids


def _apagar(conexao: Connection, tabela: str, ids_lista: list[int]) -> None:
    """Apaga so as linhas indicadas, pelo id -- join, nao `str(tupla)`, pelo
    mesmo motivo da 0001 (uma lista com 1 elemento vira SQL invalido)."""
    if not ids_lista:
        return
    marcador = ", ".join(str(i) for i in ids_lista)
    conexao.execute(text(f"DELETE FROM {tabela} WHERE id IN ({marcador})"))


@pytest.fixture(scope="module")
def cenario(banco_migrado: Engine) -> Iterator[dict[str, Any]]:
    """Popula o cenario em 0003, sobe para `head` (aciona o backfill) e
    limpa so o que inseriu ao final, devolvendo o esquema para `head`."""
    command.downgrade(alembic_config(), "0003")
    with banco_migrado.begin() as conexao:
        ids = _popular_em_0003(conexao)
    try:
        command.upgrade(alembic_config(), "head")
        yield ids
    finally:
        command.downgrade(alembic_config(), "0003")
        with banco_migrado.begin() as conexao:
            _apagar(conexao, "tutor_messages", [ids["pergunta_id"]])
            _apagar(
                conexao,
                "missions",
                [
                    ids["avulsa1"],
                    ids["kairya"],
                    *ids["diarias"],
                    ids["especial"],
                    ids["pendente"],
                    ids["dia_perdido"],
                ],
            )
            _apagar(conexao, "weekly_plans", [ids["plano_id"], ids["plano2_id"]])
        command.upgrade(alembic_config(), "head")


def test_a_0004_cria_as_tabelas_e_o_downgrade_as_remove(banco_migrado: Engine) -> None:
    tabelas = set(inspect(banco_migrado).get_table_names())
    assert {"xp_entries", "user_achievements"} <= tabelas

    command.downgrade(alembic_config(), "0003")
    try:
        tabelas = set(inspect(banco_migrado).get_table_names())
        assert not ({"xp_entries", "user_achievements"} & tabelas)
        assert "missions" in tabelas
    finally:
        command.upgrade(alembic_config(), "head")


def test_o_backfill_lanca_o_xp_de_cada_missao_concluida_na_ordem_historica(
    banco_migrado: Engine, cenario: dict[str, Any]
) -> None:
    with banco_migrado.connect() as conexao:
        linhas = conexao.execute(
            text(
                "SELECT id, mission_id, amount, source, credited_at "
                "FROM xp_entries ORDER BY id"
            )
        ).all()

    diarias = cenario["diarias"]
    ordem_esperada = [
        cenario["avulsa1"],
        *diarias,
        cenario["especial"],
        cenario["kairya"],
    ]
    valores_esperados = [40, 20, 20, 20, 20, 20, 20, 20, 660, 80]

    assert [linha.mission_id for linha in linhas] == ordem_esperada
    assert [linha.amount for linha in linhas] == valores_esperados
    assert all(linha.source == FONTE_CONCLUSAO for linha in linhas)

    completados = {
        cenario["avulsa1"]: AVULSA1_CONCLUIDA,
        **{mid: _as_utc(dia) for mid, dia in zip(diarias, DIAS_DA_SEMANA, strict=True)},
        cenario["especial"]: ESPECIAL_CONCLUIDA,
        cenario["kairya"]: KAIRYA_CONCLUIDA,
    }
    for linha in linhas:
        assert linha.credited_at == completados[linha.mission_id]

    excluidos = {cenario["pendente"], cenario["dia_perdido"]}
    assert not excluidos & {linha.mission_id for linha in linhas}


def test_o_backfill_destrava_as_conquistas_na_data_em_que_a_condicao_valeu(
    banco_migrado: Engine, cenario: dict[str, Any]
) -> None:
    with banco_migrado.connect() as conexao:
        linhas = {
            linha.code: linha
            for linha in conexao.execute(
                text(
                    "SELECT ua.code, ua.unlocked_at, xe.mission_id "
                    "FROM user_achievements ua "
                    "JOIN xp_entries xe ON xe.id = ua.xp_entry_id "
                    "WHERE ua.user_id = :u"
                ),
                {"u": ESTUDANTE},
            ).all()
        }

    assert set(linhas) == {
        Codigo.FIRST_STEPS.value,
        Codigo.STREAK_7.value,
        Codigo.VETERAN_10.value,
        Codigo.KAIRYA_PARTNERSHIP.value,
    }

    assert linhas[Codigo.FIRST_STEPS.value].unlocked_at == AVULSA1_CONCLUIDA
    assert linhas[Codigo.FIRST_STEPS.value].mission_id == cenario["avulsa1"]

    domingo = DIAS_DA_SEMANA[6]
    assert linhas[Codigo.STREAK_7.value].unlocked_at == _as_utc(domingo)
    assert linhas[Codigo.STREAK_7.value].mission_id == cenario["diarias"][6]

    assert linhas[Codigo.VETERAN_10.value].unlocked_at == KAIRYA_CONCLUIDA
    assert linhas[Codigo.VETERAN_10.value].mission_id == cenario["kairya"]

    assert linhas[Codigo.KAIRYA_PARTNERSHIP.value].unlocked_at == KAIRYA_CONCLUIDA
    assert linhas[Codigo.KAIRYA_PARTNERSHIP.value].mission_id == cenario["kairya"]


def test_o_backfill_falha_alto_com_missao_concluida_sem_data(
    banco_migrado: Engine,
) -> None:
    """A 0001 nao tem uma restricao que amarre `state` a `completed_at`
    (conferido: nenhuma das migracoes 0001-0003 tem um CHECK ligando os
    dois) -- por isso a linha entra direto, sem precisar desligar restricao
    nenhuma."""
    command.downgrade(alembic_config(), "0003")
    with banco_migrado.begin() as conexao:
        missao_id = conexao.execute(
            text(
                "INSERT INTO missions (user_id, instructions, "
                "completion_criterion, difficulty, estimated_minutes, "
                "deadline, state, mission_type) VALUES "
                "(:u, 'Sem data', 'y', 1, 30, :prazo, 'concluida', 'avulsa') "
                "RETURNING id"
            ),
            {"u": ESTUDANTE, "prazo": AVULSA1_CONCLUIDA},
        ).scalar_one()
    try:
        with pytest.raises(RuntimeError, match="completed_at"):
            command.upgrade(alembic_config(), "head")
        assert "xp_entries" not in set(inspect(banco_migrado).get_table_names())
    finally:
        with banco_migrado.begin() as conexao:
            conexao.execute(
                text("DELETE FROM missions WHERE id = :id"), {"id": missao_id}
            )
        command.upgrade(alembic_config(), "head")


# ---------------------------------------------------------------------------
# O teste de equivalencia (D8): o backfill da migracao bate com o
# credito do servico de hoje, no MESMO cenario -- construido duas vezes, cada
# vez para um usuario PROPRIO (para que os dois nao disputem qual mission
# unlocked "first_steps" primeiro quando os dois rodam no mesmo backfill
# global) e comparado por ROTULO (o id bruto nasce diferente nos dois
# espacos).
# ---------------------------------------------------------------------------

EQUIVALENCIA_A = 2
EQUIVALENCIA_B = 3


def _relogio(instante: datetime) -> Callable[[], datetime]:
    return lambda: instante


def _popular_cenario_equivalente_em_0003(
    conexao: Connection, user_id: int
) -> dict[str, Any]:
    """O mesmo cenario de `_popular_em_0003`, para um usuario proprio."""
    conexao.execute(
        text("INSERT INTO users (id, display_name) VALUES (:id, 'Equivalencia')"),
        {"id": user_id},
    )
    ids: dict[str, Any] = {}

    ids["avulsa1"] = conexao.execute(
        text(
            "INSERT INTO missions (user_id, instructions, completion_criterion, "
            "difficulty, estimated_minutes, deadline, state, mission_type, "
            "completed_at) VALUES (:u, 'Ler um capitulo', 'Resumo entregue', 2, "
            "30, :prazo, 'concluida', 'avulsa', :concl) RETURNING id"
        ),
        {"u": user_id, "prazo": AVULSA1_CONCLUIDA, "concl": AVULSA1_CONCLUIDA},
    ).scalar_one()

    pergunta_id = conexao.execute(
        text(
            "INSERT INTO tutor_messages (user_id, role, content, status, "
            "client_message_id, created_at) VALUES "
            "(:u, 'user', 'Preciso de um desafio', 'completa', :cid, :ts) "
            "RETURNING id"
        ),
        {"u": user_id, "cid": f"c-equivalencia-{user_id}", "ts": KAIRYA_PROPOSTA_EM},
    ).scalar_one()
    resposta_id = conexao.execute(
        text(
            "INSERT INTO tutor_messages (user_id, role, content, status, "
            "reply_to_id, created_at) VALUES "
            "(:u, 'tutor', 'Aqui esta', 'completa', :pergunta, :ts) RETURNING id"
        ),
        {"u": user_id, "pergunta": pergunta_id, "ts": KAIRYA_PROPOSTA_EM},
    ).scalar_one()
    ids["pergunta_id"] = pergunta_id

    ids["kairya"] = conexao.execute(
        text(
            "INSERT INTO missions (user_id, instructions, completion_criterion, "
            "difficulty, estimated_minutes, deadline, state, mission_type, "
            "completed_at) VALUES (:u, 'Missao da Kairya', 'Resumo entregue', 3, "
            "45, :prazo, 'concluida', 'avulsa', :concl) RETURNING id"
        ),
        {"u": user_id, "prazo": KAIRYA_CONCLUIDA, "concl": KAIRYA_CONCLUIDA},
    ).scalar_one()

    conexao.execute(
        text(
            "INSERT INTO tutor_actions (message_id, kind, payload, state, "
            "mission_id, created_at, decided_at) VALUES "
            "(:msg, 'create_mission', '{}', 'executada', :missao, :ts, :ts)"
        ),
        {"msg": resposta_id, "missao": ids["kairya"], "ts": KAIRYA_PROPOSTA_EM},
    )

    plano_id = conexao.execute(
        text(
            "INSERT INTO weekly_plans (user_id, week_start, created_at) "
            "VALUES (:u, :inicio, :criado) RETURNING id"
        ),
        {"u": user_id, "inicio": SEMANA, "criado": PLANO_CRIADO_EM},
    ).scalar_one()
    ids["plano_id"] = plano_id

    diarias: list[int] = []
    for dia in DIAS_DA_SEMANA:
        mid = conexao.execute(
            text(
                "INSERT INTO missions (user_id, instructions, "
                "completion_criterion, difficulty, estimated_minutes, state, "
                "mission_type, plan_id, day, completed_at) VALUES "
                "(:u, 'Diaria', 'Feita', 1, 30, 'concluida', 'diaria', :plano, "
                ":dia, :concl) RETURNING id"
            ),
            {"u": user_id, "plano": plano_id, "dia": dia, "concl": _as_utc(dia)},
        ).scalar_one()
        diarias.append(mid)
    ids["diarias"] = diarias

    ids["especial"] = conexao.execute(
        text(
            "INSERT INTO missions (user_id, instructions, completion_criterion, "
            "difficulty, estimated_minutes, state, mission_type, plan_id, "
            "completed_at) VALUES (:u, 'Especial', 'Feita', 5, 60, 'concluida', "
            "'especial', :plano, :concl) RETURNING id"
        ),
        {"u": user_id, "plano": plano_id, "concl": ESPECIAL_CONCLUIDA},
    ).scalar_one()

    ids["pendente"] = conexao.execute(
        text(
            "INSERT INTO missions (user_id, instructions, completion_criterion, "
            "difficulty, estimated_minutes, deadline, state, mission_type) "
            "VALUES (:u, 'Ainda nao', 'y', 1, 30, :prazo, 'pendente', 'avulsa') "
            "RETURNING id"
        ),
        {"u": user_id, "prazo": KAIRYA_CONCLUIDA + timedelta(days=30)},
    ).scalar_one()

    plano2_id = conexao.execute(
        text(
            "INSERT INTO weekly_plans (user_id, week_start, created_at) "
            "VALUES (:u, :inicio, :criado) RETURNING id"
        ),
        {"u": user_id, "inicio": PROXIMA_SEGUNDA, "criado": PROXIMA_SEMANA_CRIADA},
    ).scalar_one()
    ids["plano2_id"] = plano2_id

    ids["dia_perdido"] = conexao.execute(
        text(
            "INSERT INTO missions (user_id, instructions, completion_criterion, "
            "difficulty, estimated_minutes, state, mission_type, plan_id, day) "
            "VALUES (:u, 'Diaria perdida', 'y', 1, 30, 'pendente', 'diaria', "
            ":plano, :dia) RETURNING id"
        ),
        {"u": user_id, "plano": plano2_id, "dia": PROXIMA_SEGUNDA},
    ).scalar_one()

    return ids


def _popular_cenario_equivalente_via_servico(
    session: Session, user_id: int
) -> dict[str, Any]:
    """O MESMO cenario, criado pelo servico de hoje -- tudo PENDENTE. Quem
    conclui, na mesma ordem historica, e o proprio teste."""
    session.add(User(id=user_id, display_name="Equivalencia"))
    session.flush()
    ids: dict[str, Any] = {}

    avulsa1 = criar_missao(
        session,
        user_id=user_id,
        instructions="Ler um capitulo",
        completion_criterion="Resumo entregue",
        difficulty=2,
        estimated_minutes=30,
        deadline=AVULSA1_CONCLUIDA + timedelta(days=1),
    )
    ids["avulsa1"] = avulsa1.id

    pergunta = TutorMessage(
        user_id=user_id,
        role=Papel.USUARIO,
        content="Preciso de um desafio",
        status=StatusDaMensagem.COMPLETA,
        client_message_id=f"c-equivalencia-servico-{user_id}",
        created_at=KAIRYA_PROPOSTA_EM,
    )
    session.add(pergunta)
    session.flush()
    resposta = TutorMessage(
        user_id=user_id,
        role=Papel.TUTORA,
        content="Aqui esta",
        status=StatusDaMensagem.COMPLETA,
        reply_to_id=pergunta.id,
        created_at=KAIRYA_PROPOSTA_EM,
    )
    session.add(resposta)
    session.flush()
    ids["pergunta_id"] = pergunta.id

    kairya = criar_missao(
        session,
        user_id=user_id,
        instructions="Missao da Kairya",
        completion_criterion="Resumo entregue",
        difficulty=3,
        estimated_minutes=45,
        deadline=KAIRYA_CONCLUIDA + timedelta(days=1),
    )
    ids["kairya"] = kairya.id
    session.add(
        TutorAction(
            message_id=resposta.id,
            kind=TipoDeAcao.CRIAR_MISSAO,
            payload={},
            state=EstadoDaAcao.EXECUTADA,
            mission_id=kairya.id,
            created_at=KAIRYA_PROPOSTA_EM,
            decided_at=KAIRYA_PROPOSTA_EM,
        )
    )
    session.flush()

    criar_plano(
        session,
        user_id=user_id,
        semana=SEMANA,
        diarias=[NovaDiaria("Diaria", "Feita", 1, 30) for _ in range(7)],
        especial=NovaEspecial("Especial", "Feita", 60),
        clock=lambda: PLANO_CRIADO_EM,
    )
    plano = session.scalars(
        select(WeeklyPlan).where(
            WeeklyPlan.user_id == user_id, WeeklyPlan.week_start == SEMANA
        )
    ).one()
    diarias_do_plano = session.scalars(
        select(Mission).where(
            Mission.plan_id == plano.id, Mission.mission_type == MissionType.DIARIA
        )
    ).all()
    dia_para_id = {missao.day: missao.id for missao in diarias_do_plano}
    ids["diarias"] = [dia_para_id[dia] for dia in DIAS_DA_SEMANA]
    ids["especial"] = session.scalars(
        select(Mission.id).where(
            Mission.plan_id == plano.id, Mission.mission_type == MissionType.ESPECIAL
        )
    ).one()
    ids["plano_id"] = plano.id

    ids["pendente"] = criar_missao(
        session,
        user_id=user_id,
        instructions="Ainda nao",
        completion_criterion="y",
        difficulty=1,
        estimated_minutes=30,
        deadline=KAIRYA_CONCLUIDA + timedelta(days=30),
    ).id

    plano2 = WeeklyPlan(
        user_id=user_id, week_start=PROXIMA_SEGUNDA, created_at=PROXIMA_SEMANA_CRIADA
    )
    session.add(plano2)
    session.flush()
    dia_perdido = Mission(
        user_id=user_id,
        mission_type=MissionType.DIARIA,
        plan_id=plano2.id,
        day=PROXIMA_SEGUNDA,
        instructions="Diaria perdida",
        completion_criterion="y",
        difficulty=1,
        estimated_minutes=30,
        deadline=None,
        state=MissionState.PENDENTE,
    )
    session.add(dia_perdido)
    session.flush()
    ids["dia_perdido"] = dia_perdido.id
    ids["plano2_id"] = plano2.id

    return ids


def _rotular(ids: dict[str, Any]) -> dict[int, str]:
    """mission_id -> rotulo estavel: o mesmo rotulo nos dois cenarios, embora
    os ids brutos nascam em espacos diferentes."""
    rotulos: dict[int, str] = {
        ids["avulsa1"]: "avulsa1",
        ids["especial"]: "especial",
        ids["kairya"]: "kairya",
    }
    for indice, mission_id in enumerate(ids["diarias"]):
        rotulos[mission_id] = f"diaria_{indice}"
    return rotulos


def _id_do_rotulo(ids: dict[str, Any], rotulo: str) -> int:
    if rotulo.startswith("diaria_"):
        return int(ids["diarias"][int(rotulo.removeprefix("diaria_"))])
    return int(ids[rotulo])


def _coletar(
    engine: Engine, mission_ids: list[int]
) -> tuple[dict[int, int], dict[str, tuple[datetime, int]]]:
    """Lancamentos e conquistas restritos a ESTES ids de missao -- e nao ao
    usuario -- para que o resultado nao misture com o que outro teste do
    modulo (a fixture `cenario`) tenha deixado no mesmo banco."""
    if not mission_ids:
        return {}, {}
    marcador = ", ".join(str(i) for i in mission_ids)
    with engine.connect() as conexao:
        entradas = {
            linha.mission_id: linha.amount
            for linha in conexao.execute(
                text(
                    "SELECT mission_id, amount FROM xp_entries "
                    f"WHERE mission_id IN ({marcador})"
                )
            )
        }
        conquistas = {
            linha.code: (linha.unlocked_at, linha.mission_id)
            for linha in conexao.execute(
                text(
                    "SELECT ua.code, ua.unlocked_at, xe.mission_id "
                    "FROM user_achievements ua "
                    "JOIN xp_entries xe ON xe.id = ua.xp_entry_id "
                    f"WHERE xe.mission_id IN ({marcador})"
                )
            )
        }
    return entradas, conquistas


def test_o_backfill_e_equivalente_ao_servico_de_hoje(banco_migrado: Engine) -> None:
    """D8: o backfill da migracao bate, lancamento a lancamento e conquista a
    conquista, com o credito do servico de hoje sobre o MESMO cenario.

    Cada lado usa o SEU PROPRIO usuario (EQUIVALENCIA_A, EQUIVALENCIA_B): o
    backfill acumula fatos POR USUARIO, e usuarios diferentes nao disputam
    qual mission destravou uma conquista primeiro. A comparacao e por
    ROTULO -- avulsa1, kairya, especial, diaria_0..6 -- porque o id bruto nasce
    diferente nos dois espacos (um populado por SQL cru em 0003, o outro pelo
    `criar_missao`/`criar_plano`/`concluir_missao` de hoje em `head`).
    """
    command.downgrade(alembic_config(), "0003")
    with banco_migrado.begin() as conexao:
        ids_a = _popular_cenario_equivalente_em_0003(conexao, EQUIVALENCIA_A)
    ids_b: dict[str, Any] = {}
    try:
        command.upgrade(alembic_config(), "head")

        mission_ids_a = [
            ids_a["avulsa1"],
            ids_a["kairya"],
            ids_a["especial"],
            *ids_a["diarias"],
        ]
        entradas_a, conquistas_a = _coletar(banco_migrado, mission_ids_a)
        rotulo_a = _rotular(ids_a)
        entradas_a_rotuladas = {
            rotulo_a[mid]: amount for mid, amount in entradas_a.items()
        }
        conquistas_a_rotuladas = {
            codigo: (quando, rotulo_a[mid])
            for codigo, (quando, mid) in conquistas_a.items()
        }

        with Session(banco_migrado) as sessao:
            ids_b = _popular_cenario_equivalente_via_servico(sessao, EQUIVALENCIA_B)
            sessao.commit()

        ordem = [
            ("avulsa1", AVULSA1_CONCLUIDA),
            *[(f"diaria_{i}", _as_utc(dia)) for i, dia in enumerate(DIAS_DA_SEMANA)],
            ("especial", ESPECIAL_CONCLUIDA),
            ("kairya", KAIRYA_CONCLUIDA),
        ]
        with Session(banco_migrado) as sessao:
            for indice, (rotulo, quando) in enumerate(ordem):
                concluir_missao(
                    sessao,
                    EQUIVALENCIA_B,
                    _id_do_rotulo(ids_b, rotulo),
                    f"op-equivalencia-{indice}",
                    clock=_relogio(quando),
                )
            sessao.commit()

        mission_ids_b = [
            ids_b["avulsa1"],
            ids_b["kairya"],
            ids_b["especial"],
            *ids_b["diarias"],
        ]
        entradas_b, conquistas_b = _coletar(banco_migrado, mission_ids_b)
        rotulo_b = _rotular(ids_b)
        entradas_b_rotuladas = {
            rotulo_b[mid]: amount for mid, amount in entradas_b.items()
        }
        conquistas_b_rotuladas = {
            codigo: (quando, rotulo_b[mid])
            for codigo, (quando, mid) in conquistas_b.items()
        }

        assert entradas_a_rotuladas == entradas_b_rotuladas
        assert conquistas_a_rotuladas == conquistas_b_rotuladas
    finally:
        # O downgrade livra os lancamentos e conquistas, derrubando as
        # tabelas antes de recria-las. As missoes NAO podem ser apagadas
        # antes das mensagens: `tutor_actions.mission_id` nao tem
        # `ondelete` (ver `tutoring/models.py`), entao apagar a missao com a
        # acao ainda apontando pra ela e violacao de chave estrangeira -- e
        # so apagar a mensagem cascata a acao. So depois disso o usuario
        # pode ser apagado (ele nao tem mais nada pendurado).
        command.downgrade(alembic_config(), "0003")
        with banco_migrado.begin() as conexao:
            for ids in (ids_a, ids_b):
                if not ids:
                    continue
                _apagar(conexao, "tutor_messages", [ids["pergunta_id"]])
                _apagar(
                    conexao,
                    "missions",
                    [
                        ids["avulsa1"],
                        ids["kairya"],
                        *ids["diarias"],
                        ids["especial"],
                        ids["pendente"],
                        ids["dia_perdido"],
                    ],
                )
                _apagar(conexao, "weekly_plans", [ids["plano_id"], ids["plano2_id"]])
            conexao.execute(
                text("DELETE FROM users WHERE id = :id"), {"id": EQUIVALENCIA_A}
            )
            if ids_b:
                conexao.execute(
                    text("DELETE FROM users WHERE id = :id"), {"id": EQUIVALENCIA_B}
                )
        command.upgrade(alembic_config(), "head")


# ---------------------------------------------------------------------------
# Restricoes novas, no BANCO. Cada caso viola UMA restricao so, e a
# assercao confere o NOME dela -- o mesmo padrao de
# `tests/integration/test_tutoring_models.py` (`_VIOLACOES` + um unico
# teste parametrizado): a fixture `session` e escopada por funcao, entao
# cada caso do parametrize ja ganha a sua propria sessao com savepoint
# proprio (`join_transaction_mode="create_savepoint"`), sem precisar de um
# `session.begin_nested()` escrito a mao.
# ---------------------------------------------------------------------------

AGORA = datetime(2026, 9, 25, 12, 0, tzinfo=UTC)


def _missao_concluida(session: Session, **ajustes: Any) -> Mission:
    campos: dict[str, Any] = {
        "user_id": ESTUDANTE,
        "mission_type": MissionType.AVULSA,
        "instructions": "Ler",
        "completion_criterion": "Resumo",
        "difficulty": 1,
        "estimated_minutes": 30,
        "deadline": AGORA,
        "state": MissionState.CONCLUIDA,
        "completed_at": AGORA,
    }
    campos.update(ajustes)
    missao = Mission(**campos)
    session.add(missao)
    session.flush()
    return missao


def _entrada(session: Session, missao: Mission, **ajustes: Any) -> XpEntry:
    campos: dict[str, Any] = {
        "user_id": ESTUDANTE,
        "mission_id": missao.id,
        "amount": 20,
        "source": FONTE_CONCLUSAO,
        "credited_at": AGORA,
    }
    campos.update(ajustes)
    entrada = XpEntry(**campos)
    session.add(entrada)
    session.flush()
    return entrada


def _conquista(session: Session, entrada: XpEntry, **ajustes: Any) -> UserAchievement:
    campos: dict[str, Any] = {
        "user_id": ESTUDANTE,
        "code": Codigo.FIRST_STEPS.value,
        "unlocked_at": AGORA,
        "xp_entry_id": entrada.id,
    }
    campos.update(ajustes)
    conquista = UserAchievement(**campos)
    session.add(conquista)
    session.flush()
    return conquista


Caso = Callable[[Session], object]

_VIOLACOES: list[tuple[str, Caso]] = [
    (
        "ck_xp_entries_amount",
        lambda s: _entrada(s, _missao_concluida(s), amount=0),
    ),
    (
        "ck_xp_entries_source",
        lambda s: _entrada(s, _missao_concluida(s), source="bonus"),
    ),
    (
        "uq_xp_entries_mission_id",
        lambda s: (lambda m: (_entrada(s, m), _entrada(s, m)))(_missao_concluida(s)),
    ),
    (
        "ck_user_achievements_code",
        lambda s: _conquista(s, _entrada(s, _missao_concluida(s)), code="secreta"),
    ),
    (
        "pk_user_achievements",
        lambda s: (
            lambda e1, e2: (
                _conquista(s, e1, code=Codigo.FIRST_STEPS.value),
                _conquista(s, e2, code=Codigo.FIRST_STEPS.value),
            )
        )(_entrada(s, _missao_concluida(s)), _entrada(s, _missao_concluida(s))),
    ),
]


@pytest.mark.parametrize(
    ("restricao", "caso"),
    _VIOLACOES,
    ids=[f"{i:02d}-{nome}" for i, (nome, _) in enumerate(_VIOLACOES)],
)
def test_as_restricoes_novas_dizem_nao(
    session: Session, restricao: str, caso: Caso
) -> None:
    with pytest.raises(IntegrityError) as recusa:
        caso(session)
    assert restricao in str(recusa.value.orig)


# Usuario que so este teste usa (os outros do arquivo sao 1, 2 e 3).
SO_DO_CHECK = 4


@pytest.mark.parametrize("codigo", list(Codigo), ids=[c.value for c in Codigo])
def test_o_check_da_migracao_aceita_cada_codigo_do_dominio(
    session: Session, codigo: Codigo
) -> None:
    """O CHECK `ck_user_achievements_code` da 0004 e uma lista CONGELADA; o
    modelo e o catalogo DERIVAM de `Codigo`. Um codigo novo no enum sem uma
    migracao que amplie o CHECK passaria no resto da suite e so apareceria em
    producao, como 500 na primeira conclusao que o destravasse. Aqui ele
    reprova no gate: cada valor de `Codigo` vira uma linha no banco migrado
    (a sessao desfaz tudo no fim).

    O usuario e proprio: a fixture `cenario`, de escopo de modulo, deixa o
    ESTUDANTE com conquistas ja destravadas, e a chave primaria (user_id,
    code) recusaria a linha antes de o CHECK ser consultado."""
    session.add(User(id=SO_DO_CHECK, display_name="So do CHECK"))
    session.flush()
    missao = _missao_concluida(session, user_id=SO_DO_CHECK)
    entrada = _entrada(session, missao, user_id=SO_DO_CHECK)
    _conquista(session, entrada, user_id=SO_DO_CHECK, code=codigo.value)
    guardado = session.scalars(
        select(UserAchievement.code).where(UserAchievement.user_id == SO_DO_CHECK)
    ).one()
    assert guardado == codigo.value


def _dados_legados(conexao: Connection) -> dict[str, list[tuple[Any, ...]]]:
    """Compara o legado de 0003, sem incluir a coluna posterior da 0007.

    `fallback_model` nao existia em 0003; a 0007 documenta a sua remocao no
    downgrade. Todas as colunas originais das mensagens continuam medidas.
    """
    mensagens_em_0003 = (
        "id, user_id, role, content, status, client_message_id, reply_to_id, "
        "error_code, created_at"
    )
    return {
        tabela: [
            tuple(linha)
            for linha in conexao.execute(
                text(
                    f"SELECT {mensagens_em_0003 if tabela == 'tutor_messages' else '*'}"
                    f" FROM {tabela} ORDER BY id"
                )
            )
        ]
        for tabela in (
            "missions",
            "weekly_plans",
            "tutor_messages",
            "tutor_actions",
            "mission_operations",
        )
    }


def _progressao_sem_ids(conexao: Connection) -> dict[str, list[tuple[Any, ...]]]:
    return {
        "xp": [
            tuple(linha)
            for linha in conexao.execute(
                text(
                    "SELECT mission_id, user_id, amount, source, credited_at "
                    "FROM xp_entries ORDER BY mission_id"
                )
            )
        ],
        "conquistas": [
            tuple(linha)
            for linha in conexao.execute(
                text(
                    "SELECT ua.user_id, ua.code, ua.unlocked_at, xe.mission_id "
                    "FROM user_achievements ua "
                    "JOIN xp_entries xe ON xe.id = ua.xp_entry_id "
                    "ORDER BY ua.user_id, ua.code"
                )
            )
        ],
    }


def test_ida_e_volta_0004_populada_preserva_legado_e_reconstroi_progressao(
    banco_migrado: Engine, cenario: dict[str, Any]
) -> None:
    # A fixture historica nao tem operacoes: incluir uma prova sua preservacao.
    with banco_migrado.begin() as conexao:
        operacao_id = conexao.execute(
            text(
                "INSERT INTO mission_operations "
                "(operation_id, mission_id, kind, created_at) "
                "VALUES ('roundtrip-0004', :missao, 'complete', :quando) RETURNING id"
            ),
            {"missao": cenario["avulsa1"], "quando": AVULSA1_CONCLUIDA},
        ).scalar_one()
        legado = _dados_legados(conexao)
        progressao = _progressao_sem_ids(conexao)
    try:
        assert all(legado.values())
        assert progressao["xp"] and progressao["conquistas"]
        pendentes = {cenario["pendente"], cenario["dia_perdido"]}
        assert not pendentes & {linha[0] for linha in progressao["xp"]}
        assert not pendentes & {linha[3] for linha in progressao["conquistas"]}
        command.downgrade(alembic_config(), "0003")
        assert not {"xp_entries", "user_achievements"} & set(
            inspect(banco_migrado).get_table_names()
        )
        with banco_migrado.connect() as conexao:
            assert _dados_legados(conexao) == legado
        command.upgrade(alembic_config(), "head")
        with banco_migrado.connect() as conexao:
            assert _dados_legados(conexao) == legado
            reconstruida = _progressao_sem_ids(conexao)
            assert reconstruida == progressao
            assert not pendentes & {linha[0] for linha in reconstruida["xp"]}
            assert not pendentes & {linha[3] for linha in reconstruida["conquistas"]}
    finally:
        command.upgrade(alembic_config(), "head")
        with banco_migrado.begin() as conexao:
            _apagar(conexao, "mission_operations", [operacao_id])
