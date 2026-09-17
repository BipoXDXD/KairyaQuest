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
