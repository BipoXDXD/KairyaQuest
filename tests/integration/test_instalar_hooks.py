"""Testes do `scripts/instalar-hooks.sh` e do `scripts/verificar-hooks.sh` (#146).

O problema: `pre-commit install` grava, em cada hook do `.git` comum, o
`INSTALL_PYTHON` do interpretador que o rodou. Rodado num worktree, o hook passa
a apontar para o `.venv` DELE -- e remover o worktree quebra os hooks de todos.
A correcao e um venv dedicado ao lado do repositorio comum
(`<pai do git-common-dir>/.hooks-venv`), criado e atualizado por um script so, e
um verificador que reprova hook apontando para dentro de um worktree.

Os testes executam os scripts DE VERDADE, num repositorio git temporario (copias
dos scripts em `<tmp>/FocusQuest/scripts/`): nunca encostam no `.git` real nem
nos hooks reais. Dois pontos de realismo:

- o `uv` do PATH e falso (sem rede, sem `uv sync`): ele registra os argumentos e,
  no `venv`, cria um venv de verdade com a stdlib, ligado por um `.pth` ao
  site-packages deste ambiente de teste (onde o `pre_commit` real esta). Assim o
  `pre_commit install` que o script roda e o real, e o `INSTALL_PYTHON` que ele
  grava e o `sys.executable` de um venv de verdade;
- o `make` nunca e chamado: o `pre_commit install` so escreve os hooks, nao os
  executa.
"""

import os
import shutil
import subprocess
import sys
import sysconfig
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
INSTALADOR = RAIZ / "scripts" / "instalar-hooks.sh"
VERIFICADOR = RAIZ / "scripts" / "verificar-hooks.sh"
BIBLIOTECA = RAIZ / "scripts" / "hooks-venv-lib.sh"
CONFIGURACAO = RAIZ / ".pre-commit-config.yaml"

HOOKS = ("pre-commit", "pre-merge-commit", "pre-push")
VERSAO_TRAVADA = "9.9.9"

LER_PURELIB = "import sysconfig as s; print(s.get_path('purelib'))"

# O `uv` falso. `export` imprime o que o `uv export` real imprimiria (pins, com
# os comentarios "via"); `venv` cria um venv real; `pip` so registra.
UV_FALSO = f"""#!/bin/sh
echo "$@" >> "$FAKE_UV_REGISTRO"
case "$1" in
  export)
    echo "cfgv==3.5.0"
    echo "    # via pre-commit"
    if [ -z "$FAKE_UV_SEM_PRECOMMIT" ]; then
      echo "pre-commit=={VERSAO_TRAVADA}"
    fi
    ;;
  venv)
    for ultimo in "$@"; do :; done
    "{sys.executable}" -m venv --clear --without-pip "$ultimo" || exit 1
    purelib="$("$ultimo/bin/python" -c "{LER_PURELIB}")"
    echo "{sysconfig.get_paths()["purelib"]}" > "$purelib/ambiente-de-teste.pth"
    ;;
  pip)
    ;;
  *)
    echo "uv falso: subcomando inesperado: $1" >&2
    exit 2
    ;;
esac
"""


class Repositorio:
    """O principal temporario, o `uv` falso e o jeito de rodar os scripts."""

    def __init__(self, tmp_path: Path, nome_do_principal: str = "FocusQuest") -> None:
        self.base = tmp_path
        self.principal = tmp_path / nome_do_principal
        self.registro_do_uv = tmp_path / "uv-chamado"
        self.bin_falso = tmp_path / "bin"
        self.bin_falso.mkdir()
        uv_falso = self.bin_falso / "uv"
        uv_falso.write_text(UV_FALSO)
        uv_falso.chmod(0o755)
        self.ambiente = {
            chave: valor
            for chave, valor in os.environ.items()
            if not chave.startswith(("FOCUSQUEST_", "GIT_", "FAKE_UV_", "VIRTUAL_ENV"))
        } | {
            "PATH": f"{self.bin_falso}{os.pathsep}{os.environ['PATH']}",
            "FAKE_UV_REGISTRO": str(self.registro_do_uv),
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_AUTHOR_NAME": "teste",
            "GIT_AUTHOR_EMAIL": "teste@example.invalid",
            "GIT_COMMITTER_NAME": "teste",
            "GIT_COMMITTER_EMAIL": "teste@example.invalid",
            # O cache do pre-commit, longe do real.
            "PRE_COMMIT_HOME": str(tmp_path / "cache-do-pre-commit"),
        }

        self.principal.mkdir(parents=True)
        self.git("init", "-q", "-b", "main")
        (self.principal / ".gitignore").write_text(".hooks-venv/\n.claude/\n")
        shutil.copy2(CONFIGURACAO, self.principal / ".pre-commit-config.yaml")
        scripts = self.principal / "scripts"
        scripts.mkdir()
        shutil.copy2(INSTALADOR, scripts / "instalar-hooks.sh")
        shutil.copy2(VERIFICADOR, scripts / "verificar-hooks.sh")
        shutil.copy2(BIBLIOTECA, scripts / "hooks-venv-lib.sh")
        self.git("add", ".")
        self.git("commit", "-q", "-m", "base")

    @property
    def comum(self) -> Path:
        return self.principal / ".git"

    @property
    def venv(self) -> Path:
        return (self.principal / ".hooks-venv").resolve()

    def git(self, *argumentos: str, onde: Path | None = None) -> str:
        return subprocess.run(
            ["git", *argumentos],
            cwd=onde or self.principal,
            env=self.ambiente,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()

    def novo_worktree(self, caminho_relativo: str) -> Path:
        destino = self.principal / caminho_relativo
        self.git("worktree", "add", "-q", "-b", f"wt/{destino.name}", str(destino))
        return destino

    def instalar(
        self, a_partir_de: Path | None = None, **ambiente: str
    ) -> subprocess.CompletedProcess[str]:
        return self._rodar("instalar-hooks.sh", a_partir_de, ambiente)

    def verificar(
        self, a_partir_de: Path | None = None, **ambiente: str
    ) -> subprocess.CompletedProcess[str]:
        return self._rodar("verificar-hooks.sh", a_partir_de, ambiente)

    def _rodar(
        self, script: str, a_partir_de: Path | None, ambiente: dict[str, str]
    ) -> subprocess.CompletedProcess[str]:
        raiz = a_partir_de or self.principal
        return subprocess.run(
            [str(raiz / "scripts" / script)],
            cwd=self.base,
            env=self.ambiente | ambiente,
            capture_output=True,
            text=True,
            check=False,
        )

    def chamadas_do_uv(self, subcomando: str) -> list[str]:
        if not self.registro_do_uv.exists():
            return []
        return [
            linha
            for linha in self.registro_do_uv.read_text().splitlines()
            if linha.split()[0] == subcomando
        ]

    def instalar_python_dos_hooks(self) -> dict[str, str]:
        return {nome: _instalar_python(self.comum / "hooks" / nome) for nome in HOOKS}

    def escrever_hook(self, nome: str, instalar_python: str) -> None:
        """Um hook no formato que o pre-commit gera (so o que o verificador le)."""
        hooks = self.comum / "hooks"
        hooks.mkdir(exist_ok=True)
        caminho = hooks / nome
        caminho.write_text(
            "#!/usr/bin/env bash\n"
            "# File generated by pre-commit: https://pre-commit.com\n"
            f"INSTALL_PYTHON={instalar_python}\n"
            'exec "$INSTALL_PYTHON" -mpre_commit hook-impl\n'
        )
        caminho.chmod(0o755)

    def escrever_todos_os_hooks(self, instalar_python: str) -> None:
        for nome in HOOKS:
            self.escrever_hook(nome, instalar_python)


def _instalar_python(hook: Path) -> str:
    linhas = [
        linha
        for linha in hook.read_text().splitlines()
        if linha.startswith("INSTALL_PYTHON=")
    ]
    assert len(linhas) == 1, linhas
    return linhas[0].removeprefix("INSTALL_PYTHON=").strip("'\"")


def _python_executavel(pasta: Path, nome: str = "python-bom") -> Path:
    caminho = pasta / nome
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text("#!/bin/sh\nexit 0\n")
    caminho.chmod(0o755)
    return caminho


def _python_esperado(repo: Repositorio) -> str:
    """O unico valor aceito: `<pai do .git comum>/.hooks-venv/bin/python`, existente."""
    return str(_python_executavel(repo.venv / "bin", "python"))


@pytest.fixture
def repo(tmp_path: Path) -> Repositorio:
    return Repositorio(tmp_path)


# ---------------------------------------------------------------------------
# instalar-hooks.sh
# ---------------------------------------------------------------------------


def test_instala_os_tres_hooks_apontando_para_o_venv_dedicado(
    repo: Repositorio,
) -> None:
    resultado = repo.instalar()

    assert resultado.returncode == 0, resultado.stderr
    esperado = str(repo.venv / "bin" / "python")
    assert repo.instalar_python_dos_hooks() == {nome: esperado for nome in HOOKS}
    assert "/.claude/worktrees/" not in esperado


def test_rodado_de_dentro_de_um_worktree_o_python_continua_fora_de_worktrees(
    repo: Repositorio,
) -> None:
    """O defeito original: rodar do worktree `x` fixava o `.venv` do `x`."""
    worktree = repo.novo_worktree(".claude/worktrees/x")

    resultado = repo.instalar(a_partir_de=worktree)

    assert resultado.returncode == 0, resultado.stderr
    esperado = str(repo.venv / "bin" / "python")
    assert repo.instalar_python_dos_hooks() == {nome: esperado for nome in HOOKS}
    # O venv nasceu ao lado do repositorio comum, nunca dentro do worktree.
    assert repo.venv.is_dir()
    assert not (worktree / ".hooks-venv").exists()


def test_remover_o_worktree_nao_quebra_os_hooks(repo: Repositorio) -> None:
    worktree = repo.novo_worktree(".claude/worktrees/efemero")
    assert repo.instalar(a_partir_de=worktree).returncode == 0

    repo.git("worktree", "remove", "--force", str(worktree))

    python = Path(repo.instalar_python_dos_hooks()["pre-commit"])
    assert python.exists()
    versao = subprocess.run(
        [str(python), "-c", "import pre_commit; print(pre_commit.__name__)"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert versao.returncode == 0, versao.stderr
    assert versao.stdout.strip() == "pre_commit"
    assert repo.verificar().returncode == 0


def test_e_idempotente(repo: Repositorio) -> None:
    primeira = repo.instalar()
    hooks_antes = {nome: (repo.comum / "hooks" / nome).read_bytes() for nome in HOOKS}
    python_antes = (repo.venv / "bin" / "python").resolve()

    segunda = repo.instalar()

    assert primeira.returncode == 0, primeira.stderr
    assert segunda.returncode == 0, segunda.stderr
    assert {
        nome: (repo.comum / "hooks" / nome).read_bytes() for nome in HOOKS
    } == hooks_antes
    # O venv saudavel NAO e recriado (ha hook em uso por outras sessoes); so a
    # instalacao da versao travada roda de novo, que e um no-op para o uv.
    assert len(repo.chamadas_do_uv("venv")) == 1
    assert len(repo.chamadas_do_uv("pip")) == 2
    assert (repo.venv / "bin" / "python").resolve() == python_antes


def test_instala_o_pre_commit_na_versao_travada_pelo_lock(repo: Repositorio) -> None:
    resultado = repo.instalar()

    assert resultado.returncode == 0, resultado.stderr
    [exportacao] = repo.chamadas_do_uv("export")
    assert "--locked" in exportacao
    [instalacao] = repo.chamadas_do_uv("pip")
    assert f"pre-commit=={VERSAO_TRAVADA}" in instalacao.split()
    # O interpretador alvo e o do venv dedicado, e as demais dependencias ficam
    # presas as versoes do lock por um arquivo de constraints.
    assert str(repo.venv / "bin" / "python") in instalacao
    assert "--constraint" in instalacao.split()


def test_recria_o_venv_quando_o_python_dele_quebrou(repo: Repositorio) -> None:
    assert repo.instalar().returncode == 0
    python = repo.venv / "bin" / "python"
    python.unlink()
    python.symlink_to(repo.base / "nao-existe")

    resultado = repo.instalar()

    assert resultado.returncode == 0, resultado.stderr
    assert len(repo.chamadas_do_uv("venv")) == 2
    assert repo.verificar().returncode == 0


def test_recusa_sem_uv_no_path(repo: Repositorio) -> None:
    resultado = repo.instalar(PATH="/usr/bin:/bin")

    assert resultado.returncode != 0
    assert "uv" in resultado.stderr
    assert not (repo.comum / "hooks" / "pre-commit").exists()
    assert not repo.venv.exists()


def test_recusa_se_o_lock_nao_fixa_o_pre_commit(repo: Repositorio) -> None:
    resultado = repo.instalar(FAKE_UV_SEM_PRECOMMIT="1")

    assert resultado.returncode != 0
    assert "pre-commit" in resultado.stderr
    assert not (repo.comum / "hooks" / "pre-commit").exists()


def test_recusa_se_o_venv_cairia_dentro_de_worktrees(tmp_path: Path) -> None:
    """Um clone dentro de `.claude/worktrees/` poria o venv onde o worktree some."""
    dentro = Repositorio(tmp_path, nome_do_principal=".claude/worktrees/clone")

    resultado = dentro.instalar()

    assert resultado.returncode != 0
    assert ".claude/worktrees" in resultado.stderr
    assert not (dentro.principal / ".hooks-venv").exists()
    assert not (dentro.comum / "hooks" / "pre-commit").exists()


def test_recusa_enquanto_outra_execucao_segura_a_trava(repo: Repositorio) -> None:
    (repo.comum / "instalar-hooks.lock").mkdir()

    resultado = repo.instalar()

    assert resultado.returncode != 0
    assert "instalar-hooks.lock" in resultado.stderr
    assert not (repo.comum / "hooks" / "pre-commit").exists()
    # A trava de outro nao e apagada por quem foi recusado.
    assert (repo.comum / "instalar-hooks.lock").is_dir()


def test_libera_a_trava_ao_terminar(repo: Repositorio) -> None:
    assert repo.instalar().returncode == 0

    assert not (repo.comum / "instalar-hooks.lock").exists()


def test_propaga_a_recusa_do_pre_commit_install(repo: Repositorio) -> None:
    """Com `core.hooksPath` o pre-commit recusa instalar; o script nao engole."""
    outro = repo.base / "hooks-de-outro"
    outro.mkdir()
    repo.git("config", "core.hooksPath", str(outro))

    resultado = repo.instalar()

    assert resultado.returncode != 0


# ---------------------------------------------------------------------------
# verificar-hooks.sh -- o check que falha se o INSTALL_PYTHON aponta para um
# worktree
# ---------------------------------------------------------------------------


def test_verificador_aprova_o_python_do_hooks_venv(repo: Repositorio) -> None:
    repo.escrever_todos_os_hooks(_python_esperado(repo))

    resultado = repo.verificar()

    assert resultado.returncode == 0, resultado.stderr


@pytest.mark.parametrize("hook", HOOKS)
def test_verificador_reprova_python_dentro_de_claude_worktrees(
    repo: Repositorio, hook: str
) -> None:
    """A sabotagem do #146: o estado em que os hooks reais estavam."""
    bom = _python_esperado(repo)
    ruim_dir = repo.principal / ".claude" / "worktrees" / "x" / ".venv" / "bin"
    ruim_dir.mkdir(parents=True)
    ruim = ruim_dir / "python"
    ruim.write_text("#!/bin/sh\nexit 0\n")
    ruim.chmod(0o755)
    repo.escrever_todos_os_hooks(bom)
    repo.escrever_hook(hook, str(ruim))

    resultado = repo.verificar()

    assert resultado.returncode != 0
    assert hook in resultado.stderr
    assert ".claude/worktrees" in resultado.stderr
    assert "instalar-hooks.sh" in resultado.stderr


def test_verificador_reprova_python_em_worktree_fora_de_claude_worktrees(
    repo: Repositorio,
) -> None:
    """Qualquer worktree registrado some quando removido, nao so os de `.claude`."""
    externo = repo.base / "worktree-externo"
    repo.git("worktree", "add", "-q", "-b", "wt/externo", str(externo))
    ruim_dir = externo / ".venv" / "bin"
    ruim_dir.mkdir(parents=True)
    ruim = ruim_dir / "python"
    ruim.write_text("#!/bin/sh\nexit 0\n")
    ruim.chmod(0o755)
    repo.escrever_todos_os_hooks(str(ruim))

    resultado = repo.verificar()

    assert resultado.returncode != 0
    assert "worktree" in resultado.stderr


def test_verificador_reprova_hook_ausente(repo: Repositorio) -> None:
    esperado = _python_esperado(repo)
    repo.escrever_hook("pre-commit", esperado)
    repo.escrever_hook("pre-push", esperado)

    resultado = repo.verificar()

    assert resultado.returncode != 0
    assert "pre-merge-commit" in resultado.stderr
    assert "instalar-hooks.sh" in resultado.stderr


def test_verificador_reprova_python_inexistente(repo: Repositorio) -> None:
    repo.escrever_todos_os_hooks(str(repo.base / "sumiu" / "bin" / "python"))

    resultado = repo.verificar()

    assert resultado.returncode != 0
    assert "sumiu" in resultado.stderr


def test_verificador_reprova_hook_sem_install_python(repo: Repositorio) -> None:
    hooks = repo.comum / "hooks"
    hooks.mkdir(exist_ok=True)
    for nome in HOOKS:
        (hooks / nome).write_text("#!/bin/sh\nexit 0\n")
        (hooks / nome).chmod(0o755)

    resultado = repo.verificar()

    assert resultado.returncode != 0
    assert "INSTALL_PYTHON" in resultado.stderr


def test_verificador_le_caminho_com_espaco_entre_aspas(tmp_path: Path) -> None:
    """O pre-commit grava `shlex.quote(sys.executable)`: com espaco, vem aspado."""
    com_espaco = Repositorio(tmp_path, nome_do_principal="pasta com espaco")
    python = _python_esperado(com_espaco)
    com_espaco.escrever_todos_os_hooks(f"'{python}'")

    resultado = com_espaco.verificar()

    assert resultado.returncode == 0, resultado.stderr


def test_verificador_roda_de_dentro_de_um_worktree(repo: Repositorio) -> None:
    """Resolve os hooks pelo `.git` comum, nao pelo `.git` do worktree."""
    worktree = repo.novo_worktree(".claude/worktrees/y")
    repo.escrever_todos_os_hooks(_python_esperado(repo))

    assert repo.verificar(a_partir_de=worktree).returncode == 0

    repo.escrever_hook("pre-push", str(worktree / ".venv" / "bin" / "python"))
    assert repo.verificar(a_partir_de=worktree).returncode != 0


# ---------------------------------------------------------------------------
# verificar-hooks.sh -- regra EXATA (#155): o INSTALL_PYTHON dos tres hooks
# tem de ser `<pai do .git comum>/.hooks-venv/bin/python`, nada mais
# ---------------------------------------------------------------------------


def _afirmar_mensagem_exata(
    stderr: str, hook: str, encontrado: str, esperado: str
) -> None:
    assert f"hook {hook} aponta para {encontrado}; esperado {esperado}" in stderr
    assert "pre-commit install" in stderr
    assert "rodado a mao" in stderr
    assert "scripts/instalar-hooks.sh" in stderr
    assert "autorizacao do responsavel" in stderr


def test_verificador_reprova_pre_commit_install_rodado_de_um_worktree_que_existe(
    repo: Repositorio,
) -> None:
    """O cenario real: o instalador rodou, depois alguem rodou `pre-commit install`
    de um worktree vivo. O `.venv` dele existe, e antes do #155 isso passava
    despercebido enquanto o worktree nao fosse removido.
    """
    assert repo.instalar().returncode == 0
    assert repo.verificar().returncode == 0
    worktree = repo.novo_worktree(".claude/worktrees/vivo")
    do_worktree = _python_executavel(worktree / ".venv" / "bin", "python")
    for nome in HOOKS:
        caminho = repo.comum / "hooks" / nome
        esperado_gravado = _instalar_python(caminho)
        caminho.write_text(
            caminho.read_text().replace(
                f"INSTALL_PYTHON={esperado_gravado}", f"INSTALL_PYTHON={do_worktree}"
            )
        )
    assert set(repo.instalar_python_dos_hooks().values()) == {str(do_worktree)}

    resultado = repo.verificar()

    assert resultado.returncode != 0
    for nome in HOOKS:
        _afirmar_mensagem_exata(
            resultado.stderr, nome, str(do_worktree), str(repo.venv / "bin" / "python")
        )


@pytest.mark.parametrize("hook", HOOKS)
def test_verificador_reprova_python_existente_fora_de_worktrees_mas_diferente(
    repo: Repositorio, tmp_path: Path, hook: str
) -> None:
    """Um venv qualquer (outro projeto, `uv run` de fora) nao e o `.hooks-venv`."""
    esperado = _python_esperado(repo)
    outro = str(_python_executavel(tmp_path / "outro-venv" / "bin", "python"))
    repo.escrever_todos_os_hooks(esperado)
    repo.escrever_hook(hook, outro)

    resultado = repo.verificar()

    assert resultado.returncode != 0
    _afirmar_mensagem_exata(resultado.stderr, hook, outro, esperado)
    # Os hooks certos nao entram na lista de problemas.
    for nome in set(HOOKS) - {hook}:
        assert f"hook {nome} aponta para" not in resultado.stderr


def test_verificador_reprova_o_python_do_sistema_mesmo_existindo(
    repo: Repositorio,
) -> None:
    repo.escrever_todos_os_hooks(sys.executable)
    _python_esperado(repo)

    resultado = repo.verificar()

    assert resultado.returncode != 0
    for nome in HOOKS:
        _afirmar_mensagem_exata(
            resultado.stderr, nome, sys.executable, str(repo.venv / "bin" / "python")
        )


def test_verificador_reprova_o_hooks_venv_de_outro_repositorio(
    repo: Repositorio, tmp_path: Path
) -> None:
    """Igual no nome (`.hooks-venv/bin/python`), mas de outro principal."""
    esperado = _python_esperado(repo)
    de_outro = str(
        _python_executavel(tmp_path / "outro" / ".hooks-venv" / "bin", "python")
    )
    repo.escrever_todos_os_hooks(de_outro)

    resultado = repo.verificar()

    assert resultado.returncode != 0
    _afirmar_mensagem_exata(resultado.stderr, "pre-push", de_outro, esperado)


def test_verificador_reprova_quando_o_hooks_venv_esperado_nao_existe(
    repo: Repositorio,
) -> None:
    """Valor certo, venv ausente: o hook cairia no `pre-commit` do PATH."""
    repo.escrever_todos_os_hooks(str(repo.venv / "bin" / "python"))

    resultado = repo.verificar()

    assert resultado.returncode != 0
    assert str(repo.venv / "bin" / "python") in resultado.stderr
    assert "nao existe" in resultado.stderr
    assert "scripts/instalar-hooks.sh" in resultado.stderr
