#!/usr/bin/env bash
# Reprova a branch que edita docs/HANDOFF.md. Cada PR registra o handoff num
# arquivo proprio em docs/handoff/ (regras em docs/handoff/README.md), porque
# o HANDOFF unico gerava conflito de merge a cada PR que entrava na main. So a
# consolidacao, numa branch wt/consolidar-handoff*, edita o HANDOFF.
#
# Base e branch vem do ambiente quando existem: FQ_HANDOFF_BASE (padrao
# origin/main) e FQ_HANDOFF_BRANCH; no CI, GITHUB_HEAD_REF no pull_request e
# GITHUB_REF_NAME no push. Sem a base, o `git diff` falha e o alvo reprova.
set -euo pipefail

base=${FQ_HANDOFF_BASE:-origin/main}
branch=${FQ_HANDOFF_BRANCH:-${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}}}

case "$branch" in
  wt/consolidar-handoff*)
    echo "check-handoff: $branch e consolidacao; docs/HANDOFF.md liberado"
    exit 0
    ;;
esac

alterados=$(git diff --name-only "$base...HEAD" -- docs/HANDOFF.md)
if [ -n "$alterados" ]; then
  echo "check-handoff: $branch edita docs/HANDOFF.md; mova a secao para docs/handoff/AAAA-MM-DD-<branch>.md" >&2
  exit 1
fi
echo "check-handoff: docs/HANDOFF.md intocado em relacao a $base"
