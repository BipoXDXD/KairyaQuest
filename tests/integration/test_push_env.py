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

import pytest

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


# ---------------------------------------------------------------------------
# Isolamento do gate do push (pendencia 19): banco e portas proprios, para um
# push nao colidir com um `make check` rodando no mesmo worktree nem em outro.
# ---------------------------------------------------------------------------

HARNESS_ISOLADO = (
    'set -euo pipefail; . "$1"; exportar_env_focusquest "$2"; '
    'isolar_gate_do_push; shift 2; exec "$@"'
)
PREFIXO = "postgresql+psycopg://focusquest:focusquest_local@127.0.0.1:55432/"


def _isolar(
    tmp_path: Path, conteudo_extra: str, comando: list[str], url_teste: str = URL_TESTE
) -> subprocess.CompletedProcess[str]:
    arquivo_env = tmp_path / ".env"
    arquivo_env.write_text(
        f"FOCUSQUEST_DATABASE_URL={URL_DEV}\n"
        f"FOCUSQUEST_TEST_DATABASE_URL={url_teste}\n" + conteudo_extra
    )
    return subprocess.run(
        [
            "bash",
            "-c",
            HARNESS_ISOLADO,
            "harness",
            str(BIBLIOTECA),
            str(arquivo_env),
            *comando,
        ],
        capture_output=True,
        text=True,
        check=False,
        env=_ambiente_sem_focusquest(),
    )


def _ambiente_do_filho(resultado: subprocess.CompletedProcess[str]) -> dict[str, str]:
    assert resultado.returncode == 0, resultado.stderr
    return dict(
        linha.split("=", 1)
        for linha in resultado.stdout.splitlines()
        if linha.startswith("FOCUSQUEST_")
    )


def test_o_push_usa_um_banco_proprio_derivado_do_de_teste(tmp_path: Path) -> None:
    """`focusquest_test` vira `focusquest_push_test`: outro banco, no mesmo
    servidor, com o nome AINDA terminando em `_test` (a guarda do DROP
    continua valendo para ele)."""
    filho = _ambiente_do_filho(_isolar(tmp_path, "", ["env"]))
    assert filho["FOCUSQUEST_TEST_DATABASE_URL"] == PREFIXO + "focusquest_push_test"
    # O banco de desenvolvimento nao muda: o gate nao o usa, e trocar um
    # endereco que ninguem pediu para trocar seria surpresa.
    assert filho["FOCUSQUEST_DATABASE_URL"] == URL_DEV


def test_o_banco_do_push_de_um_worktree_e_so_dele(tmp_path: Path) -> None:
    """Dois worktrees empurrando ao mesmo tempo nao dividem o banco do push:
    o nome deriva do banco de teste de QUEM empurra. A query da URL atravessa
    intacta -- inclusive com `/` e `_test` dentro dela."""
    url = PREFIXO + "focusquest_gate_test?options=-c%20a/b_test"
    filho = _ambiente_do_filho(_isolar(tmp_path, "", ["env"], url_teste=url))
    assert filho["FOCUSQUEST_TEST_DATABASE_URL"] == (
        PREFIXO + "focusquest_gate_push_test?options=-c%20a/b_test"
    )


def test_o_push_desloca_as_portas_para_a_faixa_reservada(tmp_path: Path) -> None:
    """Sem deslocamento no `.env` (o worktree principal, 0), o push usa 25."""
    filho = _ambiente_do_filho(_isolar(tmp_path, "", ["env"]))
    assert filho["FOCUSQUEST_E2E_PORT_OFFSET"] == "25"


def test_o_push_de_um_worktree_deslocado_soma_a_reserva(tmp_path: Path) -> None:
    """Worktree com 7 empurra com 32: distinto de todo worktree (0 a 24) e do
    push de qualquer outro worktree (que soma 25 a um deslocamento distinto)."""
    filho = _ambiente_do_filho(
        _isolar(tmp_path, "FOCUSQUEST_E2E_PORT_OFFSET=7\n", ["env"])
    )
    assert filho["FOCUSQUEST_E2E_PORT_OFFSET"] == "32"


def test_deslocamento_vazio_no_env_conta_como_zero(tmp_path: Path) -> None:
    filho = _ambiente_do_filho(
        _isolar(tmp_path, "FOCUSQUEST_E2E_PORT_OFFSET=\n", ["env"])
    )
    assert filho["FOCUSQUEST_E2E_PORT_OFFSET"] == "25"


@pytest.mark.parametrize("valor", ["25", "49", "abc", "-1", "1.5"])
def test_recusa_o_push_com_deslocamento_fora_da_faixa_dos_worktrees(
    tmp_path: Path, valor: str
) -> None:
    """De 25 em diante a faixa e do push: um worktree ali empurraria com 50+,
    fora do limite -- e o push de um colidiria com o `make check` de outro."""
    resultado = _isolar(
        tmp_path,
        f"FOCUSQUEST_E2E_PORT_OFFSET={valor}\n",
        ["echo", "A GUARDA DEIXOU PASSAR"],
    )
    assert resultado.returncode != 0
    assert "FOCUSQUEST_E2E_PORT_OFFSET" in resultado.stderr
    assert "de 0 a 24" in resultado.stderr
    assert "push rejeitado" in resultado.stderr
    assert "A GUARDA DEIXOU PASSAR" not in resultado.stdout


@pytest.mark.parametrize(
    "url", [URL_DEV, PREFIXO + "_test", PREFIXO + "focusquest_testes"]
)
def test_recusa_o_push_se_o_banco_de_teste_nao_termina_em_test(
    tmp_path: Path, url: str
) -> None:
    """Sem o sufixo nao ha de onde derivar um banco `_push_test` -- e um
    `FOCUSQUEST_TEST_DATABASE_URL` apontado para o banco de desenvolvimento e
    exatamente o erro que a guarda do DROP existe para pegar. Recusa aqui, com
    a instrucao, em vez de levar o erro ao gate do worktree."""
    resultado = _isolar(tmp_path, "", ["echo", "A GUARDA DEIXOU PASSAR"], url_teste=url)
    assert resultado.returncode != 0
    assert "termine em _test" in resultado.stderr
    assert "push rejeitado" in resultado.stderr
    assert "A GUARDA DEIXOU PASSAR" not in resultado.stdout


def _check_push_numa_copia(
    tmp_path: Path, conteudo_env: str
) -> subprocess.CompletedProcess[str]:
    """Uma COPIA do `check-push.sh` numa raiz com o `.env` dado, sem ref
    nenhuma na entrada e com um `git` falso que falha se for chamado."""
    raiz = tmp_path / "raiz"
    scripts = raiz / "scripts"
    scripts.mkdir(parents=True)
    shutil.copy2(CHECK_PUSH, scripts / "check-push.sh")
    shutil.copy2(BIBLIOTECA, scripts / "push-env.sh")
    (raiz / ".env").write_text(conteudo_env)

    bin_falso = tmp_path / "bin"
    bin_falso.mkdir()
    git_falso = bin_falso / "git"
    git_falso.write_text("#!/bin/sh\nexit 97\n")
    git_falso.chmod(0o755)

    ambiente = _ambiente_sem_focusquest(
        PATH=f"{bin_falso}{os.pathsep}{os.environ['PATH']}"
    )
    for chave in list(ambiente):
        if chave.startswith("PRE_COMMIT_"):
            del ambiente[chave]
    return subprocess.run(
        [str(scripts / "check-push.sh")],
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
        env=ambiente,
    )


def test_check_push_isola_o_gate_antes_de_validar(tmp_path: Path) -> None:
    """A outra ponta: o `check-push.sh` de verdade chama o isolamento, e o
    anuncia. Sem ref na entrada ele termina em "nada foi validado" -- o que
    prova que passou pelo isolamento SEM recusar."""
    resultado = _check_push_numa_copia(tmp_path, CONFIG_COMPLETA)
    assert (
        "==> gate do push isolado: banco focusquest_push_test, "
        "deslocamento das portas do E2E 25"
    ) in resultado.stdout
    assert "nada foi validado" in resultado.stderr


def test_check_push_recusa_pelo_isolamento(tmp_path: Path) -> None:
    resultado = _check_push_numa_copia(
        tmp_path, CONFIG_COMPLETA + "FOCUSQUEST_E2E_PORT_OFFSET=30\n"
    )
    assert resultado.returncode == 1
    assert "de 0 a 24" in resultado.stderr
    assert "nada foi validado" not in resultado.stderr
