"""Testes das guardas do `scripts/install-gitleaks.sh`.

Por que existem: o job `check-secrets` do CI passou a restaurar o `.tools/`
de um `actions/cache`, e o `scripts/check-push.sh` ja compartilhava o
`.tools/` do repositorio principal com os worktrees do pre-push. Os dois
caches so sao seguros por causa de UMA guarda do script: um binario que ja
esta no diretorio so e aceito se o hash SHA-256 dele conferir com o esperado.
Nesta base toda guarda precisa de um teste que a faca dizer nao -- e ate aqui
esta nao tinha nenhum.

A segunda guarda e a do download: o script ganhou novas tentativas no `curl`
(o PR #5 reprovou por uma queda de rede do GitHub), e nova tentativa nao pode
virar sucesso. Esgotado o `curl`, o script tem de reprovar.

Nenhum destes testes vai a rede. O `curl` do PATH e falso: registra os
argumentos recebidos, deixa um marcador e sai com 35 -- o codigo do
`SSL_ERROR_SYSCALL` medido no CI. O diretorio de ferramentas e um temporario,
apontado pelo `FQ_TOOLS_DIR` que o proprio script ja aceita, para que o
`.tools/` de verdade nunca seja tocado.

Sao testes de processo, nao de banco. Moram em `integration/` pelo mesmo
motivo de `test_push_env.py` e `test_e2e_env.py`: executam o script de
verdade, com o ambiente de verdade.
"""

import os
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "install-gitleaks.sh"

# O codigo com que o curl reprovou no CI do PR #5.
SAIDA_DO_CURL = 35


def _rodar(
    tmp_path: Path, diretorio_de_ferramentas: Path
) -> subprocess.CompletedProcess[str]:
    """Executa o script com um `curl` falso que sempre falha."""
    bin_falso = tmp_path / "bin"
    bin_falso.mkdir()
    curl_falso = bin_falso / "curl"
    curl_falso.write_text(
        "#!/bin/sh\n"
        f'printf "%s\\n" "$@" > "{tmp_path / "curl-args"}"\n'
        f"exit {SAIDA_DO_CURL}\n"
    )
    curl_falso.chmod(0o755)

    return subprocess.run(
        [str(SCRIPT)],
        capture_output=True,
        text=True,
        check=False,
        env=os.environ
        | {
            "PATH": f"{bin_falso}{os.pathsep}{os.environ['PATH']}",
            "FQ_TOOLS_DIR": str(diretorio_de_ferramentas),
        },
    )


def test_recusa_binario_em_cache_com_hash_errado(tmp_path: Path) -> None:
    """A guarda do cache diz NAO: um binario forjado nao e aceito.

    O binario plantado e executavel, esta no lugar certo e tem o nome certo --
    so o hash nao confere. Sem a guarda, o script sairia com 0 sem tocar na
    rede, e o `make check-secrets` executaria o binario forjado. Com ela, o
    script descarta o que achou e vai baixar; como o download falha, reprova.

    O que discrimina e o marcador do `curl`: ele so existe se o script tentou
    baixar, ou seja, se recusou o binario do cache.
    """
    ferramentas = tmp_path / "tools"
    ferramentas.mkdir()
    forjado = ferramentas / "gitleaks"
    forjado.write_text("#!/bin/sh\necho FORJADO\nexit 0\n")
    forjado.chmod(0o755)

    resultado = _rodar(tmp_path, ferramentas)

    assert (tmp_path / "curl-args").exists(), "o binario forjado foi aceito do cache"
    assert resultado.returncode == SAIDA_DO_CURL
    assert "instalado" not in resultado.stdout


def test_download_que_falha_reprova_mesmo_com_novas_tentativas(tmp_path: Path) -> None:
    """Esgotado o `curl`, o script reprova com o codigo dele e nao instala nada.

    E a prova de que a nova tentativa nao virou `|| true`: o codigo de saida
    do script e o do `curl`, nenhum binario aparece no diretorio e a mensagem
    de sucesso nao e impressa.
    """
    ferramentas = tmp_path / "tools"

    resultado = _rodar(tmp_path, ferramentas)

    assert resultado.returncode == SAIDA_DO_CURL
    assert not (ferramentas / "gitleaks").exists()
    assert "instalado" not in resultado.stdout


def test_curl_repete_tambem_erro_de_conexao(tmp_path: Path) -> None:
    """O `curl` recebe `--retry` E `--retry-all-errors`.

    `--retry` sozinho nao repete o erro 35 de handshake TLS que reprovou o CI
    -- so timeout e HTTP 408/429/5xx. Sem `--retry-all-errors` a nova
    tentativa existiria no papel e nao cobriria o caso medido.
    """
    resultado = _rodar(tmp_path, tmp_path / "tools")

    assert resultado.returncode == SAIDA_DO_CURL
    argumentos = (tmp_path / "curl-args").read_text().splitlines()
    assert "--retry-all-errors" in argumentos
    assert "--retry" in argumentos
    assert "--fail" in argumentos
