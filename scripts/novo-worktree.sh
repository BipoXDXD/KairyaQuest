#!/usr/bin/env bash
# Cria um worktree interno ao principal, pronto para rodar o gate AO MESMO TEMPO
# que o principal e que os outros worktrees (pendencia 19, docs/QUALITY.md
# secao 4).
#
#   uso: scripts/novo-worktree.sh <nome> [deslocamento]
#
# O que faz, nesta ordem, e so depois de validar TUDO:
#  1. cria .claude/worktrees/<nome> dentro do principal numa branch nova,
#     wt/<nome>, a partir da origin/main -- depois de um "git fetch origin
#     main" feito pelo proprio script (lote 21, abaixo);
#  2. escreve o .env dele SO a partir do .env.example da origin/main (a mesma
#     revisao do worktree), com duas linhas calculadas: o banco de teste,
#     focusquest_<nome>_test (servidor, credencial e opcoes da URL sao os do
#     PROPRIO exemplo), e FOCUSQUEST_E2E_PORT_OFFSET -- o passado, ou o PRIMEIRO
#     livre de 1 ao teto (24 por padrao; ver "O que e um deslocamento livre",
#     abaixo). Nenhuma linha, nenhum valor do .env do principal e lido para
#     montar o .env novo (lote 21): ele pode ter chave que o exemplo nao conhece
#     (as Settings recusam chave extra) e segredo real. As chaves de segredo
#     (FOCUSQUEST_ANTHROPIC_API_KEY e afins) nascem em branco, como no exemplo, e
#     quem precisar delas no worktree as preenche a mao. O .env do principal so
#     e lido para saber que bancos e deslocamentos os worktrees registrados
#     (ele incluso) ja ocupam, sem copiar nada;
#  3. roda "make bootstrap" nele;
#  4. imprime os proximos passos.
#
# A base e a origin/main, nunca a main local (lote 21, P-worktree-base-1). O
# principal deste projeto e um repositorio bare: ali "git fetch" so atualiza a
# origin/main, e a main local fica parada no ultimo commit feito nele. Nascer
# dela dava um worktree numa revisao velha, com um .env.example velho (e um .env
# que as Settings recusavam). O script faz o fetch ele mesmo, com refspec
# explicito (+refs/heads/main:refs/remotes/origin/main, que vale mesmo num
# principal sem "remote.origin.fetch"), para a base nao depender de alguem
# lembrar de buscar.
#
# Se o fetch falhar (sem rede, sem remoto origin, sem a branch main no remoto),
# o script RECUSA, sem criar worktree, branch, ledger nem .env, e diz o que fazer.
# (Unico efeito que sobra de uma recusa depois de um fetch bem-sucedido: a ref
# refs/remotes/origin/main ja avancou, mesmo se uma recusa posterior abortar. E o
# que um "git fetch" faz, e nao muda nada que o usuario tenha.) O erro do git vai
# junto na mensagem, com a credencial da URL do remoto mascarada. Nao ha fallback para a main
# local: criar dela em silencio reproduziria o defeito sem aviso. A origin/main
# que sobrou de um fetch antigo tambem nao serve de base -- sem fetch bem
# sucedido, nao ha base. O fetch roda DEPOIS de todas as recusas locais (nome,
# destino, deslocamento, bancos, trava) e logo antes de criar
# o worktree, entao uma recusa que nao precisa de rede nao depende dela. A branch
# nasce de um sha, e o git nao rastreia um sha: um "git push" sem argumento nao
# mira a main protegida (partir do nome "origin/main" faria o git configurar o
# rastreio).
#
# O que NAO faz, de proposito:
#  - nao cria o banco: ele nasce sozinho no primeiro uso (a fixture "engine"
#    da suite pytest ou "make reset-test-db"), atras da guarda de nome;
#  - nao roda "make db-up": o PostgreSQL e o do principal, e o compose, chamado
#    de outro diretorio, RECRIA o container (o bind do init-test-db.sql muda de
#    caminho -- medido com "docker compose up --dry-run"), derrubando o gate
#    que estiver rodando em qualquer worktree;
#  - nao instala hooks, e nunca deve rodar "pre-commit install": eles moram no
#    .git comum e ja valem para o worktree novo. Um "pre-commit install" aqui
#    gravaria no .git comum o .venv DESTE worktree, e remove-lo quebraria os
#    hooks de todos (lote 20). Quem instala ou atualiza os hooks e o script
#    unico scripts/instalar-hooks.sh, uma vez por clone, com um venv dedicado
#    fora de qualquer worktree.
#
# O que e um deslocamento livre (lote 19b). Os dois testes valem, nesta ordem:
#  1. nenhum worktree registrado o reivindica no .env dele (um worktree parado
#     nao escuta porta nenhuma, e dois parados nao podem levar o mesmo valor);
#  2. nenhuma das QUATRO portas que ele implica -- API, frontend, falso da
#     Anthropic e galeria de estados, base + deslocamento -- tem alguem
#     escutando em 127.0.0.1 agora. A sondagem e um connect de verdade
#     (/dev/tcp do bash: existe no macOS e no Linux, sem lsof nem python); so
#     "Connection refused" conta como porta livre -- qualquer outro resultado
#     (connect que nao concluiu em SONDA_TIMEOUT_PADRAO_S segundos, /dev/tcp
#     ausente, erro de rede) recusa, e nao aprova no escuro. O limite e real:
#     uma porta com DROP no firewall deixaria o connect pendurado por minutos,
#     e o macOS nao tem `timeout`; por isso o connect roda em segundo plano e o
#     script o mata pelo PID proprio quando o prazo estoura.
# Alocar e pegar o PRIMEIRO que passa nos dois. Por que a sondagem: a regra
# antiga olhava so os .env, e worktrees de PRs ja mesclados seguiam segurando
# deslocamento para sempre -- e um processo solto na porta so aparecia no meio
# do gate. A reivindicacao continua valendo: remover o worktree antigo
# (git worktree remove) e o que devolve o deslocamento dele.
#
# O teto e o MENOR de dois limites, os dois derivados, nenhum escrito a mao:
#  - a reserva do pre-push: FQ_RESERVA_DO_PUSH - 1 (24); de 25 a 49 e do push,
#    e 49 e o limite do servers.ts (o vao entre a API e o falso, menos um);
#  - o fim do espaco de portas: 65535 menos a MAIOR base (hoje 8150 -> 57385,
#    muito acima de 24; so aperta se alguem mover as bases para o topo).
# As bases NAO colidem com outras portas do projeto: 8000 e 5173 sao as de
# desenvolvimento, a do PostgreSQL (FOCUSQUEST_DB_PORT) fica fora de todas as
# faixas, e as quatro faixas (8100-8124, 8150-8174, 5273-5297, 5373-5397 para
# 0 a 24) sao disjuntas entre si.
#
# As bases moram no servers.ts (a fonte). O padrao abaixo e uma copia, e
# tests/integration/test_novo_worktree.py a confere contra ele. A variavel
# FQ_PORTAS_BASE_E2E ("api web falso galeria") existe para os testes apontarem
# a sondagem para uma janela propria; ninguem precisa dela no dia a dia. Do
# mesmo tipo, so para teste: FQ_SONDA_TIMEOUT (inteiro >= 1, segundos; encurta o
# limite) e FQ_SONDA_SIMULA ("travada" ou "erro"; troca o connect por uma sonda
# que trava ou que falha sem ser recusada, sem depender da rede).
#
# Recusa, sem criar nada: nome fora de [a-z0-9-] (ou comecando com hifen, ou
# acima de 30 caracteres -- o nome vira diretorio, branch e banco, e o banco do
# push, focusquest_<nome>_push_test, precisa caber nos 63 bytes do
# PostgreSQL); o nome reservado "push"; um nome cujo banco (ou banco do push)
# ja seja o banco, ou o banco do push, de um worktree registrado; destino ou
# branch que ja existam; deslocamento fora de 0 ao teto, reivindicado por outro
# worktree ou com porta em uso; fetch da origin/main que falha; origin/main sem
# .env.example, ou com um .env.example sem FOCUSQUEST_TEST_DATABASE_URL ou com um
# banco que nao termine em _test (o .env do principal nao e necessario); outra execucao em andamento (a trava). E
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
portas_base="${FQ_PORTAS_BASE_E2E:-8100 5273 8150 5373}"
# Limite de cada sondagem de porta (sonda_porta): quanto o connect pode levar
# antes de a porta contar como "nao sondavel". 2 s sobra para um connect local
# (refused e imediato). A sondagem de um candidato para na primeira porta que
# reprova, entao o pior caso e um limite por candidato: 24 x 2 s na alocacao
# automatica.
SONDA_TIMEOUT_PADRAO_S=2
SONDA_PASSO_S=0.02
SONDA_PASSOS_POR_S=50
sonda_timeout="${FQ_SONDA_TIMEOUT:-$SONDA_TIMEOUT_PADRAO_S}"
read -r -a bases <<<"$portas_base"
maior_base=0
if [ "${#bases[@]}" -ne 4 ]; then
  recusa "FQ_PORTAS_BASE_E2E='${portas_base}' invalida: esperadas quatro portas (api web falso galeria)"
fi
for base in "${bases[@]}"; do
  if ! [[ $base =~ ^[0-9]+$ ]] || ((10#$base < 1 || 10#$base > 65535)); then
    recusa "FQ_PORTAS_BASE_E2E='${portas_base}' invalida: cada porta-base deve ser um inteiro de 1 a 65535"
  fi
  ((10#$base > maior_base)) && maior_base=$((10#$base))
done
if ! [[ $sonda_timeout =~ ^[0-9]+$ ]] || ((10#$sonda_timeout < 1)); then
  recusa "FQ_SONDA_TIMEOUT='${sonda_timeout}' invalido: esperado um inteiro de segundos, 1 ou mais"
fi
sonda_timeout=$((10#$sonda_timeout))
teto=$((FQ_RESERVA_DO_PUSH - 1))
((65535 - maior_base < teto)) && teto=$((65535 - maior_base))

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
reivindicados=""
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
  reivindicados="${reivindicados}$((10#$valor)) ${caminho}
"
done < <(git -C "$principal" worktree list --porcelain | sed -n 's/^worktree //p')

# sonda_porta PORTA: 0 se ninguem escuta, 1 se alguem escuta, 2 se nao deu para
# saber (erro que nao e "recusada", ou o connect nao concluiu dentro do limite).
# LC_ALL=C fixa o texto do erro do bash ("Connection refused"), que e o unico
# sinal de porta livre aceito. O connect roda num subshell em segundo plano; o
# laco abaixo o vigia de SONDA_PASSO_S em SONDA_PASSO_S e, estourado o limite,
# o mata pelo PID dele (o do proprio subshell, nao o de um grupo) e devolve 2.
# O limite e aproximado: cada passo custa um pouco mais que SONDA_PASSO_S.
sonda_porta() {
  local porta="$1" arquivo pid passos=0 status=0 erro
  local passos_maximos=$((sonda_timeout * SONDA_PASSOS_POR_S))
  arquivo="$(mktemp)"
  (
    export LC_ALL=C
    case "${FQ_SONDA_SIMULA:-}" in
      travada) exec sleep $((sonda_timeout + 60)) ;;
      erro)
        echo "bash: connect: Network is unreachable" >&2
        exit 1
        ;;
    esac
    exec 3<>"/dev/tcp/127.0.0.1/${porta}"
  ) 2>"$arquivo" &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if ((passos >= passos_maximos)); then
      kill "$pid" 2>/dev/null || true
      { wait "$pid"; } 2>/dev/null || true
      rm -f "$arquivo"
      return 2
    fi
    sleep "$SONDA_PASSO_S"
    passos=$((passos + 1))
  done
  { wait "$pid"; } 2>/dev/null || status=$?
  erro="$(cat "$arquivo")"
  rm -f "$arquivo"
  if [ "$status" -eq 0 ]; then
    return 1
  fi
  case "$erro" in
    *"Connection refused"*) return 0 ;;
  esac
  return 2
}

# motivo_de_ocupacao DESLOCAMENTO: deixa em $motivo por que o deslocamento nao
# serve (vazio = livre). A reivindicacao no .env vem antes da sondagem das
# portas, e a sondagem para na primeira porta que reprova.
motivo=""
motivo_de_ocupacao() {
  local candidato="$1" off dono porta base resultado
  motivo=""
  while IFS=' ' read -r off dono; do
    if [ -n "$off" ] && [ "$off" = "$candidato" ]; then
      motivo="em uso por outro worktree: reivindicado no .env de ${dono}"
      return 0
    fi
  done <<<"$reivindicados"
  for base in "${bases[@]}"; do
    porta=$((10#$base + candidato))
    resultado=0
    sonda_porta "$porta" || resultado=$?
    case "$resultado" in
      1)
        motivo="porta ${porta} em uso por outro processo"
        return 0
        ;;
      2)
        motivo="porta ${porta} nao pode ser sondada (conexao a 127.0.0.1:${porta} falhou sem ser recusada)"
        return 0
        ;;
    esac
  done
}

pulados=""
if [ -n "$pedido" ]; then
  if ! [[ $pedido =~ ^[0-9]+$ ]] || ((10#$pedido > teto)); then
    recusa "deslocamento invalido '${pedido}': esperado um inteiro de 0 a ${teto} (de ${FQ_RESERVA_DO_PUSH} em diante a faixa e do pre-push; acima de $((65535 - maior_base)) a porta passaria de 65535)"
  fi
  deslocamento=$((10#$pedido))
  motivo_de_ocupacao "$deslocamento"
  if [ -n "$motivo" ]; then
    recusa "o deslocamento ${deslocamento} nao esta livre: ${motivo}"
  fi
else
  deslocamento=""
  for candidato in $(seq 1 "$teto"); do
    motivo_de_ocupacao "$candidato"
    if [ -z "$motivo" ]; then
      deslocamento="$candidato"
      break
    fi
    pulados="${pulados}    ${candidato}: ${motivo}
"
  done
  if [ -z "$deslocamento" ]; then
    recusa "nenhum deslocamento livre de 1 a ${teto} (o teto e o menor entre a reserva do pre-push, $((FQ_RESERVA_DO_PUSH - 1)), e 65535 menos a maior porta-base, $((65535 - maior_base)))
${pulados}remova um worktree antigo (git worktree remove <caminho>) ou encerre o processo que segura a porta"
  fi
fi

# O nome do banco de teste do worktree novo. A URL (servidor, credencial,
# opcoes) so e montada depois do fetch, a partir do .env.example da origin/main.
banco="focusquest_${nome}_test"

# O banco novo e o banco do push dele nao podem ser nem o banco nem o banco do
# push de nenhum worktree registrado (o principal incluido).
banco_push="$(banco_do_push "$banco")"
while IFS=' ' read -r ocupado dono; do
  if [ "$ocupado" = "$banco" ] || [ "$ocupado" = "$banco_push" ]; then
    recusa "o nome '${nome}' daria o banco ${banco} (e ${banco_push} no push), mas ${ocupado} ja e usado por ${dono}; escolha outro nome"
  fi
done <<<"$bancos_ocupados"

# A base: a origin/main, buscada AGORA, depois de TODAS as recusas locais
# (nome, destino, deslocamento, bancos, trava) e logo antes
# de criar qualquer coisa -- uma recusa que nao precisa de rede nao depende
# dela. Dentro da trava, de proposito: ler o remoto fora dela deixaria duas
# execucoes verem bases diferentes; o custo e que um fetch lento segura a trava
# (a outra execucao recusa com a mensagem da trava).
# O refspec e EXPLICITO: sem "remote.origin.fetch" (um principal feito com
# "git clone --bare"), "git fetch origin main" sai com 0 e so avanca o
# FETCH_HEAD, deixando a origin/main velha ou ausente -- base errada sem aviso.
# Sem fetch bem-sucedido nao ha base: recusa, sem cair na main local (que, num
# bare, esta parada). GIT_TERMINAL_PROMPT=0 impede o git de esperar uma
# credencial que ninguem vai digitar.
if ! erro_do_fetch="$(GIT_TERMINAL_PROMPT=0 git -C "$principal" fetch --quiet origin '+refs/heads/main:refs/remotes/origin/main' 2>&1)"; then
  # O git repete a URL do remoto no erro, e ela pode levar usuario e senha:
  # "://usuario:senha@" vira "://***@" antes de a mensagem sair.
  erro_do_fetch="$(printf '%s' "$erro_do_fetch" | sed -E 's#(://)[^/@[:space:]]*@#\1***@#g')"
  recusa "o fetch de origin/main falhou (sem rede, sem o remoto origin ou sem a branch main nele?); o worktree nasce da origin/main atualizada e nunca da main local, entao nada foi criado. Erro do git: ${erro_do_fetch:-<sem mensagem>}"
fi
base_da_branch="$(git -C "$principal" rev-parse --verify --quiet 'refs/remotes/origin/main^{commit}')" ||
  recusa "depois do fetch, origin/main nao resolve para um commit"
# O modelo do .env novo: o .env.example da origin/main, de onde o worktree nasce.
exemplo="$(git -C "$principal" show "${base_da_branch}:.env.example" 2>/dev/null)" ||
  recusa "a origin/main nao tem .env.example: o .env do worktree e gerado a partir dele"

# A URL do banco de teste do worktree: o FOCUSQUEST_TEST_DATABASE_URL do
# .env.example com so o NOME do banco trocado; servidor, credencial e opcoes
# ficam os do exemplo. Nada vem do .env do principal (lote 21): copiar dali
# arrastaria credencial real, e a variavel que o exemplo nao conhece. Sem a
# linha no exemplo nao ha de onde derivar -- recusa, em vez de cair no banco
# padrao (o do principal).
url="$(valor_no_env <(printf '%s\n' "$exemplo") FOCUSQUEST_TEST_DATABASE_URL)"
[ -n "$url" ] ||
  recusa "o .env.example da origin/main nao tem FOCUSQUEST_TEST_DATABASE_URL: e dele que o script tira servidor e credencial do banco de teste do worktree"
base="${url%%\?*}"
consulta="${url:${#base}}"
[[ ${base##*/} =~ _test$ ]] ||
  recusa "FOCUSQUEST_TEST_DATABASE_URL do .env.example da origin/main nao aponta para um banco que termine em _test"
url_nova="${base%/*}/${banco}${consulta}"

# O .env novo, montado ANTES de criar qualquer coisa: as linhas do
# .env.example, com o banco de teste trocado e sem deslocamento; o
# deslocamento do worktree novo vai no fim. Partir do exemplo, e nao do .env
# do principal, e o que garante que nenhum segredo dele passe para o worktree.
env_novo=""
while IFS= read -r linha || [ -n "$linha" ]; do
  case "$linha" in
    FOCUSQUEST_TEST_DATABASE_URL=*)
      linha="FOCUSQUEST_TEST_DATABASE_URL=${url_nova}"
      ;;
    FOCUSQUEST_E2E_PORT_OFFSET=*) continue ;;
  esac
  env_novo="${env_novo}${linha}
"
done <<<"$exemplo"
env_novo="${env_novo}
# Worktree ${nome} (scripts/novo-worktree.sh): banco de teste e portas do E2E
# proprios, para rodar o gate ao mesmo tempo que os outros worktrees.
FOCUSQUEST_E2E_PORT_OFFSET=${deslocamento}
"

mkdir -p "${principal}/.claude/worktrees" "${principal}/.superpowers/sdd/worktree-ledgers"
git -C "$principal" worktree add --quiet -b "$branch" "$destino" "$base_da_branch"

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
    portas do E2E:   API $((10#${bases[0]} + deslocamento)), frontend $((10#${bases[1]} + deslocamento)), falso $((10#${bases[2]} + deslocamento)), galeria $((10#${bases[3]} + deslocamento)) (deslocamento ${deslocamento})
${pulados:+deslocamentos pulados antes de ${deslocamento}:
${pulados}}proximos passos:
    cd ${destino}
    make check
nao rode "make db-up" neste worktree: o PostgreSQL e o do principal, e o compose
recriaria o container (docs/QUALITY.md secao 6). Os hooks de git moram no .git
comum e ja valem aqui: nao rode "pre-commit install" neste worktree. Para
instalar ou atualizar os hooks, use scripts/instalar-hooks.sh (uma vez por
clone); "make check-hooks" confere se eles apontam para fora de worktrees.
FIM
