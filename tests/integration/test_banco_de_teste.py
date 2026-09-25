"""O recomeco do esquema de teste: a guarda diz nao ANTES do DROP."""

import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import Engine, inspect, make_url, text

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url

from .banco_de_teste import criar_banco_se_ausente, recriar_esquema
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


# ---------------------------------------------------------------------------
# Criacao sob demanda (pendencia 19): cada worktree tem o proprio banco de
# teste, e ele nasce no primeiro uso -- nao so no `init-test-db.sql` do volume.
# ---------------------------------------------------------------------------


def _existe(settings: Settings, nome: str) -> bool:
    """Consulta o `pg_database` pelo banco de MANUTENCAO do mesmo servidor."""
    manutencao = create_engine_from_url(
        make_url(settings.test_database_url)
        .set(database="postgres")
        .render_as_string(hide_password=False)
    )
    try:
        with manutencao.connect() as conexao:
            return (
                conexao.execute(
                    text("SELECT 1 FROM pg_database WHERE datname = :nome"),
                    {"nome": nome},
                ).first()
                is not None
            )
    finally:
        manutencao.dispose()


def _apagar_se_existir(settings: Settings, nome: str) -> None:
    """Limpeza do banco que o PROPRIO teste criou -- sempre um nome `_test`."""
    assert nome.endswith("_test")
    manutencao = create_engine_from_url(
        make_url(settings.test_database_url)
        .set(database="postgres")
        .render_as_string(hide_password=False)
    )
    try:
        with manutencao.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as conexao:
            conexao.execute(text(f'DROP DATABASE IF EXISTS "{nome}" WITH (FORCE)'))
    finally:
        manutencao.dispose()


@pytest.fixture
def banco_novo(settings: Settings) -> Iterator[tuple[str, str]]:
    """Um banco de teste que AINDA NAO EXISTE: nome e URL completa.

    O hifen no nome e de proposito: o `novo-worktree.sh` aceita `[a-z0-9-]`, e
    `CREATE DATABASE` com hifen so funciona com o identificador entre aspas.
    """
    nome = f"focusquest_criacao-{uuid4().hex[:8]}_test"
    url = (
        make_url(settings.test_database_url)
        .set(database=nome)
        .render_as_string(hide_password=False)
    )
    assert not _existe(settings, nome)
    try:
        yield nome, url
    finally:
        _apagar_se_existir(settings, nome)


def test_criar_banco_recusa_nome_sem_sufixo_antes_de_conectar(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Um nome sem `_test` NUNCA e criado. A configuracao aponta para o mesmo
    alvo (a condicao 1 aprovaria); a condicao 2, a do nome, recusa. A porta 9
    esta fechada: sem a guarda, o teste reprovaria com OperationalError ao
    tentar o banco de manutencao, nunca com um CREATE DATABASE de verdade."""
    url = "postgresql+psycopg://x:x@127.0.0.1:9/focusquest"
    monkeypatch.setenv("FOCUSQUEST_TEST_DATABASE_URL", url)
    engine = create_engine_from_url(url)
    try:
        with pytest.raises(RuntimeError, match="termine em '_test'"):
            criar_banco_se_ausente(engine)
    finally:
        engine.dispose()


def test_criar_banco_recusa_alvo_diferente_do_configurado() -> None:
    """A condicao 1 da mesma guarda: um `_test` em OUTRO servidor (porta 9) nao
    e o banco de teste configurado, e nao e criado."""
    engine = create_engine_from_url("postgresql+psycopg://x:x@127.0.0.1:9/outro_test")
    try:
        with pytest.raises(RuntimeError, match="nao e o banco de teste configurado"):
            criar_banco_se_ausente(engine)
    finally:
        engine.dispose()


def test_criar_banco_recusa_nome_que_o_postgresql_truncaria(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Acima de 63 bytes o PostgreSQL TRUNCA o identificador em silencio -- e o
    nome truncado deixaria de terminar em `_test`. Recusado antes de conectar."""
    nome = "focusquest_" + "x" * 50 + "_test"
    url = f"postgresql+psycopg://x:x@127.0.0.1:9/{nome}"
    monkeypatch.setenv("FOCUSQUEST_TEST_DATABASE_URL", url)
    engine = create_engine_from_url(url)
    try:
        with pytest.raises(RuntimeError, match="63 bytes"):
            criar_banco_se_ausente(engine)
    finally:
        engine.dispose()


def test_criar_banco_cria_o_que_falta_e_e_idempotente(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    banco_novo: tuple[str, str],
) -> None:
    nome, url = banco_novo
    monkeypatch.setenv("FOCUSQUEST_TEST_DATABASE_URL", url)
    engine = create_engine_from_url(url)
    try:
        criar_banco_se_ausente(engine)
        assert _existe(settings, nome)
        # A segunda chamada encontra o banco e nao faz nada -- sem erro de
        # "already exists".
        criar_banco_se_ausente(engine)
        with engine.connect() as conexao:
            assert conexao.execute(text("SELECT current_database()")).scalar_one() == (
                nome
            )
    finally:
        engine.dispose()


def _rodar(
    argumentos: list[str], url: str, **extra: str
) -> subprocess.CompletedProcess[str]:
    ambiente = {
        chave: valor
        for chave, valor in os.environ.items()
        if not chave.startswith("COV_CORE")
    }
    return subprocess.run(
        [sys.executable, *argumentos],
        cwd=RAIZ,
        env=ambiente
        | {"PYTHONPATH": "tests", "FOCUSQUEST_TEST_DATABASE_URL": url}
        | extra,
        capture_output=True,
        text=True,
        check=False,
    )


def test_o_modulo_como_comando_cria_o_banco_que_falta(
    settings: Settings, banco_novo: tuple[str, str]
) -> None:
    """O caminho do `make reset-test-db` num worktree novo: o banco ainda nao
    existe, e o comando o cria antes de recriar o esquema."""
    nome, url = banco_novo
    resultado = _rodar(["-m", "integration.banco_de_teste"], url)
    assert resultado.returncode == 0, resultado.stderr
    assert _existe(settings, nome)


def test_a_suite_roda_contra_um_banco_que_ainda_nao_existe(
    settings: Settings, banco_novo: tuple[str, str]
) -> None:
    """A fixture do pytest cria o banco sob demanda: no `make check` o
    `check-api` roda ANTES do `check-e2e` (e do `reset-test-db` dele), e o
    worktree do pre-push comeca sempre com um banco novo. Um pytest aninhado,
    so com um teste que conecta pela fixture `engine` -- sem `banco_migrado`,
    que e o caminho mais estreito.
    """
    nome, url = banco_novo
    resultado = _rodar(
        [
            "-m",
            "pytest",
            "tests/integration/test_health.py::test_ready_confirma_o_banco",
            "-p",
            "no:cacheprovider",
            "--no-cov",
        ],
        url,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert "1 passed" in resultado.stdout
    assert _existe(settings, nome)
