#!/usr/bin/env bash
# Cria um worktree interno ao principal, pronto para rodar o gate AO MESMO TEMPO
# que o principal e que os outros worktrees (pendencia 19, docs/QUALITY.md
# secao 4).
#
#   uso: scripts/novo-worktree.sh <nome> [deslocamento]
#
# O que faz, nesta ordem, e so depois de validar TUDO:
#  1. cria .claude/worktrees/<nome> dentro do principal numa branch nova,
#     wt/<nome>, a partir da main atual;
#  2. escreve o .env dele a partir do .env.example da main (a mesma revisao do
#     worktree), com o banco de teste do principal trocado para
#     focusquest_<nome>_test (servidor, credencial e opcoes da URL ficam) e
#     FOCUSQUEST_E2E_PORT_OFFSET -- o passado, ou o menor livre de 1 a 24;
#     do .env do principal so a URL do banco de teste e lida. Nenhum outro
#     valor dele e copiado: as chaves de segredo (FOCUSQUEST_ANTHROPIC_API_KEY e
#     afins) nascem em branco, como no exemplo, e quem precisar delas no
#     worktree as preenche a mao;
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
# PostgreSQL); o nome reservado "push"; um nome cujo banco (ou banco do push)
# ja seja o banco, ou o banco do push, de um worktree registrado; destino ou
# branch que ja existam; deslocamento fora de 0 a 24 ou ja em uso por outro
# worktree; .env do principal ausente ou com um banco de teste que nao termine
# em _test; main sem .env.example; outra execucao em andamento (a trava). E
# NUNCA escreve por cima de um .env que ja exista no destino.
#
# Por que "push" e o UNICO nome reservado (HANDOFF, decisao F12): o banco de
# um worktree e focusquest_<nome>_test, e o gate do push de quem tem o banco
# R_test usa R_push_test (banco_do_push, em push-env.sh). Os dois so coincidem
# se "focusquest_<nome>" terminar em "_push"; como <nome> nao tem "_", o unico
# "_" ali e o do prefixo, e isso so acontece com <nome> = "push" -- o banco
# focusquest_push_test, o do push do principal padrao. "a-push" nao colide com
# o push de "a" (focusquest_a-push_test contra focusquest_a_push_test). O
# sentido contrario (o push do worktree novo, focusquest_<nome>_push_test,
# igual ao banco de alguem) nao casa com nenhum banco criado por este script
# pela mesma razao; so um .env editado a mao casaria, e para ele existe a
# conferencia contra os worktrees registrados.
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
if [ "$nome" = push ]; then
  recusa "nome reservado 'push': o banco dele, focusquest_push_test, e o banco do gate do push do principal (o pre-push faria DROP SCHEMA nele no meio da suite); escolha outro nome"
fi

# O principal e o PRIMEIRO worktree da lista (o dono do .git), e nao
# necessariamente este: o script pode ser chamado de dentro de outro worktree.
principal="$(git -C "$ROOT" worktree list --porcelain | sed -n '1s/^worktree //p')"
destino="${principal}/.claude/worktrees/${nome}"
ledger="${principal}/.superpowers/sdd/worktree-ledgers/${nome}"
branch="wt/${nome}"

# Nao seguir links nos containers: o destino deve permanecer no principal.
# Conferir antes de criar pais, branch ou worktree.
for relativo in .claude .claude/worktrees .superpowers .superpowers/sdd .superpowers/sdd/worktree-ledgers; do
  caminho="${principal}/${relativo}"
  if [ -L "$caminho" ] || { [ -e "$caminho" ] && [ ! -d "$caminho" ]; }; then
    recusa "container ${caminho} deve ser diretorio real, nao arquivo ou link"
  fi
done
{ [ -e "$ledger" ] || [ -L "$ledger" ]; } && recusa "o ledger ${ledger} ja existe; escolha outro nome"

{ [ -e "$destino" ] || [ -L "$destino" ]; } && recusa "o destino ${destino} ja existe; escolha outro nome"
if git -C "$principal" show-ref --verify --quiet "refs/heads/${branch}"; then
  recusa "a branch ${branch} ja existe; escolha outro nome"
fi
[ -f "${principal}/.env" ] || recusa "o principal nao tem .env (${principal}/.env): crie-o com cp .env.example .env"
# O modelo do .env novo: o .env.example da main, de onde o worktree nasce.
exemplo="$(git -C "$principal" show main:.env.example 2>/dev/null)" ||
  recusa "a main nao tem .env.example: o .env do worktree e gerado a partir dele"

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

# A trava: da leitura do que os worktrees usam ate o .env novo estar escrito.
# Sem ela, duas execucoes ao mesmo tempo leriam os mesmos deslocamentos livres
# e escolheriam o mesmo (o .env da primeira ainda nao existe quando a segunda
# le). "mkdir" e atomico e existe em qualquer sistema (o "flock" nao vem no
# macOS). Uma execucao morta por SIGKILL deixa o diretorio para tras; a
# mensagem diz como sair disso (docs/QUALITY.md secao 6).
comum="$(cd "$principal" && cd "$(git rev-parse --git-common-dir)" && pwd)"
trava="${comum}/novo-worktree.lock"
if ! mkdir "$trava" 2>/dev/null; then
  recusa "outra execucao do novo-worktree.sh esta em andamento (trava ${trava}); espere ela terminar -- se nenhuma estiver rodando, a trava sobrou de uma execucao interrompida: apague-a com rmdir ${trava}"
fi
liberar_trava() {
  rmdir "$trava"
}
trap liberar_trava EXIT

# O que cada worktree registrado usa, lido do .env dele: o deslocamento (sem a
# linha, ou vazia, e 0 -- o padrao, o do principal) e os bancos -- o de teste
# e o do push derivado dele. Um worktree sem .env, ou com um banco que nao
# termine em _test, nao roda gate nenhum e nao ocupa banco.
em_uso=" "
bancos_ocupados=""
while IFS= read -r caminho; do
  valor=""
  if [ -f "${caminho}/.env" ]; then
    valor="$(valor_no_env "${caminho}/.env" FOCUSQUEST_E2E_PORT_OFFSET)"
    url_dele="$(valor_no_env "${caminho}/.env" FOCUSQUEST_TEST_DATABASE_URL)"
    base_dele="${url_dele%%\?*}"
    banco_dele="${base_dele##*/}"
    if [ "$banco_dele" != "$base_dele" ] && [[ $banco_dele =~ ^.+_test$ ]]; then
      bancos_ocupados="${bancos_ocupados}${banco_dele} ${caminho} (banco de teste)
$(banco_do_push "$banco_dele") ${caminho} (banco do push)
"
    fi
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

# O banco novo e o banco do push dele nao podem ser nem o banco nem o banco do
# push de nenhum worktree registrado (o principal incluido).
banco_push="$(banco_do_push "$banco")"
while IFS=' ' read -r ocupado dono; do
  if [ "$ocupado" = "$banco" ] || [ "$ocupado" = "$banco_push" ]; then
    recusa "o nome '${nome}' daria o banco ${banco} (e ${banco_push} no push), mas ${ocupado} ja e usado por ${dono}; escolha outro nome"
  fi
done <<<"$bancos_ocupados"

# O .env novo, montado ANTES de criar qualquer coisa: as linhas do
# .env.example, com o banco de teste trocado e sem deslocamento; o
# deslocamento do worktree novo vai no fim. Partir do exemplo, e nao do .env
# do principal, e o que garante que nenhum segredo dele passe para o worktree.
env_novo=""
banco_escrito=nao
while IFS= read -r linha || [ -n "$linha" ]; do
  case "$linha" in
    FOCUSQUEST_TEST_DATABASE_URL=*)
      linha="FOCUSQUEST_TEST_DATABASE_URL=${url_nova}"
      banco_escrito=sim
      ;;
    FOCUSQUEST_E2E_PORT_OFFSET=*) continue ;;
  esac
  env_novo="${env_novo}${linha}
"
done <<<"$exemplo"
# Sem a linha no exemplo, o worktree cairia no banco padrao, o do principal.
if [ "$banco_escrito" = nao ]; then
  env_novo="${env_novo}FOCUSQUEST_TEST_DATABASE_URL=${url_nova}
"
fi
env_novo="${env_novo}
# Worktree ${nome} (scripts/novo-worktree.sh): banco de teste e portas do E2E
# proprios, para rodar o gate ao mesmo tempo que os outros worktrees.
FOCUSQUEST_E2E_PORT_OFFSET=${deslocamento}
"

mkdir -p "${principal}/.claude/worktrees" "${principal}/.superpowers/sdd/worktree-ledgers"
git -C "$principal" worktree add --quiet -b "$branch" "$destino" main

# noclobber: o redirecionamento falha se o arquivo ja existir, sem janela
# entre conferir e escrever. A conferencia ANTES serve so para a mensagem: a
# escrita tambem falha por outra causa (disco cheio, permissao), e dizer "ja
# existe" nesse caso mandaria procurar um arquivo que nao esta la. Ela nao e
# feita DEPOIS porque uma escrita que falhou pela metade deixa o arquivo.
env_existia=nao
[ ! -e "${destino}/.env" ] || env_existia=sim
if ! erro_da_escrita="$( (set -o noclobber && printf '%s' "$env_novo" >"${destino}/.env") 2>&1)"; then
  if [ "$env_existia" = sim ]; then
    recusa "ja existe um .env em ${destino} e ele NAO foi sobrescrito; o worktree foi criado, mas o bootstrap nao rodou -- confira o .env a mao"
  fi
  recusa "nao foi possivel escrever ${destino}/.env (${erro_da_escrita}); o worktree foi criado, mas o bootstrap nao rodou -- confira o espaco em disco e as permissoes e escreva o .env a mao"
fi
# Somente o scratch sdd fica centralizado na isencao JA existente do scanner.
# Fontes e .superpowers/notas continuam sendo varridas. Nao sobrescrever dados.
scratch="${destino}/.superpowers"
if [ -L "$scratch" ] || { [ -e "$scratch" ] && [ ! -d "$scratch" ]; } ||
  [ -e "${scratch}/sdd" ] || [ -L "${scratch}/sdd" ]; then
  recusa "scratch ${scratch}/sdd ja existe ou tem container inseguro; worktree criado, bootstrap nao executado, dados preservados"
fi
mkdir "$ledger"
mkdir -p "${destino}/.superpowers"
ln -s "../../../../.superpowers/sdd/worktree-ledgers/${nome}" "${destino}/.superpowers/sdd"
liberar_trava
trap - EXIT

make -C "$destino" bootstrap

cat <<FIM
==> worktree pronto: ${destino} (branch ${branch})
    banco de teste:  ${banco} (nasce sozinho no primeiro uso)
    portas do E2E:   API $((8100 + deslocamento)), frontend $((5273 + deslocamento)), falso $((8150 + deslocamento)), galeria $((5373 + deslocamento)) (deslocamento ${deslocamento})
proximos passos:
    cd ${destino}
    make check
nao rode "make db-up" neste worktree: o PostgreSQL e o do principal, e o compose
recriaria o container (docs/QUALITY.md secao 6). Os hooks de git ja valem aqui.
FIM
