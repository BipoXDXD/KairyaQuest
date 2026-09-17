#!/usr/bin/env bash
# Valida o gate no topo de cada ref enviada, em worktree isolado.
# Limitacao conhecida: commits intermediarios nao sao validados um a um.
set -euo pipefail

ZERO="0000000000000000000000000000000000000000"
status=0
validadas=0
delecoes=0

while read -r ref_local sha_local _ref_remota _sha_remoto; do
  if [ "$sha_local" = "$ZERO" ]; then
    delecoes=$((delecoes + 1))
    continue
  fi

  work="$(mktemp -d)"
  echo "==> validando ${ref_local} (${sha_local:0:8}) em worktree limpo"
  git worktree add --quiet --detach "$work" "$sha_local"

  if make -C "$work" bootstrap && make -C "$work" check; then
    validadas=$((validadas + 1))
  else
    echo "!! gate reprovou em ${ref_local} (${sha_local:0:8})" >&2
    status=1
  fi

  git worktree remove --force "$work"
done

if [ "$status" -eq 0 ] && [ "$validadas" -eq 0 ] && [ "$delecoes" -eq 0 ]; then
  echo "!! nada foi validado: operacao nao verificavel, push rejeitado" >&2
  exit 1
fi

exit $status
