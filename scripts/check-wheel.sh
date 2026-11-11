#!/usr/bin/env bash
# Constroi o wheel e confere que os prompts em Markdown estao dentro dele.
#
# A persona e a rubrica moram em arquivos `.md` lidos por
# `importlib.resources` (Fase 3, Tarefa 4). A imagem da API instala o projeto
# como wheel (`uv sync --no-editable`, docker/api.Dockerfile): se o build
# deixar de levar um `.md`, os testes -- que rodam do checkout -- continuam
# verdes, e o erro so aparece na partida do app em producao. Este script fecha
# essa lacuna olhando o wheel de verdade (scripts/check_wheel.py).
#
# Fica fora do pytest de proposito: o `uv build` baixa o backend (hatchling)
# e pesaria em toda execucao do `check-api`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAIDA="$(mktemp -d)"
trap 'rm -rf "$SAIDA"' EXIT

uv build --wheel --project "$ROOT" -o "$SAIDA"

# Exatamente um wheel: um glob com zero ou dois casaria em silencio errado.
WHEELS=("$SAIDA"/*.whl)
if [ "${#WHEELS[@]}" -ne 1 ] || [ ! -f "${WHEELS[0]}" ]; then
  echo "check-wheel: esperado um wheel em $SAIDA, achados: ${#WHEELS[@]}" >&2
  exit 1
fi

# A lista do esperado sai dos `.md` em `src/**/prompts/` (check_wheel.py), nao
# de uma lista fixa aqui: um idioma novo entra na conferencia sozinho.
python3 "$ROOT/scripts/check_wheel.py" "${WHEELS[0]}" "$ROOT/src"
