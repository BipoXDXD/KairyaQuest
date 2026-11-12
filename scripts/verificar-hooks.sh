#!/usr/bin/env bash
# Confere os hooks de git INSTALADOS neste repositorio: o INSTALL_PYTHON que o
# pre-commit gravou em cada um (pre-commit, pre-merge-commit, pre-push) nao pode
# apontar para dentro de um worktree.
#
#   uso: scripts/verificar-hooks.sh
#
# Por que existe (lote 20): os hooks moram no .git COMUM, compartilhado por todos
# os worktrees, e "pre-commit install" grava neles o interpretador de QUEM o
# rodou. Rodado dentro de um worktree, ele fixa o .venv DAQUELE worktree -- e
# remover o worktree (o fim normal de uma branch) quebra o hook de todos os
# outros. O conserto e scripts/instalar-hooks.sh, que usa um venv fora de
# qualquer worktree; este script e o check que reprova o estado errado, e o
# proprio instalar-hooks.sh o roda ao terminar.
#
# Reprova (exit 1, com uma linha por problema e o conserto no fim):
#  - hook ausente, ou sem a linha INSTALL_PYTHON= (nao e hook do pre-commit);
#  - INSTALL_PYTHON dentro de .claude/worktrees/ OU dentro de qualquer worktree
#    registrado que nao seja o principal (o primeiro de "git worktree list");
#  - INSTALL_PYTHON que nao existe ou nao e executavel (o hook cairia no
#    pre-commit do PATH, ou falharia fechado, conforme a maquina).
#
# Nao e parte do "make check" de proposito: o CI nao tem hooks instalados, e o
# estado dos hooks e da maquina, nao do commit. E o "make check-hooks".
#
# So le. Nao instala, nao altera hook, nao invoca o pre-commit (docs/QUALITY.md
# secao 2). Compativel com bash 3.2 (macOS).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Relativo ao cwd, por isso o cd antes: o .git comum, nunca o do worktree.
comum="$(cd "$ROOT" && cd "$(git rev-parse --git-common-dir)" && pwd -P)"

# Worktrees REGISTRADOS fora o principal: o primeiro da lista e o dono do .git
# (mesmo quando e "bare"), e e onde o venv dedicado mora.
secundarios=""
while IFS= read -r caminho; do
  [ -n "$caminho" ] || continue
  if [ -d "$caminho" ]; then
    caminho="$(cd "$caminho" && pwd -P)"
  fi
  secundarios="${secundarios}${caminho}
"
done < <(git -C "$ROOT" worktree list --porcelain | sed -n 's/^worktree //p' | tail -n +2)

problemas=0
problema() {
  echo "!! hook $1: $2" >&2
  problemas=$((problemas + 1))
}

# O diretorio do arquivo, resolvido (links de volta ao disco real); vazio se o
# diretorio nao existe.
diretorio_fisico() {
  local pasta
  pasta="$(dirname "$1")"
  if [ -d "$pasta" ]; then
    (cd "$pasta" && pwd -P)
  fi
}

for hook in pre-commit pre-merge-commit pre-push; do
  arquivo="${comum}/hooks/${hook}"
  if [ ! -f "$arquivo" ]; then
    problema "$hook" "nao instalado (${arquivo})"
    continue
  fi
  if ! linha="$(grep -m1 '^INSTALL_PYTHON=' "$arquivo")"; then
    problema "$hook" "sem a linha INSTALL_PYTHON=: nao e um hook gerado pelo pre-commit (${arquivo})"
    continue
  fi

  python="${linha#INSTALL_PYTHON=}"
  # O pre-commit grava shlex.quote(sys.executable): aspas simples so se o
  # caminho tem espaco ou caractere especial.
  case "$python" in
    \'*\') python="${python#\'}"; python="${python%\'}" ;;
    \"*\") python="${python#\"}"; python="${python%\"}" ;;
  esac

  case "$python" in
    /*) ;;
    *)
      problema "$hook" "INSTALL_PYTHON='${python}' nao e um caminho absoluto"
      continue
      ;;
  esac

  fisico="$(diretorio_fisico "$python")/$(basename "$python")"
  motivo=""
  case "${python}|${fisico}" in
    *"/.claude/worktrees/"*)
      motivo="INSTALL_PYTHON=${python} aponta para dentro de .claude/worktrees/: remover o worktree quebra o hook de todos"
      ;;
  esac
  if [ -z "$motivo" ]; then
    while IFS= read -r secundario; do
      [ -n "$secundario" ] || continue
      case "$python" in "$secundario"/*) motivo="INSTALL_PYTHON=${python} aponta para dentro do worktree ${secundario}: remover o worktree quebra o hook de todos" ;; esac
      case "$fisico" in "$secundario"/*) motivo="INSTALL_PYTHON=${python} aponta para dentro do worktree ${secundario}: remover o worktree quebra o hook de todos" ;; esac
    done <<<"$secundarios"
  fi
  if [ -z "$motivo" ] && [ ! -x "$python" ]; then
    motivo="INSTALL_PYTHON=${python} nao existe ou nao e executavel"
  fi
  if [ -n "$motivo" ]; then
    problema "$hook" "$motivo"
  fi
done

if [ "$problemas" -gt 0 ]; then
  echo "!! conserto: rode UMA vez, de qualquer worktree, scripts/instalar-hooks.sh (nunca 'pre-commit install' direto)" >&2
  exit 1
fi
echo "==> hooks conferidos: INSTALL_PYTHON de pre-commit, pre-merge-commit e pre-push existe e fica fora de worktrees (${python})"
