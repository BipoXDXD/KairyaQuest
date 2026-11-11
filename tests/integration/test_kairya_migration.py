"""A migracao 0008: os valores `kairya` e `kairya_partnership` (expand + backfill).

Mesmo padrao de `test_acompanhamento_migration.py`: o `finally` sempre devolve
o esquema para `head`, e o que e commitado fica num usuario proprio, apagado
no fim (a cascata de `users` leva missoes, historico, XP e conquistas).

O valor antigo (`tifa`, `tifa_partnership`) aparece aqui so como DADO: e o que
um backup restaurado traria, e o que a migracao e o tolerant reader precisam
tratar ate a Tarefa 2.2 (o contract).
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import CheckConstraint, Connection, Engine, Table, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.core.database import get_session
from focusquest.main import app
from focusquest.modules.missions.domain import OrigemDoReagendamento
from focusquest.modules.missions.models import Mission, MissionReschedule, User
from focusquest.modules.missions.service import criar_missao
from focusquest.modules.progression.domain import Codigo
from focusquest.modules.progression.models import UserAchievement
from focusquest.modules.progression.service import (
    ler_progresso,
    recompensa_da_missao,
)

from .conftest import alembic_config

REVISAO = "0008"
ESTUDANTE = 1
# Usuario so dos testes que commitam: nao disputa a chave (user_id, code) com
# conquistas que outro modulo tenha deixado no ESTUDANTE.
SO_DA_0008 = 80
AGORA = datetime(2026, 11, 10, 15, tzinfo=UTC)

CHECK_DA_ORIGEM = "ck_mission_reschedules_origin"
CHECK_DO_CODIGO = "ck_user_achievements_code"


def _anterior_a_0008() -> str:
    script = ScriptDirectory.from_config(alembic_config())
    anterior = script.get_revision(REVISAO)
    assert anterior is not None
    assert isinstance(anterior.down_revision, str)
    return anterior.down_revision


def _definicao(conexao: Connection, nome: str) -> str:
    return str(
        conexao.execute(
            text(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
                "WHERE conname = :nome"
            ),
            {"nome": nome},
        ).scalar_one()
    )


def _definicoes(banco: Engine) -> dict[str, str]:
    with banco.connect() as conexao:
        return {
            nome: _definicao(conexao, nome)
            for nome in (CHECK_DA_ORIGEM, CHECK_DO_CODIGO)
        }


def _semear(conexao: Connection, origem: str, codigo: str) -> None:
    """Um usuario proprio com uma missao concluida, dois reagendamentos (um da
    pessoa, um da tutora) e duas conquistas (uma comum, uma da tutora)."""
    conexao.execute(
        text("INSERT INTO users (id, display_name) VALUES (:u, 'So da 0008')"),
        {"u": SO_DA_0008},
    )
    missao = conexao.execute(
        text(
            "INSERT INTO missions (user_id, mission_type, instructions, "
            "completion_criterion, difficulty, estimated_minutes, deadline, state, "
            "completed_at, created_at) VALUES (:u, 'avulsa', 'Ler', 'Resumo', 1, "
            "30, :prazo, 'concluida', :em, :em) RETURNING id"
        ),
        {"u": SO_DA_0008, "prazo": AGORA + timedelta(days=1), "em": AGORA},
    ).scalar_one()
    for indice, quem in enumerate(("usuario", origem)):
        chave = f"op-0008-{indice}"
        conexao.execute(
            text(
                "INSERT INTO mission_operations (operation_id, mission_id, kind) "
                "VALUES (:o, :m, 'reschedule')"
            ),
            {"o": chave, "m": missao},
        )
        conexao.execute(
            text(
                "INSERT INTO mission_reschedules (mission_id, operation_id, "
                "previous_deadline, new_deadline, reason, origin, rescheduled_at) "
                "VALUES (:m, :o, :antes, :depois, 'falta_de_tempo', :quem, :em)"
            ),
            {
                "m": missao,
                "o": chave,
                "antes": AGORA + timedelta(days=indice + 1),
                "depois": AGORA + timedelta(days=indice + 2),
                "quem": quem,
                "em": AGORA,
            },
        )
    entrada = conexao.execute(
        text(
            "INSERT INTO xp_entries (user_id, mission_id, amount, source, "
            "credited_at) VALUES (:u, :m, 20, 'mission_completed', :em) RETURNING id"
        ),
        {"u": SO_DA_0008, "m": missao, "em": AGORA},
    ).scalar_one()
    for code in ("first_steps", codigo):
        conexao.execute(
            text(
                "INSERT INTO user_achievements (user_id, code, unlocked_at, "
                "xp_entry_id) VALUES (:u, :c, :em, :e)"
            ),
            {"u": SO_DA_0008, "c": code, "em": AGORA, "e": entrada},
        )


def _valores(banco: Engine) -> tuple[list[str], list[str]]:
    with banco.connect() as conexao:
        origens = conexao.execute(
            text(
                "SELECT r.origin FROM mission_reschedules r "
                "JOIN missions m ON m.id = r.mission_id "
                "WHERE m.user_id = :u ORDER BY r.id"
            ),
            {"u": SO_DA_0008},
        ).scalars()
        codigos = conexao.execute(
            text("SELECT code FROM user_achievements WHERE user_id = :u ORDER BY code"),
            {"u": SO_DA_0008},
        ).scalars()
        return list(origens), list(codigos)


def _preservadas(banco: Engine) -> tuple[list[tuple[object, ...]], ...]:
    """O que o ciclo de migracao nao pode tocar: ids, instantes e o elo com o XP.
    Sem o valor trocado, para comparar antes e depois do ciclo."""
    with banco.connect() as conexao:
        reagendamentos = conexao.execute(
            text(
                "SELECT r.id, r.operation_id, r.previous_deadline, r.new_deadline, "
                "r.rescheduled_at FROM mission_reschedules r "
                "JOIN missions m ON m.id = r.mission_id "
                "WHERE m.user_id = :u ORDER BY r.id"
            ),
            {"u": SO_DA_0008},
        ).all()
        conquistas = conexao.execute(
            text(
                "SELECT unlocked_at, xp_entry_id FROM user_achievements "
                "WHERE user_id = :u ORDER BY unlocked_at, xp_entry_id"
            ),
            {"u": SO_DA_0008},
        ).all()
        return [tuple(r) for r in reagendamentos], [tuple(c) for c in conquistas]


def _par_de_conquistas(banco: Engine) -> list[tuple[str, datetime]]:
    with banco.connect() as conexao:
        return [
            (str(codigo), quando)
            for codigo, quando in conexao.execute(
                text(
                    "SELECT code, unlocked_at FROM user_achievements "
                    "WHERE user_id = :u AND code IN "
                    "('tifa_partnership', 'kairya_partnership') ORDER BY code"
                ),
                {"u": SO_DA_0008},
            )
        ]


def _segunda_do_par(conexao: Connection, codigo: str, quando: datetime) -> None:
    """A outra metade do par, do mesmo usuario, com o XP ja semeado."""
    conexao.execute(
        text(
            "INSERT INTO user_achievements (user_id, code, unlocked_at, xp_entry_id) "
            "SELECT :u, :c, :em, id FROM xp_entries WHERE user_id = :u"
        ),
        {"u": SO_DA_0008, "c": codigo, "em": quando},
    )


def _antigos_no_banco(banco: Engine) -> int:
    """Linhas com valor antigo em TODAS as colunas afetadas, de qualquer usuario."""
    with banco.connect() as conexao:
        return int(
            conexao.execute(
                text(
                    "SELECT (SELECT count(*) FROM mission_reschedules "
                    "WHERE origin = 'tifa') + (SELECT count(*) FROM user_achievements "
                    "WHERE code = 'tifa_partnership')"
                )
            ).scalar_one()
        )


@pytest.fixture
def limpar_usuario(banco_migrado: Engine) -> Iterator[None]:
    try:
        yield
    finally:
        command.upgrade(alembic_config(), "head")
        with banco_migrado.begin() as conexao:
            conexao.execute(text("DELETE FROM users WHERE id = :u"), {"u": SO_DA_0008})


def test_a_0008_encadeia_na_0007(banco_migrado: Engine) -> None:
    assert _anterior_a_0008() == "0007"


def test_o_upgrade_troca_todo_valor_antigo_pelo_novo(
    banco_migrado: Engine, limpar_usuario: None
) -> None:
    """Um backup de antes da 0008 (valores antigos) restaurado e migrado nao
    deixa nenhuma linha com o valor antigo, e nao viola CHECK nenhum."""
    command.downgrade(alembic_config(), _anterior_a_0008())
    with banco_migrado.begin() as conexao:
        _semear(conexao, origem="tifa", codigo="tifa_partnership")

    command.upgrade(alembic_config(), REVISAO)

    assert _antigos_no_banco(banco_migrado) == 0
    assert _valores(banco_migrado) == (
        ["usuario", "kairya"],
        ["first_steps", "kairya_partnership"],
    )


def test_o_upgrade_expande_os_checks_com_os_dois_valores(
    banco_migrado: Engine,
) -> None:
    definicoes = _definicoes(banco_migrado)
    assert "'kairya'" in definicoes[CHECK_DA_ORIGEM]
    assert "'tifa'" in definicoes[CHECK_DA_ORIGEM]
    assert "'kairya_partnership'" in definicoes[CHECK_DO_CODIGO]
    assert "'tifa_partnership'" in definicoes[CHECK_DO_CODIGO]


def test_downgrade_e_upgrade_de_novo_sao_idempotentes(
    banco_migrado: Engine, limpar_usuario: None
) -> None:
    """O downgrade devolve os valores antigos e os CHECKs da 0007; o upgrade
    seguinte termina de novo em `kairya`, com os CHECKs expandidos."""
    cfg = alembic_config()
    na_head = _definicoes(banco_migrado)
    command.downgrade(cfg, _anterior_a_0008())
    na_0007 = _definicoes(banco_migrado)
    assert "kairya" not in na_0007[CHECK_DA_ORIGEM]
    assert "kairya" not in na_0007[CHECK_DO_CODIGO]

    command.upgrade(cfg, REVISAO)
    with banco_migrado.begin() as conexao:
        _semear(conexao, origem="kairya", codigo="kairya_partnership")
    preservadas = _preservadas(banco_migrado)

    command.downgrade(cfg, _anterior_a_0008())
    assert _valores(banco_migrado) == (
        ["usuario", "tifa"],
        ["first_steps", "tifa_partnership"],
    )
    assert _preservadas(banco_migrado) == preservadas
    assert _definicoes(banco_migrado) == na_0007

    command.upgrade(cfg, REVISAO)
    assert _valores(banco_migrado) == (
        ["usuario", "kairya"],
        ["first_steps", "kairya_partnership"],
    )
    assert _preservadas(banco_migrado) == preservadas
    assert _antigos_no_banco(banco_migrado) == 0
    assert _definicoes(banco_migrado) == na_head


# O par (codigo antigo + novo) do mesmo usuario: so nasce depois do expand.
# A migracao fica com a linha de `unlocked_at` mais antigo, nos dois sentidos.
ANTES = AGORA - timedelta(days=1)
# Todo codigo vigente mais o antigo: o CHECK de restore nao pode recusar
# linhas de outros usuarios que ja estejam no banco de teste.
TODOS_OS_CODIGOS_E_O_ANTIGO = ", ".join(f"'{c}'" for c in (*Codigo, "tifa_partnership"))


@pytest.mark.parametrize("mais_antigo", ["tifa_partnership", "kairya_partnership"])
def test_o_downgrade_desfaz_o_par_mantendo_a_data_mais_antiga(
    banco_migrado: Engine, limpar_usuario: None, mais_antigo: str
) -> None:
    cfg = alembic_config()
    with banco_migrado.begin() as conexao:
        _semear(conexao, origem="kairya", codigo="kairya_partnership")
        conexao.execute(
            text(
                "UPDATE user_achievements SET unlocked_at = :em "
                "WHERE user_id = :u AND code = 'kairya_partnership'"
            ),
            {
                "u": SO_DA_0008,
                "em": ANTES if mais_antigo == "kairya_partnership" else AGORA,
            },
        )
        _segunda_do_par(
            conexao,
            "tifa_partnership",
            ANTES if mais_antigo == "tifa_partnership" else AGORA,
        )

    command.downgrade(cfg, _anterior_a_0008())
    assert _par_de_conquistas(banco_migrado) == [("tifa_partnership", ANTES)]

    command.upgrade(cfg, REVISAO)
    assert _par_de_conquistas(banco_migrado) == [("kairya_partnership", ANTES)]


def _par_com_a_fonte_do_xp(banco: Engine) -> list[tuple[str, datetime, str]]:
    """O par com a fonte do lancamento ligado: no empate de data, e o que
    distingue qual das duas linhas ficou."""
    with banco.connect() as conexao:
        return [
            (str(codigo), quando, str(fonte))
            for codigo, quando, fonte in conexao.execute(
                text(
                    "SELECT a.code, a.unlocked_at, x.source FROM user_achievements a "
                    "JOIN xp_entries x ON x.id = a.xp_entry_id "
                    "WHERE a.user_id = :u AND a.code IN "
                    "('tifa_partnership', 'kairya_partnership') ORDER BY a.code"
                ),
                {"u": SO_DA_0008},
            )
        ]


def test_no_empate_de_data_fica_a_linha_de_menor_codigo(
    banco_migrado: Engine, limpar_usuario: None
) -> None:
    """Mesmo `unlocked_at`: o desempate e o codigo, e `kairya_partnership` <
    `tifa_partnership`. Cada linha aponta para um lancamento de fonte diferente,
    para saber qual sobreviveu."""
    cfg = alembic_config()
    with banco_migrado.begin() as conexao:
        _semear(conexao, origem="kairya", codigo="kairya_partnership")
        bonus = conexao.execute(
            text(
                "INSERT INTO xp_entries (user_id, mission_id, amount, source, "
                "credited_at) SELECT user_id, mission_id, 5, 'evaluation_bonus', "
                "credited_at FROM xp_entries WHERE user_id = :u RETURNING id"
            ),
            {"u": SO_DA_0008},
        ).scalar_one()
        conexao.execute(
            text(
                "INSERT INTO user_achievements (user_id, code, unlocked_at, "
                "xp_entry_id) VALUES (:u, 'tifa_partnership', :em, :e)"
            ),
            {"u": SO_DA_0008, "em": AGORA, "e": bonus},
        )

    command.downgrade(cfg, _anterior_a_0008())
    assert _par_com_a_fonte_do_xp(banco_migrado) == [
        ("tifa_partnership", AGORA, "mission_completed")
    ]

    command.upgrade(cfg, REVISAO)
    assert _par_com_a_fonte_do_xp(banco_migrado) == [
        ("kairya_partnership", AGORA, "mission_completed")
    ]


def test_o_upgrade_desfaz_o_par_de_um_restore_so_de_dados(
    banco_migrado: Engine, limpar_usuario: None
) -> None:
    """Na 0007 o CHECK recusa o codigo novo; o restore so de dados e simulado
    com o CHECK ja expandido sobre a 0007, que a 0008 recria pelo nome."""
    cfg = alembic_config()
    command.downgrade(cfg, _anterior_a_0008())
    with banco_migrado.begin() as conexao:
        conexao.execute(
            text(f"ALTER TABLE user_achievements DROP CONSTRAINT {CHECK_DO_CODIGO}")
        )
        conexao.execute(
            text(
                f"ALTER TABLE user_achievements ADD CONSTRAINT {CHECK_DO_CODIGO} "
                f"CHECK (code IN ({TODOS_OS_CODIGOS_E_O_ANTIGO}))"
            )
        )
        _semear(conexao, origem="tifa", codigo="tifa_partnership")
        _segunda_do_par(conexao, "kairya_partnership", ANTES)

    command.upgrade(cfg, REVISAO)
    assert _par_de_conquistas(banco_migrado) == [("kairya_partnership", ANTES)]
    assert _antigos_no_banco(banco_migrado) == 0


def test_o_check_da_0007_volta_a_recusar_o_valor_novo(
    banco_migrado: Engine, limpar_usuario: None
) -> None:
    """Prova que o downgrade restaurou o CHECK da 0007 de verdade, pelo nome."""
    command.downgrade(alembic_config(), _anterior_a_0008())
    with pytest.raises(IntegrityError) as erro, banco_migrado.begin() as conexao:
        _semear(conexao, origem="kairya", codigo="first_steps")
    assert CHECK_DA_ORIGEM in str(erro.value.orig)


@pytest.mark.parametrize(
    ("origem", "codigo", "restricao"),
    [
        ("sistema", "first_steps", CHECK_DA_ORIGEM),
        ("usuario", "secreta", CHECK_DO_CODIGO),
    ],
)
def test_o_check_expandido_continua_fechado(
    banco_migrado: Engine,
    limpar_usuario: None,
    origem: str,
    codigo: str,
    restricao: str,
) -> None:
    with pytest.raises(IntegrityError) as erro, banco_migrado.begin() as conexao:
        _semear(conexao, origem=origem, codigo=codigo)
    assert restricao in str(erro.value.orig)


# ---------------------------------------------------------------------------
# O modelo descreve o CHECK expandido que a 0008 criou. Mesmo principio de
# `test_missions_models.py` (o PostgreSQL compara as duas definicoes pelo
# mesmo parser), com uma tabela temporaria de uma coluna: o espelho da tabela
# inteira colidiria com o indice de `pk_user_achievements`.
# ---------------------------------------------------------------------------


def _check_do_modelo(tabela: Table, nome: str) -> CheckConstraint:
    (restricao,) = (
        c
        for c in tabela.constraints
        if isinstance(c, CheckConstraint) and c.name == nome
    )
    return restricao


@pytest.mark.parametrize(
    ("tabela", "coluna", "nome"),
    [
        (MissionReschedule.__table__, "origin", CHECK_DA_ORIGEM),
        (UserAchievement.__table__, "code", CHECK_DO_CODIGO),
    ],
)
def test_o_modelo_descreve_o_check_expandido(
    session: Session, tabela: Table, coluna: str, nome: str
) -> None:
    regra = _check_do_modelo(tabela, nome).sqltext
    espelho = f"espelho_{nome}"
    session.execute(
        text(
            f"CREATE TEMP TABLE {espelho} ({coluna} text, "
            f"CONSTRAINT {nome} CHECK ({regra}))"
        )
    )
    consulta = text(
        "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c "
        "WHERE c.conname = :nome AND c.conrelid = CAST(:t AS regclass)"
    )
    do_modelo = session.execute(consulta, {"nome": nome, "t": espelho}).scalar_one()
    do_banco = session.execute(consulta, {"nome": nome, "t": tabela.name}).scalar_one()
    assert do_modelo == do_banco


# ---------------------------------------------------------------------------
# Tolerant reader: o valor antigo, inserido por SQL (o CHECK expandido o
# aceita ate a 2.2), chega ao dominio e ao contrato ja normalizado.
# ---------------------------------------------------------------------------


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    """Cliente cuja requisicao usa a SESSAO DO TESTE (ver `test_missions_api.py`)."""
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_session, None)


# Usuario so dos testes de leitura, criado na sessao com rollback: nenhum
# resto commitado de outro teste lhe deixa a conquista nova ao lado da antiga.
SO_DA_LEITURA = 81


def _missao_com_valores_antigos(session: Session, user_id: int) -> Mission:
    """Uma missao com um reagendamento e uma conquista no valor antigo. Para o
    ESTUDANTE (a API so le o usuario unico), a sessao apaga antes, com
    rollback no fim, a conquista da tutora que um resto commitado deixasse."""
    if user_id == ESTUDANTE:
        session.execute(
            text(
                "DELETE FROM user_achievements WHERE user_id = :u AND code IN "
                "('tifa_partnership', 'kairya_partnership')"
            ),
            {"u": user_id},
        )
    else:
        session.add(User(id=user_id, display_name="So da leitura"))
        session.flush()
    missao = criar_missao(
        session,
        user_id=user_id,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina",
        difficulty=1,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=1),
    )
    session.execute(
        text(
            "INSERT INTO mission_operations (operation_id, mission_id, kind) "
            "VALUES ('op-antiga', :m, 'reschedule')"
        ),
        {"m": missao.id},
    )
    session.execute(
        text(
            "INSERT INTO mission_reschedules (mission_id, operation_id, "
            "previous_deadline, new_deadline, reason, origin, rescheduled_at) "
            "VALUES (:m, 'op-antiga', :antes, :depois, 'dificuldade', 'tifa', :em)"
        ),
        {
            "m": missao.id,
            "antes": AGORA + timedelta(days=1),
            "depois": AGORA + timedelta(days=2),
            "em": AGORA,
        },
    )
    entrada = session.execute(
        text(
            "INSERT INTO xp_entries (user_id, mission_id, amount, source, "
            "credited_at) VALUES (:u, :m, 20, 'mission_completed', :em) RETURNING id"
        ),
        {"u": user_id, "m": missao.id, "em": AGORA},
    ).scalar_one()
    session.execute(
        text(
            "INSERT INTO user_achievements (user_id, code, unlocked_at, xp_entry_id) "
            "VALUES (:u, 'tifa_partnership', :em, :e)"
        ),
        {"u": user_id, "em": AGORA, "e": entrada},
    )
    session.expire_all()
    return missao


def test_a_origem_antiga_chega_ao_dominio_normalizada(session: Session) -> None:
    missao = _missao_com_valores_antigos(session, SO_DA_LEITURA)
    (linha,) = missao.reschedules
    assert linha.origin is OrigemDoReagendamento.KAIRYA


def test_o_codigo_antigo_chega_ao_dominio_normalizado(session: Session) -> None:
    missao = _missao_com_valores_antigos(session, SO_DA_LEITURA)
    datas = {
        item.conquista.codigo: item.unlocked_at
        for item in ler_progresso(session, SO_DA_LEITURA).conquistas
    }
    assert datas[Codigo.KAIRYA_PARTNERSHIP] == AGORA
    recompensa = recompensa_da_missao(session, missao)
    assert [c.codigo for c in recompensa.achievements_unlocked] == [
        Codigo.KAIRYA_PARTNERSHIP
    ]


def test_a_api_publica_a_origem_antiga_como_kairya(
    client: TestClient, session: Session
) -> None:
    missao = _missao_com_valores_antigos(session, ESTUDANTE)
    corpo = next(m for m in client.get("/api/missions").json() if m["id"] == missao.id)
    assert [r["origin"] for r in corpo["reschedules"]] == ["kairya"]


def test_a_api_publica_o_codigo_antigo_como_kairya_partnership(
    client: TestClient, session: Session
) -> None:
    _missao_com_valores_antigos(session, ESTUDANTE)
    conquistas = {
        item["code"]: item["unlocked_at"]
        for item in client.get("/api/progress").json()["achievements"]
    }
    assert "tifa_partnership" not in conquistas
    assert datetime.fromisoformat(conquistas["kairya_partnership"]) == AGORA
