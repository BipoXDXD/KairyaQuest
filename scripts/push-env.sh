# shellcheck shell=bash
# Biblioteca do scripts/check-push.sh: leva a configuracao de banco do .env do
# repositorio principal para o ambiente do worktree de validacao, e RECUSA o
# push quando ela falta. O PORQUE de o worktree precisar disso esta no
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
