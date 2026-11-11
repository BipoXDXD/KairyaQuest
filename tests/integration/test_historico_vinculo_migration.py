"""A migracao 0010: o elo do historico de reagendamentos prova missao e tipo.

Pendencia 165. Antes, `mission_reschedules.operation_id` apontava so para
`mission_operations.operation_id`: o banco aceitava uma linha de reagendamento
amarrada a uma operacao `complete` ou a uma operacao de OUTRA missao. Agora a FK
e composta (operation_id, mission_id, operation_kind) e `operation_kind` so
aceita `reschedule`.

Mesmo padrao de `test_acompanhamento_migration.py`: o `finally` sempre devolve o
esquema para `head`, e cada recusa e vista pelo NOME da restricao, por `INSERT` cru.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, delete, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.models import Mission
from focusquest.modules.missions.service import criar_missao

from .conftest import alembic_config

ESTUDANTE = 1
REVISAO = "0010"
AGORA = datetime(2026, 11, 11, 15, tzinfo=UTC)
FK_DO_ELO = "fk_mission_reschedules_operacao"
CHECK_DO_TIPO = "ck_mission_reschedules_operation_kind"
FK_ANTIGA = "mission_reschedules_operation_id_fkey"


def _anterior_a_0010() -> str:
    script = ScriptDirectory.from_config(alembic_config())
    anterior = script.get_revision(REVISAO)
    assert anterior is not None
    assert isinstance(anterior.down_revision, str)
    return anterior.down_revision


def _missao(session: Session, instrucoes: str = "Ler o capitulo 3") -> int:
    missao = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions=instrucoes,
        completion_criterion="Resumo de uma pagina",
        difficulty=3,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=1),
    )
    return missao.id


def _operacao(session: Session, mission_id: int, chave: str, kind: str) -> None:
    session.execute(
        text(
            "INSERT INTO mission_operations (operation_id, mission_id, kind) "
            "VALUES (:o, :m, :k)"
        ),
        {"o": chave, "m": mission_id, "k": kind},
    )


INSERIR = (
    "INSERT INTO mission_reschedules (mission_id, operation_id, {extra}"
    "previous_deadline, new_deadline, reason, origin, rescheduled_at) "
    "VALUES (:m, :o, {valor}:antes, :depois, 'falta_de_tempo', 'usuario', :em)"
)
INSERIR_SEM_TIPO = text(INSERIR.format(extra="", valor=""))
INSERIR_COM_TIPO = text(INSERIR.format(extra="operation_kind, ", valor=":tipo, "))


def _campos(mission_id: int, chave: str, **ajustes: object) -> dict[str, object]:
    campos: dict[str, object] = {
        "m": mission_id,
        "o": chave,
        "antes": AGORA + timedelta(days=1),
        "depois": AGORA + timedelta(days=3),
        "em": AGORA,
    }
    campos.update(ajustes)
    return campos


def test_a_0010_encadeia_na_0009(banco_migrado: Engine) -> None:
    assert _anterior_a_0010() == "0009"


def test_o_elo_consistente_entra_e_o_tipo_nasce_reschedule(session: Session) -> None:
    mission_id = _missao(session)
    _operacao(session, mission_id, "op-h-ok", "reschedule")
    session.execute(INSERIR_SEM_TIPO, _campos(mission_id, "op-h-ok"))
    tipo = session.execute(
        text(
            "SELECT operation_kind FROM mission_reschedules "
            "WHERE operation_id = 'op-h-ok'"
        )
    ).scalar_one()
    assert tipo == "reschedule"


@pytest.mark.parametrize("kind", ["complete", "start"])
def test_o_banco_recusa_o_historico_ligado_a_operacao_de_outro_tipo(
    session: Session, kind: str
) -> None:
    mission_id = _missao(session)
    _operacao(session, mission_id, f"op-h-{kind}", kind)
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(INSERIR_SEM_TIPO, _campos(mission_id, f"op-h-{kind}"))
    assert FK_DO_ELO in str(erro.value.orig)


def test_o_banco_recusa_o_historico_ligado_a_operacao_de_outra_missao(
    session: Session,
) -> None:
    dona = _missao(session, "Missao dona da operacao")
    outra = _missao(session, "Missao que nao e dona")
    _operacao(session, dona, "op-h-alheia", "reschedule")
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(INSERIR_SEM_TIPO, _campos(outra, "op-h-alheia"))
    assert FK_DO_ELO in str(erro.value.orig)


def test_o_banco_recusa_um_tipo_do_elo_que_nao_seja_reschedule(
    session: Session,
) -> None:
    mission_id = _missao(session)
    _operacao(session, mission_id, "op-h-tipo", "complete")
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(
            INSERIR_COM_TIPO, _campos(mission_id, "op-h-tipo", tipo="complete")
        )
    assert CHECK_DO_TIPO in str(erro.value.orig)


def test_a_fk_composta_substituiu_a_simples_e_apaga_em_cascata(
    banco_migrado: Engine,
) -> None:
    with banco_migrado.connect() as conexao:
        fks = {
            fk["name"]: fk
            for fk in inspect(conexao).get_foreign_keys("mission_reschedules")
        }
    assert FK_ANTIGA not in fks
    elo = fks[FK_DO_ELO]
    assert elo["constrained_columns"] == [
        "operation_id",
        "mission_id",
        "operation_kind",
    ]
    assert elo["referred_table"] == "mission_operations"
    assert elo["referred_columns"] == ["operation_id", "mission_id", "kind"]
    assert elo["options"]["ondelete"] == "CASCADE"


def test_apagar_a_operacao_leva_o_historico_dela(session: Session) -> None:
    mission_id = _missao(session)
    _operacao(session, mission_id, "op-h-cascata", "reschedule")
    session.execute(INSERIR_SEM_TIPO, _campos(mission_id, "op-h-cascata"))
    session.execute(
        text("DELETE FROM mission_operations WHERE operation_id = 'op-h-cascata'")
    )
    restantes = session.execute(
        text("SELECT count(*) FROM mission_reschedules WHERE mission_id = :m"),
        {"m": mission_id},
    ).scalar_one()
    assert restantes == 0


@pytest.fixture
def historico_legado_inconsistente(banco_migrado: Engine) -> Iterator[int]:
    """Na 0009 (FK simples), um reagendamento amarrado a uma operacao `complete`."""
    cfg = alembic_config()
    command.downgrade(cfg, _anterior_a_0010())
    with Session(bind=banco_migrado) as sessao:
        mission_id = _missao(sessao)
        _operacao(sessao, mission_id, "op-h-legado", "complete")
        sessao.execute(
            text(
                "INSERT INTO mission_reschedules (mission_id, operation_id, "
                "previous_deadline, new_deadline, reason, origin, rescheduled_at) "
                "VALUES (:m, 'op-h-legado', :antes, :depois, 'falta_de_tempo', "
                "'usuario', :em)"
            ),
            _campos(mission_id, "op-h-legado"),
        )
        sessao.commit()
    try:
        yield mission_id
    finally:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(delete(Mission).where(Mission.id == mission_id))
            sessao.commit()
        command.upgrade(cfg, "head")


def test_o_upgrade_falha_alto_com_historico_inconsistente_e_nada_muda(
    banco_migrado: Engine, historico_legado_inconsistente: int
) -> None:
    cfg = alembic_config()
    with pytest.raises(RuntimeError, match="op-h-legado"):
        command.upgrade(cfg, REVISAO)
    with banco_migrado.connect() as conexao:
        versao = conexao.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()
        colunas = {
            c["name"] for c in inspect(conexao).get_columns("mission_reschedules")
        }
    assert versao == _anterior_a_0010()
    assert "operation_kind" not in colunas


def test_o_downgrade_devolve_a_fk_simples_e_guarda_o_historico(
    banco_migrado: Engine,
) -> None:
    cfg = alembic_config()
    with Session(bind=banco_migrado) as sessao:
        mission_id = _missao(sessao)
        _operacao(sessao, mission_id, "op-h-desce", "reschedule")
        sessao.execute(INSERIR_SEM_TIPO, _campos(mission_id, "op-h-desce"))
        sessao.commit()
    try:
        command.downgrade(cfg, _anterior_a_0010())
        with banco_migrado.connect() as conexao:
            inspector = inspect(conexao)
            fks = {
                fk["name"] for fk in inspector.get_foreign_keys("mission_reschedules")
            }
            colunas = {c["name"] for c in inspector.get_columns("mission_reschedules")}
            uniques = {
                u["name"]
                for u in inspector.get_unique_constraints("mission_operations")
            }
            linhas = conexao.execute(
                text(
                    "SELECT count(*) FROM mission_reschedules "
                    "WHERE operation_id = 'op-h-desce'"
                )
            ).scalar_one()
        assert FK_ANTIGA in fks
        assert FK_DO_ELO not in fks
        assert "operation_kind" not in colunas
        assert "uq_mission_operations_vinculo" not in uniques
        assert linhas == 1
    finally:
        command.upgrade(cfg, "head")
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(delete(Mission).where(Mission.id == mission_id))
            sessao.commit()
