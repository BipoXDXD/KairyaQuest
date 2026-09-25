"""O recomeco do esquema de teste: a guarda diz nao ANTES do DROP."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import Engine, inspect, text

from focusquest.core.database import create_engine_from_url

from .banco_de_teste import recriar_esquema
from .conftest import alembic_config

RAIZ = Path(__file__).resolve().parents[2]


def test_recriar_esquema_recusa_o_banco_de_desenvolvimento() -> None:
    """A guarda so le `engine.url`, sem abrir conexao -- nao precisa do banco de
    desenvolvimento real para provar isso, e usa-lo seria arriscado: se a guarda
    regredir, este teste faria o DROP no banco de dev de verdade. Por isso o alvo
    e uma URL que nao termina em `_test` e aponta para a porta 9, fechada nesta
    maquina (nenhum servico escuta ai) -- com a guarda, a condicao 1 recusa por
    comparacao de string, antes de qualquer tentativa de conexao; sem ela, o
    proprio teste provaria o perigo com um OperationalError, nunca com um DROP."""
    engine = create_engine_from_url("postgresql+psycopg://x:x@127.0.0.1:9/focusquest")
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


def test_o_modulo_como_comando_recusa_o_banco_errado() -> None:
    """O caminho do `make reset-test-db`: com a variavel de teste apontada para um
    nome que nao termina em `_test`, o comando sai com erro e sem DROP. A URL usa
    a porta 9, fechada nesta maquina, para que uma guarda ausente prove o perigo
    com um OperationalError, nunca com um DROP num banco real."""
    ambiente = {
        **os.environ,
        "PYTHONPATH": "tests",
        "FOCUSQUEST_TEST_DATABASE_URL": "postgresql+psycopg://x:x@127.0.0.1:9/focusquest",
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
