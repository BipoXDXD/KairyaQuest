# shellcheck shell=bash
# Biblioteca do scripts/check-push.sh: leva a configuracao de banco do .env do
# repositorio principal para o ambiente do worktree de validacao, e RECUSA o
# push quando ela falta; e isola o gate do push em banco e portas proprios
# (isolar_gate_do_push, no fim do arquivo). O PORQUE de o worktree precisar disso esta no
# check-push.sh, junto da chamada; aqui mora so o mecanismo.
#
# E carregada com "." (source), nao executada: a funcao precisa exportar no
# shell de QUEM a chama, e um processo filho nao exporta nada para o pai. Por
# isso nao tem shebang nem bit de execucao, e nao liga "set -euo pipefail" --
# herda as opcoes de quem a carrega (o check-push.sh e o teste ligam as tres).
#
# Existe como arquivo proprio para ser testada sem disparar push nem criar
# worktree: tests/integration/test_push_env.py chama esta MESMA funcao, com um
# .env temporario, e confere a recusa, a nao-execucao e o valor com "=".

# exportar_env_focusquest ARQUIVO_ENV
#
# Lista de PERMISSAO por regex ancorada, e NUNCA "source". Um .env deveria ter
# so pares chave=valor, mas "source" EXECUTA o arquivo: uma linha
# "rm -rf ~" ou "$(curl ...)" que entrasse ali por acidente ou por malicia
# rodaria com o shell de quem empurra, e num hook de push isso passaria
# despercebido. Aqui somente "FOCUSQUEST_<MAIUSCULAS/DIGITOS/_>=" casa --
# comentario, linha em branco, "export FOO=", nome minusculo e outro prefixo
# simplesmente nao casam -- e nada e executado.
#
# Dois detalhes que quebram uma implementacao ingenua: a divisao e no PRIMEIRO
# "=" (a classe de caracteres do nome nao inclui "=", e uma URL de banco com
# senha contem "="), e aspas envolventes sao removidas, como o python-dotenv
# faz, para o valor chegar ao Settings do mesmo jeito que chega no repositorio
# principal.
#
# Uma variavel JA exportada no ambiente vence a linha do .env. E a mesma
# precedencia do pydantic-settings (ambiente acima do .env), entao o worktree
# se comporta como o repositorio principal se comportaria.
#
# Falha FECHADA, nomeando o que falta. Uma mensagem "configure o .env" sem
# dizer QUAL variavel obriga quem empurra a procurar; e a instrucao concreta
# evita a reacao que a especificacao proibe (tentar "--no-verify" achando que
# o gate esta quebrado).
#
# Isto recusa tambem um push que so DELETA ref, que nao carrega codigo nenhum.
# Aceito de proposito: a alternativa e um segundo caminho de codigo, exercitado
# quase nunca, para relaxar uma guarda -- e uma guarda com excecao que ninguem
# testa e uma guarda que apodrece. Recusar com a instrucao na tela custa um
# comando a quem deleta uma branch.
#
# Retorna 1 na recusa. Quem chama NAO deve envolver a chamada em "||" nem em
# "if": sob "set -e", o retorno nao-zero e o que derruba o push.
exportar_env_focusquest() {
  local arquivo_env="$1"
  local raiz linha nome valor faltando
  raiz="$(dirname "$arquivo_env")"

  if [ -f "$arquivo_env" ]; then
    while IFS= read -r linha || [ -n "$linha" ]; do
      linha="${linha%$'\r'}"
      [[ $linha =~ ^(FOCUSQUEST_[A-Z0-9_]*)=(.*)$ ]] || continue
      nome="${BASH_REMATCH[1]}"
      valor="${BASH_REMATCH[2]}"
      case "$valor" in
        \"*\")
          valor="${valor#\"}"
          valor="${valor%\"}"
          ;;
        \'*\')
          valor="${valor#\'}"
          valor="${valor%\'}"
          ;;
      esac
      if [ -z "${!nome:-}" ]; then
        export "${nome}=${valor}"
      fi
    done <"$arquivo_env"
  fi

  faltando=""
  for nome in FOCUSQUEST_DATABASE_URL FOCUSQUEST_TEST_DATABASE_URL; do
    [ -n "${!nome:-}" ] || faltando="${faltando} ${nome}"
  done

  if [ -n "$faltando" ]; then
    echo "!! configuracao ausente: o gate nao pode rodar no worktree de validacao, push rejeitado" >&2
    echo "!! variaveis obrigatorias sem valor:${faltando}" >&2
    echo "!! elas nao tem default em src/focusquest/core/config.py, e o worktree temporario nao herda o .env (ele e gitignored)" >&2
    echo "!! conserte de um dos dois jeitos, no repositorio principal (${raiz}):" >&2
    echo "!!   1. crie o .env a partir do modelo:  cp .env.example .env  (e ajuste o que precisar)" >&2
    echo "!!   2. ou exporte as variaveis no shell que dispara o push" >&2
    echo "!! NAO existe a opcao de pular o check-api: gate cego nao e gate" >&2
    return 1
  fi
}

# ---------------------------------------------------------------------------
# isolar_gate_do_push
# ---------------------------------------------------------------------------
# Pendencia 19. Depois de exportar_env_focusquest, o worktree de validacao
# teria o MESMO banco de teste e as MESMAS portas do E2E do worktree que
# empurra -- e um push colidiria com um "make check" rodando ali (o DROP
# SCHEMA de um derruba o E2E do outro; as portas fixas recusam o segundo
# servidor). Esta funcao troca as duas coisas, so no ambiente do gate do push:
#
#  - O banco: o nome de teste de QUEM empurra ganha "_push" antes do "_test"
#    (focusquest_test -> focusquest_push_test; focusquest_gate_test ->
#    focusquest_gate_push_test). Continua terminando em "_test", entao a guarda
#    do DROP SCHEMA vale para ele, e cada worktree tem o seu banco de push. O
#    banco nasce sozinho no gate (fixture "engine" da suite pytest).
#
#  - As portas: deslocamento do worktree + FQ_RESERVA_DO_PUSH. A faixa inteira
#    vai de 0 a 49 (o limite do servers.ts e do Settings); por convencao, 0 a 24
#    e dos worktrees e 25 a 49, do push. O push de um worktree nunca cai no de
#    outro (deslocamentos distintos somados a mesma reserva) nem num worktree.
#
# Recusa -- fechada, com a instrucao -- um banco de teste sem o sufixo "_test"
# (nao ha de onde derivar, e e o erro que a guarda do DROP existe para pegar) e
# um deslocamento fora de 0 a 24. Retorna 1 na recusa; mesma regra de chamada
# de exportar_env_focusquest (sem "||" nem "if" em volta).
FQ_RESERVA_DO_PUSH=25

isolar_gate_do_push() {
  local url base consulta nome raiz_do_nome deslocamento

  url="${FOCUSQUEST_TEST_DATABASE_URL:-}"
  # A query vem depois do PRIMEIRO "?", e pode conter "/" e ate "_test": o nome
  # do banco e o ultimo segmento do caminho ANTES dela.
  base="${url%%\?*}"
  consulta="${url:${#base}}"
  nome="${base##*/}"
  if [ "$nome" = "$base" ] || ! [[ $nome =~ ^(.+)_test$ ]]; then
    echo "!! o banco de teste '${nome}' nao e um nome que termine em _test: nao ha banco proprio para derivar ao gate do push, push rejeitado" >&2
    echo "!! confira FOCUSQUEST_TEST_DATABASE_URL no .env (ou no ambiente) de quem empurra" >&2
    return 1
  fi
  raiz_do_nome="${BASH_REMATCH[1]}"

  deslocamento="${FOCUSQUEST_E2E_PORT_OFFSET:-0}"
  if ! [[ $deslocamento =~ ^[0-9]+$ ]] || ((10#$deslocamento >= FQ_RESERVA_DO_PUSH)); then
    echo "!! FOCUSQUEST_E2E_PORT_OFFSET='${deslocamento}' fora da faixa dos worktrees: esperado um inteiro de 0 a $((FQ_RESERVA_DO_PUSH - 1)), push rejeitado" >&2
    echo "!! de ${FQ_RESERVA_DO_PUSH} a $((2 * FQ_RESERVA_DO_PUSH - 1)) a faixa e do proprio pre-push (deslocamento do worktree + ${FQ_RESERVA_DO_PUSH}); ver docs/QUALITY.md secao 6" >&2
    return 1
  fi

  export FOCUSQUEST_TEST_DATABASE_URL="${base%/*}/${raiz_do_nome}_push_test${consulta}"
  export FOCUSQUEST_E2E_PORT_OFFSET="$((10#$deslocamento + FQ_RESERVA_DO_PUSH))"
  echo "==> gate do push isolado: banco ${raiz_do_nome}_push_test, deslocamento das portas do E2E ${FOCUSQUEST_E2E_PORT_OFFSET}"
}
