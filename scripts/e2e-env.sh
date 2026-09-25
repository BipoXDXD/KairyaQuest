#!/usr/bin/env bash
# Executa o comando recebido com a API apontada para o banco de TESTE e para
# o servidor FALSO da Anthropic, com a chave ficticia imposta.
#
# Duas guardas, as duas antes de o comando rodar: o banco precisa ter nome
# terminando em `_test`, e o provedor (FOCUSQUEST_ANTHROPIC_BASE_URL, que o
# playwright.config.ts define) precisa estar em loopback. E a chave da API e
# SEMPRE a ficticia, qualquer que seja a do .env ou a do ambiente.
#
# Por que este script existe: a aplicacao le UMA variavel de banco
# (FOCUSQUEST_DATABASE_URL, em src/focusquest/core/config.py). O E2E precisa
# que essa variavel aponte para focusquest_test -- o MESMO banco da suite
# pytest --, e nao para o banco de desenvolvimento que o .env configura.
# Trocar o .env a mao antes de rodar o E2E seria uma etapa manual que alguem
# esquece, e esquece-la nao falharia: o E2E passaria escrevendo missoes de
# teste no banco de desenvolvimento. Por isso o webServer do Playwright chama
# este script em vez de chamar o uvicorn direto.
#
# A URL NAO esta escrita aqui. Ela vem de `Settings().test_database_url`, o
# unico lugar do projeto que sabe onde o banco de teste mora: repetir a URL
# aqui criaria uma segunda copia para divergir da primeira -- quem mudasse a
# porta ou o nome do banco no .env mudaria um e esqueceria o outro. O motivo e
# uma fonte so, e nao sigilo: a credencial LOCAL ja esta versionada, de
# proposito, no compose.yaml, no .env.example e no workflow do CI.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "uso: scripts/e2e-env.sh <comando> [argumento...]" >&2
  exit 64
fi

# A raiz do repositorio. O `Settings` le o `.env` do diretorio CORRENTE e o
# `uv` procura o `pyproject.toml`; chamado de dentro de frontend/ (que e o
# diretorio do playwright.config.ts), sem este `cd` nao se acha nem um nem
# outro.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# A guarda e a MESMA de `tests/integration/banco_de_teste.exigir_banco_de_teste`
# -- nao uma copia --, compartilhada tambem com a suite pytest e com o
# `make reset-test-db` (C17). Ela confere o alvo contra a configuracao E o
# nome terminado em `_test`; uma FOCUSQUEST_TEST_DATABASE_URL mal configurada
# apontando para o banco de desenvolvimento e o caso que a segunda condicao
# pega, porque a primeira sozinha aprovaria (a URL bate com a configuracao,
# que e quem esta errada).
#
# Aqui a guarda protege escrita, nao DROP: o E2E cria planos e missoes. Se ela
# recusar, o comando nao roda -- `set -e` derruba o script na propria
# substituicao.
url="$(PYTHONPATH=tests uv run python - <<'PY'
from urllib.parse import urlsplit

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url
from integration.banco_de_teste import exigir_banco_de_teste

engine = create_engine_from_url(Settings().test_database_url)
try:
    exigir_banco_de_teste(engine)
except RuntimeError as erro:
    raise SystemExit(f"recusando subir a API do E2E: {erro}") from None
finally:
    engine.dispose()

# O provedor da API do E2E tem de ser a MAQUINA LOCAL (o servidor falso).
# Lista de permissao, e nao recusa de um nome. A chave real mora no Keychain
# do macOS, nunca no .env (decisao D-a, emenda E1 do 1b-2) -- mas uma chave
# posta no ambiente do shell ou no .env por engano chegaria aqui, e o
# pre-push exporta toda FOCUSQUEST_* do .env para o worktree do gate. Com o
# provedor fora da maquina -- a Anthropic, um proxy, um IP --, essa chave e o
# gasto iriam para longe do teste. So o HOST vai para a mensagem: uma URL com
# credencial embutida iria inteira para o log.
endereco = Settings().anthropic_base_url
host = urlsplit(endereco).hostname
if host not in {"127.0.0.1", "localhost", "::1"}:
    raise SystemExit(
        "recusando subir a API do E2E com o provedor em "
        f"'{host}'; o E2E so fala com o servidor falso em loopback -- "
        "confira FOCUSQUEST_ANTHROPIC_BASE_URL (o playwright.config.ts a define)"
    )

# hide_password=False de proposito: o valor vai para uma variavel de ambiente
# do processo filho, nao para log nem para mensagem de erro.
print(engine.url.render_as_string(hide_password=False))
PY
)"

export FOCUSQUEST_DATABASE_URL="$url"
# A chave da API do E2E e SEMPRE a ficticia. A real mora no Keychain e nao
# deveria estar em lugar nenhum daqui, mas uma chave posta por engano chegaria
# a este ambiente pelo shell, pelo .env (o Settings o le) ou pelo pre-push
# (que exporta toda FOCUSQUEST_* do .env para o worktree): impor aqui, no
# unico caminho de subida da API do E2E, fecha os tres. O valor nao imita o
# formato de uma chave real.
export FOCUSQUEST_ANTHROPIC_API_KEY="e2e-chave-ficticia"
exec "$@"
