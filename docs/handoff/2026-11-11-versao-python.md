# Coerência da versão do Python — 2026-11-11

Objetivo: resolver a pendência P-python-3-14-10-1 (de
`docs/handoff/2026-11-11-python-3-14-10.md`): nada garantia que o
`.python-version`, a tag do `docker/api.Dockerfile` e as demais menções ao
Python ficassem em sincronia. Revisão-base: `d3d96a2` (`origin/main`).

## Decisões

- Novo `tests/unit/test_versao_do_python.py`. O `.python-version` manda (é o
  que o uv lê); o docstring do teste lista o que é conferido e o que é aceito.
  Fonte ausente (arquivo, tabela, chave ou comentário) reprova: sumir não é
  passar.
- `requires-python` só aceita `>=X.Y[.Z]`; outras formas (`>3.14`, `~=3.14`,
  `>=3.14,<4`) reprovam como "forma não suportada". Estender é decisão
  consciente.
- O uv fixado no CI **não** é provado por teste (exige rede, catálogo do uv).

## Regra ao trocar o patch do Python

1. Atualize `.python-version` e tag e digest dos `FROM python:`; o teste aponta
   o que ficou para trás.
2. Atualize o `version:` dos dois `astral-sh/setup-uv` do `quality.yml`
   (`check-api`, `check-e2e`); confira com
   `uv --no-config python list <série> --all-versions` no uv a fixar. Se
   esquecer, o job falha no `uv sync --locked`.
3. Atualize os comentários do `quality.yml` que citam o patch (o teste cobre).

## Alterações

- `tests/unit/test_versao_do_python.py` (novo); este arquivo.

## Método

- Teste vermelho antes do verde, também nas correções de revisão.
- Build da imagem (mac ARM64) e `python --version` dentro dela, uma vez, no
  commit `a01e78d`; `docker rmi` feito. Só `arm64` foi exercitado.

## Resultado

- Build: EXIT 0; `Python 3.14.10`; imagem de 298 MB.
- `make check` com as correções: EXIT 0; 1760 testes Python (+32 subtests) com
  cobertura 100%, 1166 de frontend, 68 E2E, Ruff, mypy e gitleaks sem erro.

## Pendências

- P-python-3-14-10-1 resolvida por este arquivo (sincronia por teste e build
  local da imagem). O uv fixado segue como regra de processo, não teste.
- `linux/amd64` da imagem não foi construído aqui.
