#!/usr/bin/env bash
# Valida o gate no topo de cada ref enviada, em worktree isolado.
# Limitacao conhecida: commits intermediarios nao sao validados um a um.
set -euo pipefail

ZERO="0000000000000000000000000000000000000000"
status=0
validadas=0
delecoes=0

# Worktree da iteracao em andamento. Vazio fora de uma iteracao ativa; o
# trap de limpeza usa isso para saber se ha algo a remover.
work=""

cleanup() {
  local alvo="$work"
  work=""
  if [ -n "$alvo" ]; then
    # --force descarta qualquer alteracao local no worktree (nao deveria
    # haver nenhuma: e um worktree descartavel criado so para validar um
    # sha). O fallback com rm -rf cobre o caso de o registro do git ja ter
    # sumido (ex.: esta funcao rodando duas vezes para a mesma iteracao,
    # uma pelo fim normal do laco e outra pelo trap de EXIT) -- um
    # worktree que ja nao existe nao pode fazer a limpeza falhar.
    git worktree remove --force "$alvo" >/dev/null 2>&1 || rm -rf "$alvo"
  fi
}
# EXIT cobre o fim normal do script; INT e TERM cobrem Ctrl-C e kill
# durante o make -C bootstrap, que leva minutos e e a janela mais provavel
# de interrupcao. Sem isto, uma interrupcao nessa janela deixa worktree
# registrado no git e diretorio orfao em $TMPDIR.
trap cleanup EXIT INT TERM

while read -r ref_local sha_local _ref_remota _sha_remoto; do
  if [ "$sha_local" = "$ZERO" ]; then
    delecoes=$((delecoes + 1))
    continue
  fi

  work="$(mktemp -d)"
  echo "==> validando ${ref_local} (${sha_local:0:8}) em worktree limpo"

  # </dev/null em todo subprocesso deste bloco: o "while read" acima le da
  # entrada padrao do proprio script (uma linha por ref enviada). Sem
  # isolar a entrada padrao dos subprocessos, eles herdariam essa MESMA
  # entrada. Se qualquer um -- git worktree, make, ou uma ferramenta futura
  # do gate -- tentar ler stdin por qualquer motivo, ele consumiria as
  # linhas de refs restantes: o laco terminaria cedo SEM ERRO, e um push
  # com varias revisoes aprovaria (validadas>0, status=0) as que nunca
  # chegaram a ser validadas. Isso e exatamente a "operacao nao
  # verificavel" que o README proibe aprovar.
  git worktree add --quiet --detach "$work" "$sha_local" </dev/null

  # Bootstrap e check sao tratados em passos distintos, com mensagens
  # distintas: uma falha no bootstrap (rede fora do ar, dependencia que
  # sumiu de um espelho) e uma falha de INFRAESTRUTURA, nao um defeito do
  # codigo que esta sendo enviado. Confundir as duas mensagens convida a
  # reacao que a especificacao proibe -- tentar "--no-verify" achando que
  # o proprio codigo esta quebrado. As duas seguem rejeitando o push
  # (falha-fechada); so o diagnostico muda.
  if ! make -C "$work" bootstrap </dev/null; then
    echo "!! falha ao preparar o ambiente de validacao para ${ref_local} (${sha_local:0:8}) -- rede? dependencia ausente? isto nao e necessariamente um defeito do codigo enviado" >&2
    status=1
  elif ! make -C "$work" check </dev/null; then
    echo "!! gate reprovou em ${ref_local} (${sha_local:0:8})" >&2
    status=1
  else
    validadas=$((validadas + 1))
  fi

  cleanup
done

if [ "$status" -eq 0 ] && [ "$validadas" -eq 0 ] && [ "$delecoes" -eq 0 ]; then
  echo "!! nada foi validado: operacao nao verificavel, push rejeitado" >&2
  exit 1
fi

exit $status
