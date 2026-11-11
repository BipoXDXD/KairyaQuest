# Coerência da versão do Python — 2026-11-11

Objetivo: resolver a pendência P-python-3-14-10-1 (de
`docs/handoff/2026-11-11-python-3-14-10.md`): nada garantia que o
`.python-version`, a tag da imagem do `docker/api.Dockerfile` e as demais
menções à versão do Python ficassem em sincronia, e a imagem nunca tinha sido
construída localmente com o 3.14.10.

Revisão-base: `d3d96a2` (`origin/main`, merge do PR #93).

## Decisões

- Novo `tests/unit/test_versao_do_python.py`, no estilo do teste do limite da
  pergunta: reprova com `arquivo:linha` dos dois lados. `.python-version` manda
  (é o que o uv lê). Conferido contra ele:
  - toda linha `FROM python:X.Y.Z-...` de `docker/*Dockerfile` e todo
    `image: python:` do `compose.yaml` (tag sem patch também reprova, e a
    ausência total de `FROM python:` também);
  - `pyproject.toml`: `mypy python_version` precisa ser a série do patch, e o
    limite inferior de `requires-python` precisa aceitá-lo;
  - os comentários `` `.python-version` (X.Y.Z) `` do `quality.yml`, que
    citam o patch e ficariam mentindo.
- O verificador (`verificar_coerencia(raiz)`) recebe a raiz como parâmetro, e o
  teste o exercita em repositórios de mentira em `tmp_path`, além de rodá-lo no
  repositório de verdade. Assim a falha é demonstrada sem tocar nos arquivos
  reais.
- O uv do CI **não** é provado por teste: saber se o `version:` do `setup-uv`
  conhece o patch exige o catálogo de downloads daquela versão do uv, ou seja,
  rede. A garantia fica como regra de processo, abaixo.

## Regra ao trocar o patch do Python

1. Atualize `.python-version` e as tags (e o digest) dos `FROM python:` do
   `docker/api.Dockerfile`; o teste acima aponta o que ficou para trás.
2. **Confira e atualize o `version:` dos dois `astral-sh/setup-uv` do
   `.github/workflows/quality.yml`** (`check-api` e `check-e2e`). O uv fixado
   precisa trazer o novo patch no catálogo; confira com
   `uv --no-config python list <série> --all-versions` usando o uv que será
   fixado. Se esquecer, o job falha no `uv sync --locked` ao tentar baixar o
   interpretador.
3. Atualize os comentários do `quality.yml` que citam o patch (o teste cobre).

## Alterações

- `tests/unit/test_versao_do_python.py` (novo)
- este arquivo

## Comandos e resultados

Sem `UV_PYTHON` no ambiente, uv 0.13.7:

- Prova de que o teste falha: (a) com o verificador neutralizado
  (`return []`), os 4 casos de arquivo de versão inválido falharam; (b) numa
  cópia dos arquivos reais em diretório temporário, com `.python-version` em
  3.14.11, o `FROM` em 3.14.9 e o mypy em 3.13, o verificador apontou
  `docker/api.Dockerfile:3` e `:12`, `pyproject.toml:51` e
  `.github/workflows/quality.yml:104` e `:162`, sempre com
  `.python-version:1` do outro lado. Nenhum arquivo do repositório foi alterado
  para isso.
- Build da imagem (mac ARM64, `memory_pressure` com 50% livre):
  `docker build -f docker/api.Dockerfile -t kq-versao-python:local .` (o
  Dockerfile está em `docker/`, não na raiz) → EXIT 0, 0 linhas de erro no log.
  `docker run --rm kq-versao-python:local python --version` →
  `Python 3.14.10` (a imagem não tem `ENTRYPOINT`, só `CMD`).
  `python -c "import focusquest; sys.version_info[:3]"` → `(3, 14, 10)`.
  Imagem de 298 MB, `arm64`. Só a arquitetura nativa foi construída; o
  `linux/amd64` do release não foi exercitado aqui.
- `docker rmi kq-versao-python:local` feito. O build cache do Docker é
  compartilhado com as outras sessões e cresceu cerca de 0,44 GB (10,87 → 11,31
  GB); não foi podado para não apagar cache dos outros worktrees.
- `make check` → EXIT 0: 1741 testes Python (+32 subtests) com cobertura de
  100%, 1166 testes do frontend em 56 arquivos, 68 E2E, Ruff, mypy e gitleaks
  sem erro.

## Pendências

- P-python-3-14-10-1 resolvida por este arquivo, parte (a) (sincronia, por
  teste) e parte (b) (build local da imagem, abaixo). A parte do uv fixado
  continua sendo regra de processo, não teste.
