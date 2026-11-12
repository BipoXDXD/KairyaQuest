#!/usr/bin/env bash
# Confere os hooks de git INSTALADOS neste repositorio: o INSTALL_PYTHON que o
# pre-commit gravou em cada um (pre-commit, pre-merge-commit, pre-push) tem de
# ser EXATAMENTE <pai do git-common-dir>/.hooks-venv/bin/python -- o caminho
# que scripts/instalar-hooks.sh calcula (as duas usam hooks-venv-lib.sh).
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
#  - INSTALL_PYTHON diferente do esperado, seja qual for: dentro de um worktree
#    (some quando ele e removido), o python do sistema, o venv de outro
#    projeto. Lote 23: antes so se reprovava worktree ou caminho inexistente, e
#    um "pre-commit install" de um worktree VIVO (ou de qualquer outro venv)
#    passava despercebido. A causa provavel e "pre-commit install" rodado a mao;
#  - INSTALL_PYTHON certo, mas que nao existe ou nao e executavel (o hook
#    cairia no pre-commit do PATH, ou falharia fechado, conforme a maquina).
#
# Nao e parte do "make check" de proposito: o CI nao tem hooks instalados, e o
# estado dos hooks e da maquina, nao do commit. E o "make check-hooks".
#
# So le. Nao instala, nao altera hook, nao invoca o pre-commit (docs/QUALITY.md
# secao 2). Compativel com bash 3.2 (macOS).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/hooks-venv-lib.sh
. "${ROOT}/scripts/hooks-venv-lib.sh"
comum="$(hooks_git_comum "$ROOT")"
esperado="$(hooks_venv_python "$comum")"

# Worktrees REGISTRADOS fora o principal: o primeiro da lista e o dono do .git
# (mesmo quando e "bare"), e e onde o venv dedicado mora. So servem para
# detalhar a mensagem (o valor errado dentro de um worktree some com ele).
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
  echo "!! hook $1 $2" >&2
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

  if [ "$python" != "$esperado" ]; then
    detalhe=""
    fisico="$(diretorio_fisico "$python")/$(basename "$python")"
    case "${python}|${fisico}" in
      *"/.claude/worktrees/"*) detalhe=" (dentro de .claude/worktrees/: remover o worktree quebra o hook de todos)" ;;
    esac
    if [ -z "$detalhe" ]; then
      while IFS= read -r secundario; do
        [ -n "$secundario" ] || continue
        case "$python" in "$secundario"/*) detalhe=" (dentro do worktree ${secundario}: remover o worktree quebra o hook de todos)" ;; esac
        case "$fisico" in "$secundario"/*) detalhe=" (dentro do worktree ${secundario}: remover o worktree quebra o hook de todos)" ;; esac
      done <<<"$secundarios"
    fi
    problema "$hook" "aponta para ${python}; esperado ${esperado}${detalhe}; a causa provavel e 'pre-commit install' rodado a mao"
    continue
  fi
  if [ ! -x "$python" ]; then
    problema "$hook" "INSTALL_PYTHON=${python} e o esperado, mas nao existe ou nao e executavel"
  fi
done

if [ "$problemas" -gt 0 ]; then
  echo "!! conserto: scripts/instalar-hooks.sh, de qualquer worktree, que precisa da autorizacao do responsavel (nunca 'pre-commit install' direto)" >&2
  exit 1
fi
echo "==> hooks conferidos: INSTALL_PYTHON de pre-commit, pre-merge-commit e pre-push e exatamente ${esperado}"
