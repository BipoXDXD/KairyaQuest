"""A migracao 0007: o modelo substituto que serviu a resposta (pendencia 174).

Mesmo padrao de `test_acompanhamento_migration.py`: o `finally` sempre devolve
o esquema para `head`, e a restricao nova e vista dizendo nao pelo nome.
"""

from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect

from .conftest import alembic_config

REVISAO = "0007"


def _anterior_a_0007() -> str:
    script = ScriptDirectory.from_config(alembic_config())
    anterior = script.get_revision(REVISAO)
    assert anterior is not None
    assert isinstance(anterior.down_revision, str)
    return anterior.down_revision


def _colunas(banco: Engine) -> dict[str, bool]:
    """As colunas de `tutor_messages`, com o `nullable` de cada uma."""
    return {
        coluna["name"]: coluna["nullable"]
        for coluna in inspect(banco).get_columns("tutor_messages")
    }


def _checks(banco: Engine) -> set[str]:
    return {
        str(c["name"]) for c in inspect(banco).get_check_constraints("tutor_messages")
    }


def test_a_0007_encadeia_na_0006(banco_migrado: Engine) -> None:
    assert _anterior_a_0007() == "0006"


def test_a_0007_cria_a_coluna_nula_e_o_check(banco_migrado: Engine) -> None:
    assert _colunas(banco_migrado)["fallback_model"] is True
    assert "ck_tutor_messages_fallback_so_da_tutora" in _checks(banco_migrado)


def test_o_downgrade_da_0007_leva_so_a_coluna(banco_migrado: Engine) -> None:
    cfg = alembic_config()
    antes = _colunas(banco_migrado)
    try:
        command.downgrade(cfg, _anterior_a_0007())
        depois = _colunas(banco_migrado)
        assert set(antes) - set(depois) == {"fallback_model"}
        assert "ck_tutor_messages_fallback_so_da_tutora" not in _checks(banco_migrado)
        command.upgrade(cfg, REVISAO)
        assert _colunas(banco_migrado) == antes
    finally:
        command.upgrade(cfg, "head")
