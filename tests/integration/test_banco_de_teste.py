"""O recomeco do esquema de teste: a guarda diz nao ANTES do DROP."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import Engine, inspect, text

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url

from .banco_de_teste import recriar_esquema
from .conftest import alembic_config

RAIZ = Path(__file__).resolve().parents[2]


def test_recriar_esquema_recusa_o_banco_de_desenvolvimento(settings: Settings) -> None:
    """A guarda so le `engine.url` -- o banco de desenvolvimento nunca e tocado."""
    engine = create_engine_from_url(settings.database_url)
    try:
        with pytest.raises(RuntimeError, match="recusando rodar teste destrutivo"):
            recriar_esquema(engine)
    finally:
        engine.dispose()


def test_recriar_esquema_apaga_tudo_do_banco_de_teste(banco_migrado: Engine) -> None:
    with banco_migrado.begin() as conexao:
        conexao.execute(text("CREATE TABLE sobra_de_execucao (id int)"))
    try:
        recriar_esquema(banco_migrado)
        assert inspect(banco_migrado).get_table_names() == []
    finally:
        command.upgrade(alembic_config(), "head")


def test_o_modulo_como_comando_recusa_o_banco_errado(settings: Settings) -> None:
    """O caminho do `make reset-test-db`: com a variavel de teste apontada para o
    banco de desenvolvimento, o comando sai com erro e sem DROP."""
    ambiente = {
        **os.environ,
        "PYTHONPATH": "tests",
        "FOCUSQUEST_TEST_DATABASE_URL": settings.database_url,
    }
    resultado = subprocess.run(
        [sys.executable, "-m", "integration.banco_de_teste"],
        cwd=RAIZ,
        env=ambiente,
        capture_output=True,
        text=True,
        check=False,
    )
    assert resultado.returncode != 0
    assert "termine em '_test'" in resultado.stderr
