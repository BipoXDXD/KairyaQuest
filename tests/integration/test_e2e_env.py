"""Testes do `scripts/e2e-env.sh`, o script que aponta a API do E2E para o
banco de teste.

Por que estes testes existem: o script carrega uma GUARDA -- recusa subir a
API se o banco configurado nao tiver nome terminando em `_test` --, e nesta
base toda guarda precisa de um teste que a faca dizer nao. Sem ele, a guarda
poderia estar quebrada (uma comparacao invertida, um `case` que nunca casa) e
o unico sintoma seria o E2E escrevendo missoes no banco de DESENVOLVIMENTO,
em silencio, que e exatamente o que ela existe para impedir.

Sao testes de processo, nao de banco: nenhum dos dois abre conexao, e por isso
nenhum deles pede a fixture `banco_migrado`. Moram em `integration/` porque
executam o script de verdade, com o ambiente de verdade -- e nao um dublê
dele.
"""

import os
import subprocess
from pathlib import Path

from focusquest.core.config import Settings

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "e2e-env.sh"

# Um banco SEM o sufixo `_test`: o de desenvolvimento, que e justamente o erro
# de configuracao que a guarda precisa recusar.
URL_DE_DESENVOLVIMENTO = "postgresql+psycopg://focusquest:x@127.0.0.1:55432/focusquest"


def _rodar(
    comando: list[str], extra_env: dict[str, str]
) -> subprocess.CompletedProcess[str]:
    """Executa o script com o ambiente atual mais `extra_env`."""
    return subprocess.run(
        [str(SCRIPT), *comando],
        capture_output=True,
        text=True,
        check=False,
        env=os.environ | extra_env,
    )


def test_recusa_banco_sem_sufixo_de_teste() -> None:
    """A guarda diz NAO, e o comando recebido nem chega a rodar."""
    resultado = _rodar(
        ["sh", "-c", "echo A GUARDA DEIXOU PASSAR"],
        {"FOCUSQUEST_TEST_DATABASE_URL": URL_DE_DESENVOLVIMENTO},
    )

    assert resultado.returncode != 0
    assert "recusando subir a API do E2E" in resultado.stderr
    # O que mais importa: o comando NAO foi executado. Uma guarda que reprova
    # depois de deixar o processo subir nao e guarda, e autopsia.
    assert "A GUARDA DEIXOU PASSAR" not in resultado.stdout


def test_aponta_focusquest_database_url_para_o_banco_de_teste() -> None:
    """A guarda diz SIM: o processo filho recebe a URL do banco de TESTE.

    A comparacao e com `Settings().test_database_url` -- a mesma fonte que o
    script consulta --, e nao com uma URL escrita aqui: o teste confere que a
    variavel do FILHO passou a ser a de teste, nao qual banco esta configurado
    nesta maquina.
    """
    resultado = _rodar(["printenv", "FOCUSQUEST_DATABASE_URL"], {})

    assert resultado.returncode == 0, resultado.stderr
    assert resultado.stdout.strip() == Settings().test_database_url
