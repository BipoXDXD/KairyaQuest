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

# O que vai ser commitado: no pre-commit (indice com mudanca ou merge em
# andamento) o HEAD ainda e o commit velho, e julgar por ele reprovaria o
# merge que devolve o HANDOFF a versao da main. O commit sintetico tem a
# arvore do indice e os pais que o commit real tera (HEAD e cada MERGE_HEAD),
# entao o diff contra a base usa o mesmo merge-base que o CI vai ver. Sem nada
# staged e sem merge -- o caso do CI e do pre-push --, o alvo e o proprio HEAD.
alvo=HEAD
merge_head=$(git rev-parse --git-path MERGE_HEAD)
if [ -f "$merge_head" ] || ! git diff --cached --quiet; then
  pais=(-p HEAD)
  if [ -f "$merge_head" ]; then
    while read -r pai; do
      pais+=(-p "$pai")
    done <"$merge_head"
  fi
  arvore=$(git write-tree)
  alvo=$(
    GIT_AUTHOR_NAME=check-handoff GIT_AUTHOR_EMAIL=check-handoff@example.invalid \
      GIT_COMMITTER_NAME=check-handoff GIT_COMMITTER_EMAIL=check-handoff@example.invalid \
      git commit-tree "$arvore" "${pais[@]}" -m "check-handoff: estado staged"
  )
fi

alterados=$(git diff --name-only "$base...$alvo" -- docs/HANDOFF.md)
if [ -n "$alterados" ]; then
  echo "check-handoff: $branch edita docs/HANDOFF.md; mova a secao para docs/handoff/AAAA-MM-DD-<branch>.md" >&2
  exit 1
fi
echo "check-handoff: docs/HANDOFF.md intocado em relacao a $base"
