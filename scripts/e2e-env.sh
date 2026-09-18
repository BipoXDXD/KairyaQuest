#!/usr/bin/env bash
# Executa o comando recebido com a API apontada para o banco de TESTE.
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
# aqui criaria uma segunda copia para divergir da primeira -- e uma credencial
# versionada.
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

# A guarda de nome e a mesma segunda condicao de `exigir_banco_de_teste`
# (tests/integration/conftest.py), pelo mesmo motivo e com a mesma mensagem:
# uma FOCUSQUEST_TEST_DATABASE_URL mal configurada aponta a variavel de teste
# para o banco errado, e ai a comparacao com a configuracao aprova -- porque e
# a configuracao que esta errada. A convencao de nome do .env.example e o que
# se pode conferir por fora dela.
#
# Aqui a guarda protege escrita, nao DROP: o E2E cria missoes. Se ela recusar,
# o comando nao roda -- `set -e` derruba o script na propria substituicao.
url="$(uv run python - <<'PY'
from sqlalchemy import make_url

from focusquest.core.config import Settings

url = make_url(Settings().test_database_url)
nome = url.database or ""
if not nome.endswith("_test"):
    raise SystemExit(
        f"recusando subir a API do E2E contra o banco '{nome}'; esperado um "
        "banco cujo nome termine em '_test' -- confira "
        "FOCUSQUEST_TEST_DATABASE_URL"
    )
# hide_password=False de proposito: o valor vai para uma variavel de ambiente
# do processo filho, nao para log nem para mensagem de erro.
print(url.render_as_string(hide_password=False))
PY
)"

export FOCUSQUEST_DATABASE_URL="$url"
exec "$@"
