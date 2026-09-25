#!/usr/bin/env bash
# Cria um worktree irmao do principal, pronto para rodar o gate AO MESMO TEMPO
# que o principal e que os outros worktrees (pendencia 19, docs/QUALITY.md
# secao 4).
#
#   uso: scripts/novo-worktree.sh <nome> [deslocamento]
#
# O que faz, nesta ordem, e so depois de validar TUDO:
#  1. cria ../FocusQuest-<nome> (irmao do worktree principal) numa branch nova,
#     wt/<nome>, a partir da main atual;
#  2. escreve o .env dele a partir do .env do principal, trocando o banco de
#     teste para focusquest_<nome>_test (o resto da URL fica) e fixando
#     FOCUSQUEST_E2E_PORT_OFFSET -- o passado, ou o menor livre de 1 a 24;
#  3. roda "make bootstrap" nele;
#  4. imprime os proximos passos.
#
# O que NAO faz, de proposito:
#  - nao cria o banco: ele nasce sozinho no primeiro uso (a fixture "engine"
#    da suite pytest ou "make reset-test-db"), atras da guarda de nome;
#  - nao roda "make db-up": o PostgreSQL e o do principal, e o compose, chamado
#    de outro diretorio, RECRIA o container (o bind do init-test-db.sql muda de
#    caminho -- medido com "docker compose up --dry-run"), derrubando o gate
#    que estiver rodando em qualquer worktree;
#  - nao instala hooks: eles moram no .git comum, e ja valem para o worktree
#    novo.
#
# Recusa, sem criar nada: nome fora de [a-z0-9-] (ou comecando com hifen, ou
# acima de 30 caracteres -- o nome vira diretorio, branch e banco, e o banco do
# push, focusquest_<nome>_push_test, precisa caber nos 63 bytes do
# PostgreSQL); destino ou branch que ja existam; deslocamento fora de 0 a 24 ou
# ja em uso por outro worktree; .env do principal ausente ou com um banco de
# teste que nao termine em _test. E NUNCA escreve por cima de um .env que ja
# exista no destino.
set -euo pipefail

uso() {
  echo "uso: scripts/novo-worktree.sh <nome> [deslocamento]" >&2
  exit 64
}

recusa() {
  echo "!! $1" >&2
  exit 1
}

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || uso
nome="$1"
pedido="${2:-}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# A reserva de portas do pre-push (FQ_RESERVA_DO_PUSH) mora na biblioteca do
# check-push.sh; os worktrees ficam ABAIXO dela. Carregar a biblioteca, em vez
# de repetir o numero, mantem uma fonte so para a faixa.
# shellcheck source=scripts/push-env.sh
. "${ROOT}/scripts/push-env.sh"
teto=$((FQ_RESERVA_DO_PUSH - 1))

if ! [[ $nome =~ ^[a-z0-9][a-z0-9-]*$ ]] || [ "${#nome}" -gt 30 ]; then
  recusa "nome invalido '${nome}': use so [a-z0-9-], comecando por letra ou digito, com ate 30 caracteres"
fi

# O principal e o PRIMEIRO worktree da lista (o dono do .git), e nao
# necessariamente este: o script pode ser chamado de dentro de outro worktree.
principal="$(git -C "$ROOT" worktree list --porcelain | sed -n '1s/^worktree //p')"
destino="$(dirname "$principal")/$(basename "$principal")-${nome}"
branch="wt/${nome}"

[ -e "$destino" ] && recusa "o destino ${destino} ja existe; escolha outro nome"
if git -C "$principal" show-ref --verify --quiet "refs/heads/${branch}"; then
  recusa "a branch ${branch} ja existe; escolha outro nome"
fi
[ -f "${principal}/.env" ] || recusa "o principal nao tem .env (${principal}/.env): crie-o com cp .env.example .env"

# O valor de uma chave num .env, sem executar o arquivo (mesma regra do
# push-env.sh): ultima ocorrencia, aspas envolventes removidas.
valor_no_env() {
  local arquivo="$1" chave="$2" linha valor=""
  while IFS= read -r linha || [ -n "$linha" ]; do
    linha="${linha%$'\r'}"
    if [[ $linha == "${chave}="* ]]; then
      valor="${linha#*=}"
      valor="${valor#[\"\']}"
      valor="${valor%[\"\']}"
    fi
  done <"$arquivo"
  printf '%s' "$valor"
}

# Os deslocamentos em uso: o de cada worktree registrado, lido do .env dele.
# Sem a linha (ou vazia), e 0 -- o padrao, o do principal.
em_uso=" "
while IFS= read -r caminho; do
  valor=""
  if [ -f "${caminho}/.env" ]; then
    valor="$(valor_no_env "${caminho}/.env" FOCUSQUEST_E2E_PORT_OFFSET)"
  fi
  [[ $valor =~ ^[0-9]+$ ]] || valor=0
  em_uso="${em_uso}$((10#$valor)) "
done < <(git -C "$principal" worktree list --porcelain | sed -n 's/^worktree //p')

if [ -n "$pedido" ]; then
  if ! [[ $pedido =~ ^[0-9]+$ ]] || ((10#$pedido > teto)); then
    recusa "deslocamento invalido '${pedido}': esperado um inteiro de 0 a ${teto} (de ${FQ_RESERVA_DO_PUSH} em diante a faixa e do pre-push)"
  fi
  deslocamento=$((10#$pedido))
  if [[ $em_uso == *" ${deslocamento} "* ]]; then
    recusa "o deslocamento ${deslocamento} ja esta em uso por outro worktree (em uso:${em_uso% })"
  fi
else
  deslocamento=""
  for candidato in $(seq 1 "$teto"); do
    if [[ $em_uso != *" ${candidato} "* ]]; then
      deslocamento="$candidato"
      break
    fi
  done
  [ -n "$deslocamento" ] || recusa "nenhum deslocamento livre de 1 a ${teto}; remova um worktree antigo"
fi

# O banco de teste: so o NOME muda (o ultimo segmento do caminho, antes da
# query); servidor, credencial e opcoes ficam os do principal.
url="$(valor_no_env "${principal}/.env" FOCUSQUEST_TEST_DATABASE_URL)"
base="${url%%\?*}"
consulta="${url:${#base}}"
[[ ${base##*/} =~ _test$ ]] || recusa "FOCUSQUEST_TEST_DATABASE_URL do .env do principal nao aponta para um banco que termine em _test"
banco="focusquest_${nome}_test"
url_nova="${base%/*}/${banco}${consulta}"

# O .env novo, montado ANTES de criar qualquer coisa: as linhas do principal,
# com o banco de teste trocado e sem deslocamento herdado; o deslocamento do
# worktree novo vai no fim.
env_novo=""
while IFS= read -r linha || [ -n "$linha" ]; do
  case "$linha" in
    FOCUSQUEST_TEST_DATABASE_URL=*) linha="FOCUSQUEST_TEST_DATABASE_URL=${url_nova}" ;;
    FOCUSQUEST_E2E_PORT_OFFSET=*) continue ;;
  esac
  env_novo="${env_novo}${linha}
"
done <"${principal}/.env"
env_novo="${env_novo}
# Worktree ${nome} (scripts/novo-worktree.sh): banco de teste e portas do E2E
# proprios, para rodar o gate ao mesmo tempo que os outros worktrees.
FOCUSQUEST_E2E_PORT_OFFSET=${deslocamento}
"

git -C "$principal" worktree add --quiet -b "$branch" "$destino" main

# noclobber: o redirecionamento falha se o arquivo ja existir, sem janela
# entre conferir e escrever.
if ! (set -o noclobber && printf '%s' "$env_novo" >"${destino}/.env") 2>/dev/null; then
  recusa "ja existe um .env em ${destino} e ele NAO foi sobrescrito; o worktree foi criado, mas o bootstrap nao rodou -- confira o .env a mao"
fi

make -C "$destino" bootstrap

cat <<FIM
==> worktree pronto: ${destino} (branch ${branch})
    banco de teste:  ${banco} (nasce sozinho no primeiro uso)
    portas do E2E:   API $((8100 + deslocamento)), frontend $((5273 + deslocamento)), falso $((8150 + deslocamento)) (deslocamento ${deslocamento})
proximos passos:
    cd ${destino}
    make check
nao rode "make db-up" neste worktree: o PostgreSQL e o do principal, e o compose
recriaria o container (docs/QUALITY.md secao 6). Os hooks de git ja valem aqui.
FIM
