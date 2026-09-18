"""A migracao precisa aplicar em banco VAZIO (README s10)."""

from argparse import Namespace

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import IntegrityError


def _alembic_config() -> Config:
    """Configuracao do Alembic apontada para o banco de TESTE.

    `cmd_opts` e o mesmo objeto que a linha de comando preenche: e dali que
    `context.get_x_argument()` le o `-x`. Passar um Namespace no construtor,
    em vez de remendar o atributo depois, e o caminho tipado -- o campo ja e
    declarado como `Namespace | None`, entao nao ha `type: ignore` nenhum.
    Sem esse `x`, o env.py cairia no banco de DESENVOLVIMENTO, e o
    `DROP SCHEMA` abaixo destruiria dados reais.
    """
    return Config("alembic.ini", cmd_opts=Namespace(x=["test=true"]))


@pytest.fixture(scope="module")
def banco_migrado(engine: Engine) -> Engine:
    """Banco de teste zerado e migrado do zero.

    Esta fixture existe para que os tres testes nao dependam da ordem em que
    o pytest os executa: cada um declara o estado de que precisa, em vez de
    torcer para o primeiro teste ter rodado antes. Custa uma migracao por
    modulo, nao por teste, porque o escopo e `module`.
    """
    with engine.begin() as conexao:
        conexao.execute(text("DROP SCHEMA public CASCADE"))
        conexao.execute(text("CREATE SCHEMA public"))

    command.upgrade(_alembic_config(), "head")
    return engine


def test_migracao_aplica_em_banco_vazio(banco_migrado: Engine) -> None:
    tabelas = set(inspect(banco_migrado).get_table_names())
    assert {"users", "missions", "mission_operations", "alembic_version"} <= tabelas


def test_migracao_cria_o_usuario_unico(banco_migrado: Engine) -> None:
    with banco_migrado.connect() as conexao:
        total = conexao.execute(text("SELECT count(*) FROM users")).scalar_one()
    assert total == 1


def test_check_de_estado_rejeita_valor_invalido(banco_migrado: Engine) -> None:
    """Prova que a restricao vive no BANCO, e nao so no Python: este INSERT
    nao passa pelo dominio, e um UPDATE direto no psql seria rejeitado
    igual."""
    with pytest.raises(IntegrityError), banco_migrado.begin() as conexao:
        conexao.execute(
            text(
                "INSERT INTO missions "
                "(user_id, instructions, completion_criterion, difficulty, "
                " estimated_minutes, deadline, state) VALUES "
                "(1, 'x', 'y', 1, 30, now(), 'estado_invalido')"
            )
        )
