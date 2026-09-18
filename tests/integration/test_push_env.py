"""Testes da guarda de `.env` do `scripts/check-push.sh`.

Por que existem: o `pre-push` le o `.env` do repositorio principal e exporta
para o worktree de validacao so as linhas `FOCUSQUEST_*`, recusando o push se
faltar configuracao. E uma GUARDA, e nesta base toda guarda precisa de um teste
que a faca dizer nao. Ate aqui ela so tinha sido provada por um harness manual
numa sessao de agente -- e uma prova que so existiu numa sessao nao e teste, e
memoria.

O mecanismo mora em `scripts/push-env.sh`, extraido do `check-push.sh` para
poder ser exercitado SEM disparar `git push` e SEM criar worktree: os testes
carregam a biblioteca com as mesmas opcoes de shell do `check-push.sh`
(`set -euo pipefail`) e chamam a MESMA funcao que ele chama. O ultimo teste
fecha a outra ponta: prova que o `check-push.sh` de fato passa pela funcao,
rodando uma copia dele num diretorio sem `.env` -- com um `git` falso no PATH
que denuncia qualquer chamada, para que "nao cria worktree" seja estrutural e
nao promessa.

O ambiente do processo filho e montado SEM nenhuma `FOCUSQUEST_*` herdada: no
CI essas variaveis estao exportadas no job, e uma herdada satisfaria a guarda
sem que o `.env` do teste tivesse nada a ver com isso.

Sao testes de processo, nao de banco -- nenhum abre conexao. Moram em
`integration/` pelo mesmo motivo de `test_e2e_env.py`: executam o script de
verdade, com o ambiente de verdade.
"""

import os
import shutil
import subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
BIBLIOTECA = RAIZ / "scripts" / "push-env.sh"
CHECK_PUSH = RAIZ / "scripts" / "check-push.sh"

# Os mesmos valores do `.env.example`: nenhum destes testes conecta em nada, e
# eles so precisam ser nao vazios.
URL_DEV = "postgresql+psycopg://focusquest:focusquest_local@127.0.0.1:55432/focusquest"
URL_TESTE = (
    "postgresql+psycopg://focusquest:focusquest_local@127.0.0.1:55432/focusquest_test"
)
CONFIG_COMPLETA = (
    f"FOCUSQUEST_DATABASE_URL={URL_DEV}\nFOCUSQUEST_TEST_DATABASE_URL={URL_TESTE}\n"
)

# Carrega a biblioteca como o `check-push.sh` a carrega e, se a funcao nao
# recusar, executa o comando recebido -- que e como o teste le o que foi
# exportado.
HARNESS = 'set -euo pipefail; . "$1"; exportar_env_focusquest "$2"; shift 2; exec "$@"'


def _ambiente_sem_focusquest(**extra: str) -> dict[str, str]:
    ambiente = {
        chave: valor
        for chave, valor in os.environ.items()
        if not chave.startswith("FOCUSQUEST_")
    }
    return ambiente | extra


def _carregar(
    arquivo_env: Path, comando: list[str], **extra: str
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", "-c", HARNESS, "harness", str(BIBLIOTECA), str(arquivo_env), *comando],
        capture_output=True,
        text=True,
        check=False,
        env=_ambiente_sem_focusquest(**extra),
    )


def test_recusa_quando_falta_variavel_e_nomeia_a_que_falta(tmp_path: Path) -> None:
    """A guarda diz NAO, nomeia exatamente o que falta, e nada depois dela roda."""
    arquivo_env = tmp_path / ".env"
    arquivo_env.write_text(f"FOCUSQUEST_DATABASE_URL={URL_DEV}\n")

    resultado = _carregar(arquivo_env, ["echo", "A GUARDA DEIXOU PASSAR"])

    assert resultado.returncode != 0
    # A linha que nomeia: a variavel ausente esta nela, a presente nao. Uma
    # mensagem que listasse as duas sempre -- ou nenhuma -- reprovaria aqui.
    linha = next(
        linha
        for linha in resultado.stderr.splitlines()
        if "variaveis obrigatorias sem valor" in linha
    )
    assert linha.endswith(": FOCUSQUEST_TEST_DATABASE_URL")
    assert "push rejeitado" in resultado.stderr
    assert "A GUARDA DEIXOU PASSAR" not in resultado.stdout


def test_recusa_sem_env_nenhum_nomeando_as_duas(tmp_path: Path) -> None:
    """Sem `.env` e sem ambiente: recusa, e nao "segue sem configuracao"."""
    resultado = _carregar(tmp_path / ".env", ["echo", "A GUARDA DEIXOU PASSAR"])

    assert resultado.returncode != 0
    assert (
        "variaveis obrigatorias sem valor: "
        "FOCUSQUEST_DATABASE_URL FOCUSQUEST_TEST_DATABASE_URL"
    ) in resultado.stderr
    assert "A GUARDA DEIXOU PASSAR" not in resultado.stdout


def test_linha_executavel_no_env_nao_executa(tmp_path: Path) -> None:
    """O `.env` e LIDO, nunca executado -- a razao de nao usar `source`.

    Tres formas de uma linha que um `source` executaria: comando solto,
    substituicao de comando solta e substituicao de comando no VALOR de uma
    variavel que a lista de permissao aceita. Nenhuma pode deixar o marcador no
    disco, e a terceira tem de chegar ao ambiente como texto literal.
    """
    marcadores = [tmp_path / f"executou-{n}" for n in range(3)]
    literal = f"$(touch {marcadores[2]})"
    arquivo_env = tmp_path / ".env"
    arquivo_env.write_text(
        CONFIG_COMPLETA
        + f"touch {marcadores[0]}\n"
        + f"$(touch {marcadores[1]})\n"
        + f"FOCUSQUEST_EXTRA={literal}\n"
    )

    resultado = _carregar(arquivo_env, ["printenv", "FOCUSQUEST_EXTRA"])

    assert resultado.returncode == 0, resultado.stderr
    assert [m for m in marcadores if m.exists()] == []
    assert resultado.stdout.rstrip("\n") == literal


def test_valor_com_igual_no_meio_atravessa_inteiro(tmp_path: Path) -> None:
    """A divisao e no PRIMEIRO `=`: uma URL com `=` na senha e na query chega
    inteira. Dividir no ultimo `=` -- ou cortar no segundo -- entregaria ao
    Settings uma URL truncada, e o gate do worktree falharia longe da causa."""
    url = (
        "postgresql+psycopg://focusquest:s3nh4=c0m=igual@127.0.0.1:55432/"
        "focusquest_test?options=-c%20timezone=UTC"
    )
    arquivo_env = tmp_path / ".env"
    arquivo_env.write_text(
        f"FOCUSQUEST_DATABASE_URL={URL_DEV}\nFOCUSQUEST_TEST_DATABASE_URL={url}\n"
    )

    resultado = _carregar(arquivo_env, ["printenv", "FOCUSQUEST_TEST_DATABASE_URL"])

    assert resultado.returncode == 0, resultado.stderr
    assert resultado.stdout.rstrip("\n") == url


def test_variavel_ja_exportada_vence_a_linha_do_env(tmp_path: Path) -> None:
    """A precedencia do pydantic-settings: ambiente acima do `.env`."""
    arquivo_env = tmp_path / ".env"
    arquivo_env.write_text(CONFIG_COMPLETA)

    resultado = _carregar(
        arquivo_env,
        ["printenv", "FOCUSQUEST_DATABASE_URL"],
        FOCUSQUEST_DATABASE_URL="postgresql+psycopg://do-ambiente/focusquest",
    )

    assert resultado.returncode == 0, resultado.stderr
    assert (
        resultado.stdout.rstrip("\n") == "postgresql+psycopg://do-ambiente/focusquest"
    )


def test_check_push_recusa_pela_guarda_antes_de_tocar_no_git(tmp_path: Path) -> None:
    """A outra ponta: o `check-push.sh` de verdade passa pela guarda.

    Os testes acima provam a funcao; sem este, o `check-push.sh` poderia deixar
    de chama-la e todos continuariam verdes. Aqui uma COPIA dele roda numa raiz
    sem `.env` (a raiz e resolvida a partir do proprio arquivo), com entrada
    padrao vazia -- nenhuma ref para validar.

    O `git` do PATH e falso: qualquer chamada deixa um marcador e falha. Sem a
    guarda, o script seguiria, nao acharia ref nenhuma e recusaria por "nada
    foi validado" -- ou seja, a mensagem, e nao o codigo de saida, e o que
    discrimina. E o marcador prova que nada no caminho encostou no git, logo
    nem push nem worktree.
    """
    scripts = tmp_path / "raiz" / "scripts"
    scripts.mkdir(parents=True)
    shutil.copy2(CHECK_PUSH, scripts / "check-push.sh")
    shutil.copy2(BIBLIOTECA, scripts / "push-env.sh")

    marcador = tmp_path / "git-foi-chamado"
    bin_falso = tmp_path / "bin"
    bin_falso.mkdir()
    git_falso = bin_falso / "git"
    git_falso.write_text(f'#!/bin/sh\ntouch "{marcador}"\nexit 97\n')
    git_falso.chmod(0o755)

    ambiente = _ambiente_sem_focusquest(
        PATH=f"{bin_falso}{os.pathsep}{os.environ['PATH']}"
    )
    for chave in list(ambiente):
        if chave.startswith("PRE_COMMIT_"):
            del ambiente[chave]

    resultado = subprocess.run(
        [str(scripts / "check-push.sh")],
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
        env=ambiente,
    )

    assert resultado.returncode == 1
    assert (
        "variaveis obrigatorias sem valor: "
        "FOCUSQUEST_DATABASE_URL FOCUSQUEST_TEST_DATABASE_URL"
    ) in resultado.stderr
    assert "nada foi validado" not in resultado.stderr
    assert not marcador.exists()
