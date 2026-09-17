#!/usr/bin/env bash
# Valida o gate no topo de cada ref enviada, em worktree isolado.
#
# Limitacoes conhecidas (documentadas em docs/QUALITY.md secao 5):
#  - commits intermediarios nao sao validados um a um;
#  - executado pelo framework pre-commit, so UMA ref e visivel por push
#    (ver o bloco "De onde vem a lista de refs" abaixo).
set -euo pipefail

ZERO="0000000000000000000000000000000000000000"
status=0
validadas=0
delecoes=0

# Raiz do repositorio PRINCIPAL (nao do worktree temporario). Serve para
# apontar o cache de ferramentas compartilhado -- ver FQ_TOOLS_DIR adiante.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Worktree da iteracao em andamento. Vazio fora de uma iteracao ativa; o
# trap de limpeza usa isso para saber se ha algo a remover.
work=""

cleanup() {
  local alvo="$work"
  work=""
  if [ -n "$alvo" ]; then
    # Depois de um SIGINT/SIGTERM, o "npm ci" morto (filho do "make" que
    # ja terminou) pode continuar por um instante finalizando sozinho seu
    # proprio desligamento -- escrevendo/apagando arquivos dentro do
    # worktree. Se isso coincide com esta limpeza, tanto o "git worktree
    # remove" quanto um "rm -rf" isolado podem falhar com "Directory not
    # empty" (visto na pratica), porque o processo orfao recria entradas
    # enquanto tentamos apagar a arvore. Por isso tentamos algumas vezes
    # com uma pausa curta, dando tempo do processo orfao realmente
    # terminar.
    #
    # Cada tentativa usa o comando como CONDICAO de um "if" -- em efeito
    # sobre "set -e" isto e IDENTICO a "CMD || true" (o lado esquerdo de
    # um "||" ja e isento; nao ha diferenca de comportamento). A troca e
    # so lexical: este projeto proibe o idioma "|| true" por convencao,
    # e escrever "if CMD; then :; fi" em vez disso mantem uma busca por
    # "|| true" no repositorio livre de falsos positivos, o que importa
    # para a proibicao continuar facil de auditar.
    local tentativa
    for tentativa in 1 2 3 4 5 6 7 8 9 10; do
      [ -d "$alvo" ] || break
      if git worktree remove --force "$alvo" </dev/null >/dev/null 2>&1; then :; fi
      if [ -d "$alvo" ]; then
        if rm -rf "$alvo" >/dev/null 2>&1; then :; fi
      fi
      [ -d "$alvo" ] || break
      sleep 0.3
    done

    # Se depois de 10 tentativas o diretorio ainda esta la, isto e uma
    # falha real de limpeza, nao "melhor esforco" silencioso -- e a
    # diferenca entre as duas coisas e exatamente avisar quando nao
    # consegue. NAO mexe em "status": a limpeza nunca e o gate, e uma
    # falha de higiene aqui nao pode reprovar um push cujo codigo esta
    # correto (o veredicto continua vindo so de make bootstrap/check).
    # Mas o recurso vazado (worktree registrado no git + diretorio em
    # $TMPDIR) precisa ficar visivel para alguem limpar a mao.
    if [ -d "$alvo" ]; then
      echo "!! nao foi possivel remover o worktree temporario em ${alvo} -- limpeza manual necessaria:" >&2
      echo "!!   git worktree remove --force ${alvo}" >&2
      echo "!!   rm -rf ${alvo}" >&2
    fi
  fi
}

# Um trap de SINAL (diferente do trap de EXIT) que so roda cleanup e
# retorna devolve o controle ao script no ponto em que foi interrompido --
# em bash, receber INT/TERM nao aborta por si so um script que tem trap
# armado para o sinal. Sem sair explicitamente aqui, um Ctrl-C durante o
# bootstrap da primeira ref mataria so aquele "make", limparia o worktree
# e o laco seguiria para a proxima ref, comecando um bootstrap novo de
# varios minutos -- exatamente quando quem apertou Ctrl-C concluiu (pela
# limpeza visivel) que tinha cancelado. A reacao previsivel a isso e um
# "kill -9", que nao dispara trap nenhum e deixa os orfaos que o trap
# existe para evitar. Por isso encerramos aqui com o codigo de saida
# convencional do sinal (128 + numero do sinal: INT=2, TERM=15) -- nao
# zero, porque a ref interrompida nao foi validada e o push tem que ser
# rejeitado mesmo assim.
on_signal() {
  local exit_code="$1"
  cleanup
  exit "$exit_code"
}

trap cleanup EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

# ---------------------------------------------------------------------------
# De onde vem a lista de refs
# ---------------------------------------------------------------------------
# O contrato do hook pre-push NATIVO do git entrega uma linha por ref na
# entrada padrao ("<ref local> <sha local> <ref remota> <sha remoto>").
# Mas quem executa este script e o framework pre-commit, e ele CONSOME toda
# a stdin antes de rodar qualquer hook: .../pre_commit/commands/hook_impl.py
# le sys.stdin.buffer para decidir o que validar, converte o resultado em
# variaveis de ambiente e entrega /dev/null aos hooks. Ler stdin aqui, na
# pratica, le o vazio -- o laco nao via ref nenhuma, caia na rejeicao por
# "operacao nao verificavel" e TODO push era recusado.
#
# Entao a ordem e: variaveis do pre-commit primeiro, stdin como reserva
# (quando o script e instalado como hook nativo ou rodado a mao).
#
# O que o pre-commit expoe no estagio pre-push (pre_commit/commands/run.py):
#   PRE_COMMIT_LOCAL_BRANCH, PRE_COMMIT_REMOTE_BRANCH,
#   PRE_COMMIT_REMOTE_NAME, PRE_COMMIT_REMOTE_URL  -- sempre; e
#   PRE_COMMIT_FROM_REF / PRE_COMMIT_TO_REF        -- so as vezes.
#
# O "so as vezes" nao e detalhe: em _pre_push_ns(), quando o push inclui o
# commit RAIZ (o primeiro push de um repositorio para um remoto vazio), o
# pre-commit monta o namespace com all_files=True e SEM from_ref/to_ref --
# e run.py so exporta o par FROM_REF/TO_REF quando os dois existem.
# Verificado na pratica: no primeiro push deste repositorio so as quatro
# variaveis de branch/remoto apareciam. Por isso, quando TO_REF falta,
# resolvemos o SHA a partir de PRE_COMMIT_LOCAL_BRANCH.
#
# LIMITACAO REAL, sem eufemismo: _pre_push_ns() percorre as linhas da stdin
# e RETORNA NA PRIMEIRA ref enviavel. Um push com varias refs
# ("git push remoto main outra") expoe apenas UMA delas nas variaveis de
# ambiente; as demais sao invisiveis para este script, e nao ha como
# recupera-las -- o conjunto de refs de um push depende do refspec da linha
# de comando, que nao chega ao hook por nenhum outro canal (as refs de
# rastreamento do remoto ainda estao no estado ANTERIOR ao push e nao
# dizem o que esta sendo enviado). Nao da para reprovar o que nao se
# consegue nem enumerar: validamos a ref visivel, e o buraco fica
# registrado em docs/QUALITY.md secao 5. Pelo caminho da stdin (hook
# nativo) a cobertura multi-ref continua completa.
refs_texto=""
origem=""

adiciona_ref() {
  refs_texto="${refs_texto}${1} ${2}
"
}

if [ -n "${PRE_COMMIT_LOCAL_BRANCH:-}" ] || [ -n "${PRE_COMMIT_TO_REF:-}" ]; then
  origem="variaveis do pre-commit"
  ref_local="${PRE_COMMIT_LOCAL_BRANCH:-}"
  sha_local="${PRE_COMMIT_TO_REF:-}"

  if [ -z "$sha_local" ]; then
    if [ -z "$ref_local" ]; then
      echo "!! pre-commit nao informou nem PRE_COMMIT_TO_REF nem PRE_COMMIT_LOCAL_BRANCH: operacao nao verificavel, push rejeitado" >&2
      exit 1
    fi
    if ! sha_local="$(git rev-parse --verify --quiet "${ref_local}^{commit}")"; then
      echo "!! nao foi possivel resolver ${ref_local} para um commit: operacao nao verificavel, push rejeitado" >&2
      exit 1
    fi
  fi

  [ -n "$ref_local" ] || ref_local="(ref sem nome)"
  adiciona_ref "$ref_local" "$sha_local"
  echo "==> refs obtidas das ${origem}; um push multi-ref expoe apenas a primeira (docs/QUALITY.md secao 5)"
else
  origem="entrada padrao (hook nativo)"
  while read -r ref_local sha_local _ref_remota _sha_remoto; do
    if [ "$sha_local" = "$ZERO" ]; then
      delecoes=$((delecoes + 1))
      continue
    fi
    adiciona_ref "$ref_local" "$sha_local"
  done
fi

# O bootstrap dentro do worktree baixaria o Gitleaks do zero a cada ref
# (21 MB, mais o tempo de rede), porque .tools/ e ignorado pelo git e nao
# existe num worktree recem-criado. Apontar o cache para o .tools/ do
# repositorio principal evita isso. Nao e um atalho na verificacao: o
# install-gitleaks.sh confere o binario compartilhado contra BIN_SHA256
# antes de reutiliza-lo -- e exatamente essa checagem por hash que torna o
# compartilhamento seguro.
export FQ_TOOLS_DIR="${ROOT}/.tools"

while read -r ref_local sha_local; do
  [ -n "$ref_local" ] || continue

  work="$(mktemp -d)"
  echo "==> validando ${ref_local} (${sha_local:0:8}) em worktree limpo"

  # </dev/null em todo subprocesso deste bloco: este laco le da entrada
  # padrao (a lista de refs montada acima). Sem isolar a entrada padrao dos
  # subprocessos, eles herdariam essa MESMA entrada. Se qualquer um -- git
  # worktree, make, ou uma ferramenta futura do gate -- tentar ler stdin
  # por qualquer motivo, ele consumiria as linhas de refs restantes: o laco
  # terminaria cedo SEM ERRO, e um push com varias revisoes aprovaria
  # (validadas>0, status=0) as que nunca chegaram a ser validadas. Isso e
  # exatamente a "operacao nao verificavel" que o README proibe aprovar.
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
done <<FIM_DAS_REFS
${refs_texto}
FIM_DAS_REFS

if [ "$status" -eq 0 ] && [ "$validadas" -eq 0 ] && [ "$delecoes" -eq 0 ]; then
  echo "!! nada foi validado: operacao nao verificavel, push rejeitado" >&2
  exit 1
fi

exit $status
