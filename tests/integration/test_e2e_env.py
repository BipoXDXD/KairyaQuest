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

import pytest

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


FALSO_LOCAL = "http://127.0.0.1:8150"


@pytest.mark.parametrize(
    "url",
    [
        "https://api.anthropic.com",
        "https://api.anthropic.com.",
        "http://127.0.0.1.nip.io:8150",
        # O host de uma URL com credencial e o que vem DEPOIS do `@`.
        "http://127.0.0.1@api.anthropic.com",
        "http://192.168.0.10:8150",
    ],
)
def test_recusa_provedor_fora_do_loopback(url: str) -> None:
    """A guarda diz NAO, e a API do E2E nem sobe.

    E uma lista de PERMISSAO (loopback), e nao a recusa de um nome. A chave
    real mora no Keychain do macOS, nunca no .env (D-a); a guarda protege
    contra uma chave posta no ambiente ou no .env por engano, e contra o
    `pre-push`, que exporta toda FOCUSQUEST_* do .env para o worktree do
    gate: com qualquer endereco de fora da maquina -- nao so o da Anthropic --
    essa chave e o gasto iriam para longe do teste.
    """
    resultado = _rodar(
        ["sh", "-c", "echo A GUARDA DEIXOU PASSAR"],
        {"FOCUSQUEST_ANTHROPIC_BASE_URL": url},
    )

    assert resultado.returncode != 0
    assert "recusando subir a API do E2E" in resultado.stderr
    assert "loopback" in resultado.stderr
    assert "A GUARDA DEIXOU PASSAR" not in resultado.stdout


def test_sem_o_endereco_do_falso_cai_no_padrao_e_e_recusado() -> None:
    """Sem `FOCUSQUEST_ANTHROPIC_BASE_URL` no ambiente, vale o .env ou o padrao
    do `Settings` -- `https://api.anthropic.com` -- e a guarda recusa.

    PREMISSA: o `.env` local nao aponta a base URL para loopback (o
    `.env.example` traz `https://api.anthropic.com`, e no CI nao ha `.env`).
    Um `.env` com `FOCUSQUEST_ANTHROPIC_BASE_URL=http://127.0.0.1:...` faria
    este teste reprovar -- e ai e o `.env` que esta fora do combinado.
    """
    ambiente = {
        k: v for k, v in os.environ.items() if k != "FOCUSQUEST_ANTHROPIC_BASE_URL"
    }
    resultado = subprocess.run(
        [str(SCRIPT), "sh", "-c", "echo A GUARDA DEIXOU PASSAR"],
        capture_output=True,
        text=True,
        check=False,
        env=ambiente,
    )
    assert resultado.returncode != 0
    assert "loopback" in resultado.stderr
    assert "A GUARDA DEIXOU PASSAR" not in resultado.stdout


@pytest.mark.parametrize(
    "url", [FALSO_LOCAL, "http://localhost:8150", "http://[::1]:8150"]
)
def test_aceita_o_falso_local(url: str) -> None:
    resultado = _rodar(
        ["printenv", "FOCUSQUEST_ANTHROPIC_BASE_URL"],
        {"FOCUSQUEST_ANTHROPIC_BASE_URL": url},
    )
    assert resultado.returncode == 0, resultado.stderr
    assert resultado.stdout.strip() == url


def test_impoe_a_chave_ficticia_mesmo_com_uma_chave_no_ambiente() -> None:
    """A chave real mora no Keychain (D-a), mas uma posta por engano no
    ambiente ou no .env chegaria ao E2E -- tambem pelo `pre-push`, que exporta
    toda FOCUSQUEST_* do .env. O script a SUBSTITUI."""
    resultado = _rodar(
        ["printenv", "FOCUSQUEST_ANTHROPIC_API_KEY"],
        {
            "FOCUSQUEST_ANTHROPIC_BASE_URL": FALSO_LOCAL,
            "FOCUSQUEST_ANTHROPIC_API_KEY": "sk-ant-api03-parece-de-verdade",
        },
    )
    assert resultado.returncode == 0, resultado.stderr
    assert resultado.stdout.strip() == "e2e-chave-ficticia"
