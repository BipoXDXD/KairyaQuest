#!/usr/bin/env bash
# Cria ou atualiza o ambiente DEDICADO dos hooks de git e reinstala os hooks
# apontando para ele. E o unico jeito suportado de instalar hooks.
#
#   uso: scripts/instalar-hooks.sh        (de qualquer worktree, sem argumentos)
#
# O problema que resolve (#146): "pre-commit install" grava, em cada hook do
# .git COMUM (compartilhado por todos os worktrees), o interpretador de quem o
# rodou (INSTALL_PYTHON). Rodado num worktree, o hook passava a apontar para o
# .venv daquele worktree; remover o worktree quebrava os hooks de todos.
#
# O que faz, nesta ordem:
#  1. calcula o venv dedicado: <pai do git-common-dir>/.hooks-venv, ao lado do
#     repositorio comum, ignorado pelo git e FORA de qualquer worktree (recusa
#     se o caminho cairia em .claude/worktrees/);
#  2. pega a trava (a instalacao reescreve hooks que outras sessoes usam);
#  3. le a versao do pre-commit no uv.lock do worktree de onde roda (uv export
#     --locked, sem rede) -- a mesma do pyproject -- e usa o export inteiro como
#     arquivo de constraints, para as dependencias dele tambem ficarem nas
#     versoes do lock;
#  4. cria o venv se faltar ou estiver quebrado (o python dele sumiu: uv-managed
#     atualizado, por exemplo). Um venv saudavel NAO e recriado -- ha hook em
#     uso por outras sessoes, e recriar abriria uma janela em que ele nao existe;
#  5. instala a versao travada nele (no-op se ja estiver);
#  6. "pre_commit install --install-hooks" COM O PYTHON DO VENV, a partir deste
#     worktree (e o .pre-commit-config.yaml dele que vale): o INSTALL_PYTHON
#     gravado passa a ser <venv>/bin/python;
#  7. roda scripts/verificar-hooks.sh e falha se algum hook nao apontar
#     EXATAMENTE para <venv>/bin/python.
#
# Idempotente: rodar de novo regrava hooks identicos. Rodar de um worktree mais
# novo ATUALIZA o pre-commit se o lock dele mudou.
#
# Os hooks continuam chamando "make" e as ferramentas do worktree ONDE O COMMIT
# ACONTECE: o hook roda no diretorio do worktree (--config e relativo), e o
# gate local (".pre-commit-config.yaml": language system, "make check" e
# scripts/check-push.sh) nao usa o venv dos hooks para nada alem de subir o
# proprio pre-commit. O .venv do projeto (uv run) continua por worktree.
#
# NAO invocado por nenhum alvo do Makefile (docs/QUALITY.md secao 2, "nenhum
# alvo invoca pre-commit"), nem por "make bootstrap": o bootstrap roda dentro
# do worktree temporario do pre-push, e reescrever os hooks ali mudaria o
# repositorio comum no meio de um push.
#
# Compativel com bash 3.2 (macOS).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

recusa() {
  echo "!! $1" >&2
  exit 1
}

# O .git comum e o venv saem da biblioteca que o verificador tambem usa: o que
# este script grava e exatamente o que scripts/verificar-hooks.sh exige.
# shellcheck source=scripts/hooks-venv-lib.sh
. "${ROOT}/scripts/hooks-venv-lib.sh"
comum="$(hooks_git_comum "$ROOT")"
venv="$(hooks_venv_dir "$comum")"

case "$venv" in
  *"/.claude/worktrees/"*)
    recusa "o venv dos hooks cairia em ${venv}, dentro de .claude/worktrees/: apagar o worktree o levaria junto; rode o script do repositorio principal, fora de worktrees"
    ;;
esac

command -v uv >/dev/null 2>&1 || recusa "uv nao encontrado no PATH: ele cria o venv dos hooks (https://docs.astral.sh/uv/)"

# A trava: duas execucoes ao mesmo tempo disputariam o venv e os hooks. "mkdir"
# e atomico e existe em qualquer sistema (o "flock" nao vem no macOS). Uma
# execucao morta por SIGKILL deixa o diretorio para tras.
trava="${comum}/instalar-hooks.lock"
pins=""
com_trava=nao
limpar() {
  if [ -n "$pins" ]; then
    rm -f "$pins"
  fi
  if [ "$com_trava" = sim ]; then
    rmdir "$trava"
  fi
}
if ! mkdir "$trava" 2>/dev/null; then
  recusa "outra execucao do instalar-hooks.sh esta em andamento (trava ${trava}); espere ela terminar -- se nenhuma estiver rodando, a trava sobrou de uma execucao interrompida: apague-a com rmdir ${trava}"
fi
com_trava=sim
trap limpar EXIT

# Fora de qualquer ambiente ativo: o uv escolheria o VIRTUAL_ENV dele.
unset VIRTUAL_ENV

pins="$(mktemp "${TMPDIR:-/tmp}/instalar-hooks-pins.XXXXXX")"
if ! (cd "$ROOT" && uv export --locked --no-emit-project --no-hashes --no-header --format requirements-txt >"$pins"); then
  recusa "uv export --locked falhou em ${ROOT}: o uv.lock esta defasado ou ausente? rode 'uv lock --check'"
fi
if ! pin="$(grep -m1 -E -o '^pre-commit==[^ ;]+' "$pins")"; then
  recusa "o uv.lock de ${ROOT} nao fixa o pre-commit (grupo dev): nao ha versao para instalar"
fi

if ! { [ -x "${venv}/bin/python" ] && "${venv}/bin/python" -c 'import sys' >/dev/null 2>&1; }; then
  echo "==> criando o venv dos hooks em ${venv}"
  (cd "$ROOT" && uv venv --clear --quiet "$venv")
fi

echo "==> instalando ${pin} em ${venv}"
uv pip install --quiet --python "${venv}/bin/python" --constraint "$pins" "$pin"

# O diretorio de trabalho e este worktree: e o .pre-commit-config.yaml dele que
# define os hooks. O INSTALL_PYTHON gravado e o sys.executable do venv.
(cd "$ROOT" && "${venv}/bin/python" -m pre_commit install --install-hooks)

"${ROOT}/scripts/verificar-hooks.sh"
