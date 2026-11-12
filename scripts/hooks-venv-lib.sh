# shellcheck shell=bash
# Biblioteca (so "source", nao executavel): onde moram o .git comum e o venv
# DEDICADO dos hooks de git. Existe para que o instalador e o verificador
# calculem o MESMO caminho: o que o scripts/instalar-hooks.sh grava e o unico
# valor que o scripts/verificar-hooks.sh aceita.
#
#   . "$(dirname "${BASH_SOURCE[0]}")/hooks-venv-lib.sh"
#   comum="$(hooks_git_comum "$ROOT")"
#   venv="$(hooks_venv_dir "$comum")"          # <pai do .git comum>/.hooks-venv
#   python="$(hooks_venv_python "$comum")"     # <venv>/bin/python
#
# Compativel com bash 3.2 (macOS). Nao liga "set -e" nem altera o shell de quem
# a carrega.

# O .git comum (nunca o do worktree), caminho fisico. Relativo ao cwd, por isso
# o cd antes.
hooks_git_comum() {
  (cd "$1" && cd "$(git rev-parse --git-common-dir)" && pwd -P)
}

# O venv dos hooks: ao lado do repositorio comum, fora de qualquer worktree.
hooks_venv_dir() {
  echo "$(dirname "$1")/.hooks-venv"
}

# O interpretador que o "pre-commit install" grava como INSTALL_PYTHON.
hooks_venv_python() {
  echo "$(hooks_venv_dir "$1")/bin/python"
}
