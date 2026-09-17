# Incremento 1a — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a primeira fatia vertical do FocusQuest — API FastAPI com liveness e readiness real do banco, PostgreSQL em container, migração Alembic, a entidade missão persistida e testada, e o Quartel-General listando — trazendo consigo os alvos de gate `check-api` e `check-e2e`.

**Architecture:** Pacote Python em `src/focusquest/` com instalação editável, módulo por funcionalidade (`modules/missions/` com router, schemas, service, domain, models) e infraestrutura comum em `core/`. O domínio não importa FastAPI nem SQLAlchemy. O frontend consome a API por um cliente HTTP em `shared/api/`. Cada alvo novo do gate entra primeiro no `Makefile` e só depois ganha job no CI.

**Tech Stack:** Python 3.14, FastAPI 0.141.1, Uvicorn 0.53.0, Pydantic 2.13.5, pydantic-settings 2.15.0, SQLAlchemy 2.0.54, psycopg 3.3.5, Alembic 1.20.0, pytest 9.1.1, pytest-cov 7.1.0, httpx 0.28.1, PostgreSQL 18.6-alpine, Playwright 1.63.0, @axe-core/playwright 4.13.0.

**Spec:** `docs/superpowers/specs/2026-09-17-incremento-1a-design.md`

## Global Constraints

- A `main` é protegida: todo trabalho vai por branch e pull request, e o merge exige o `quality-gate` verde. **Não mescle sem autorização.**
- Cobertura exigida: **100% de linhas e ramificações** do código de aplicação, Python e frontend. Sem excluir código difícil, sem diretiva de ignorar cobertura, sem reduzir limiar.
- `make check` nunca modifica arquivos versionados; `make format` modifica e nunca é chamado por `check`.
- **Nenhum alvo do Makefile invoca `pre-commit`.** A invocação é estritamente descendente: `git hook -> pre-commit -> make -> ferramentas`.
- **Paridade 1:1 entre job do CI e alvo do Makefile.** Uma verificação nova entra primeiro como alvo, só depois como job.
- Proibidos em qualquer lugar: `--no-verify`, `SKIP`, `|| true`, `continue-on-error`, sucesso com suíte vazia, falha ignorada.
- GNU Make 3.81: cada `cd` na mesma linha do comando; receitas com TAB, nunca espaços.
- **Sem remendos em `sys.path`** (README §4). O pacote é importável por instalação editável.
- Interface do produto em **português do Brasil**; identificadores de código em **inglês**.
- Usuário único local, **declarado**: sem login, sem sessão, sem token. Uma linha em `users` criada pela migração.
- A porta do host do PostgreSQL é **55432**, não 5432 — a 5432 está ocupada por uma instalação local que não pertence ao projeto.
- Empurre **uma ref por vez**: o hook `pre-push` só enxerga uma ref.

---

### Task 1: Raiz do pacote Python importável

**Files:**
- Modify: `pyproject.toml`
- Create: `src/focusquest/__init__.py`
- Create: `tests/unit/test_package.py`
- Regenerate: `uv.lock`

**Interfaces:**
- Consumes: nada.
- Produces: o pacote `focusquest` importável em pytest, uvicorn e Alembic sem manipular `sys.path`.

- [ ] **Step 1: Reescrever o `pyproject.toml`**

A mudança central é `package = true` com backend de build. A justificativa está na decisão A1 da spec: com layout `src/`, `package = false` torna `import focusquest` impossível sem mexer em `sys.path`, que o README §4 proíbe.

```toml
[project]
name = "focusquest"
version = "0.1.0"
description = "Plataforma de estudos gamificada com tutoria interativa"
requires-python = ">=3.14"
dependencies = [
    "alembic==1.20.0",
    "fastapi==0.141.1",
    "psycopg[binary]==3.3.5",
    "pydantic==2.13.5",
    "pydantic-settings==2.15.0",
    "sqlalchemy==2.0.54",
    "uvicorn==0.53.0",
]

[dependency-groups]
dev = [
    "httpx==0.28.1",
    "mypy",
    "pre-commit",
    "pytest==9.1.1",
    "pytest-cov==7.1.0",
    "ruff",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/focusquest"]

[tool.ruff]
target-version = "py314"
line-length = 88
src = ["src", "tests"]

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]

[tool.mypy]
python_version = "3.14"
strict = true
mypy_path = "src"

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"

[tool.coverage.run]
branch = true
source = ["src/focusquest"]

[tool.coverage.report]
fail_under = 100
show_missing = true
skip_covered = false
```

As dependências de aplicação são fixadas com `==` porque o `uv.lock` é a fonte de verdade e um piso frouxo não acrescenta nada. As de desenvolvimento ficam sem versão, como já estavam.

- [ ] **Step 2: Criar o pacote**

`src/focusquest/__init__.py`:

```python
"""FocusQuest: plataforma de estudos gamificada com tutoria interativa."""

__all__: list[str] = []
```

- [ ] **Step 3: Escrever o teste que prova a importabilidade**

`tests/unit/test_package.py`:

```python
"""O pacote precisa ser importável sem manipular sys.path (README s4)."""

import focusquest


def test_package_is_importable() -> None:
    assert focusquest.__doc__ is not None
```

- [ ] **Step 4: Sincronizar e verificar**

```bash
uv sync
uv run pytest tests/unit/test_package.py -v
```

Esperado: o teste passa. Se falhar com `ModuleNotFoundError`, a instalação editável não aconteceu — confira `[build-system]` e `[tool.hatch.build.targets.wheel]`, e **não** acrescente `pythonpath` ao pytest.

- [ ] **Step 5: Verificar que o lockfile é validável**

```bash
uv sync --locked
```

Esperado: sucesso sem reescrever o `uv.lock`. Note que é `--locked`, não `--frozen`: o `--frozen` **não valida** o lockfile contra o `pyproject.toml`, como foi medido e registrado em `docs/QUALITY.md`.

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml uv.lock src tests
git commit -m "build: torna o pacote focusquest importavel por instalacao editavel

Corrige a decisao D2 do Incremento 2, que fixou package=false. Com layout
src/, isso torna import focusquest impossivel sem mexer em sys.path, que o
README s4 proibe por nome. Instalacao editavel nao e instalar para
distribuir: e como o Python torna o proprio projeto importavel em pytest,
uvicorn e Alembic ao mesmo tempo."
```

---

### Task 2: `check-api` entra no gate

**Files:**
- Modify: `Makefile`

**Interfaces:**
- Consumes: o pacote e as ferramentas da Task 1.
- Produces: alvo `make check-api`; `make check` passa a agregá-lo. Tarefas seguintes dependem do gate reprovando Python ruim.

- [ ] **Step 1: Acrescentar o alvo**

Edição **parcial** do `Makefile`: troque a linha `.PHONY` e o alvo `check`, e acrescente `check-api`. Os alvos `help`, `bootstrap`, `check-web`, `check-secrets` e `format` permanecem como estão.

```make
.PHONY: help bootstrap check check-web check-api check-secrets format

check: check-web check-api check-secrets ## Gate completo. E o que os hooks e o CI executam.

check-api: ## Ruff, mypy e pytest com cobertura no backend
	uv run ruff check .
	uv run ruff format --check .
	uv run mypy src tests
	uv run pytest --cov --cov-report=term-missing --cov-report=html --cov-report=xml
```

Os três relatórios de cobertura atendem o §9, que pede terminal, HTML e CI.

- [ ] **Step 2: Acrescentar `uv sync --locked` ao bootstrap**

O alvo `bootstrap` hoje roda `uv sync --frozen`. Troque por `uv sync --locked`, que **valida** o lockfile. Isso vence a pendência registrada em `docs/QUALITY.md` sobre a ausência de validação do `uv.lock`.

- [ ] **Step 3: Ignorar os artefatos de cobertura do Python**

Acrescente ao `.gitignore` da raiz, se ainda não estiverem: `htmlcov/`, `coverage.xml`, `.coverage`. (O `.gitignore` do Incremento 0 já os tem — confirme com `grep` antes de duplicar.)

- [ ] **Step 4: Verificar que o gate passa**

```bash
make check
```

Esperado: `check-web`, `check-api` e `check-secrets` passam. A cobertura do Python deve ser 100% — só existe `__init__.py` e ele é coberto pelo teste da Task 1.

- [ ] **Step 5: Verificar que o gate reprova erro de lint no Python**

```bash
printf 'import os\n' > src/focusquest/tmp_probe.py
make check
```

Esperado: **FALHA** no Ruff, com `F401` (import não usado) apontando o arquivo.

```bash
rm src/focusquest/tmp_probe.py && make check
```

Esperado: volta a passar.

- [ ] **Step 6: Verificar que o gate reprova erro de tipo**

```bash
printf 'def somar(a: int, b: int) -> str:\n    return a + b\n' > src/focusquest/tmp_probe.py
uv run ruff format src/focusquest/tmp_probe.py
make check
```

Esperado: **FALHA** no mypy, com incompatibilidade entre `int` e `str`. Formate antes de rodar: o Ruff `format --check` vem antes do mypy no alvo, e sem formatar você mediria o formatador.

```bash
rm src/focusquest/tmp_probe.py && make check
```

- [ ] **Step 7: Verificar que o gate reprova cobertura abaixo de 100%**

```bash
printf 'def dobrar(n: int) -> int:\n    return n * 2 if n > 0 else 0\n' > src/focusquest/tmp_probe.py
uv run ruff format src/focusquest/tmp_probe.py
make check
```

Esperado: **FALHA** no limiar de cobertura, com `fail_under = 100` e o arquivo nomeado no relatório.

```bash
rm src/focusquest/tmp_probe.py && make check
```

- [ ] **Step 8: Commit**

```bash
git add Makefile .gitignore
git commit -m "build: acrescenta check-api ao gate

Ruff lint, Ruff format --check, mypy estrito e pytest com cobertura
exigida em 100%. Cumpre o contrato registrado em docs/QUALITY.md: quem
cria o primeiro modulo Python traz o alvo junto.

bootstrap passa a usar uv sync --locked em vez de --frozen, que nao
valida o lockfile contra o pyproject."
```

---

### Task 3: Configuração e PostgreSQL em container

**Files:**
- Create: `src/focusquest/core/__init__.py`
- Create: `src/focusquest/core/config.py`
- Create: `compose.yaml`
- Create: `.env.example`
- Create: `tests/unit/test_config.py`
- Modify: `Makefile`

**Interfaces:**
- Consumes: o pacote da Task 1.
- Produces: `Settings` com `database_url: str` e `test_database_url: str`; alvos `make db-up` e `make db-down`; o container na porta **55432** do host.

- [ ] **Step 1: Escrever o teste da configuração**

`tests/unit/test_config.py`:

```python
"""A configuracao vem do ambiente, sem valor embutido para credencial."""

import pytest

from focusquest.core.config import Settings


def test_le_a_url_do_banco_do_ambiente(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", "postgresql+psycopg://u:p@h:55432/d")
    monkeypatch.setenv(
        "FOCUSQUEST_TEST_DATABASE_URL", "postgresql+psycopg://u:p@h:55432/t"
    )
    settings = Settings()
    assert settings.database_url == "postgresql+psycopg://u:p@h:55432/d"
    assert settings.test_database_url == "postgresql+psycopg://u:p@h:55432/t"


def test_falha_quando_a_url_do_banco_nao_esta_no_ambiente(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("FOCUSQUEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("FOCUSQUEST_TEST_DATABASE_URL", raising=False)
    with pytest.raises(ValueError):
        Settings()
```

O segundo teste é o que importa: sem valor padrão, esquecer de configurar falha na hora, em vez de conectar silenciosamente em algum lugar errado.

- [ ] **Step 2: Rodar e ver falhar**

```bash
uv run pytest tests/unit/test_config.py -v
```

Esperado: **FALHA** com `ModuleNotFoundError: No module named 'focusquest.core'`.

- [ ] **Step 3: Implementar**

`src/focusquest/core/__init__.py`:

```python
"""Configuracao, conexao e infraestrutura comum."""
```

`src/focusquest/core/config.py`:

```python
"""Configuracao da aplicacao, lida do ambiente."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuracao da aplicacao.

    Nenhum campo tem valor padrao: esquecer de configurar precisa falhar na
    partida, nao conectar em um banco qualquer.
    """

    model_config = SettingsConfigDict(env_prefix="FOCUSQUEST_", env_file=".env")

    database_url: str
    test_database_url: str
```

- [ ] **Step 4: Rodar e ver passar**

```bash
uv run pytest tests/unit/test_config.py -v
```

- [ ] **Step 5: Escrever o `compose.yaml`**

```yaml
name: focusquest

services:
  postgres:
    # Versao fixada: o README s10 proibe `latest`.
    image: postgres:18.6-alpine
    environment:
      POSTGRES_USER: focusquest
      POSTGRES_PASSWORD: focusquest_local
      POSTGRES_DB: focusquest
    ports:
      # Porta do host configuravel, com 55432 de padrao: a 5432 esta ocupada
      # por uma instalacao local do PostgreSQL que NAO pertence a este projeto
      # (README s10: "recuse alvos de desenvolvimento ou producao"). Se a 55432
      # tambem estiver ocupada, troque FOCUSQUEST_DB_PORT no .env.
      - "127.0.0.1:${FOCUSQUEST_DB_PORT:-55432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql:ro
    healthcheck:
      # Healthcheck de verdade, nao `sleep` (README s10).
      test: ["CMD-SHELL", "pg_isready -U focusquest -d focusquest"]
      interval: 2s
      timeout: 3s
      retries: 15

volumes:
  postgres_data:
```

A senha aqui é de desenvolvimento local e o serviço está vinculado a `127.0.0.1`, como o README §4 pede. Ela não é segredo e não deve ser reaproveitada em lugar nenhum.

- [ ] **Step 6: Criar o banco de teste separado**

`scripts/init-test-db.sql`:

```sql
-- Banco de teste separado do de desenvolvimento (README s10: "Separe
-- desenvolvimento e testes"). Roda uma vez, na inicializacao do volume.
CREATE DATABASE focusquest_test OWNER focusquest;
```

- [ ] **Step 7: Escrever o `.env.example`**

```bash
# Copie para .env. O .env e ignorado pelo git; este arquivo, nao.
# Porta 55432 no host: a 5432 esta ocupada por um PostgreSQL local que nao
# pertence a este projeto.
FOCUSQUEST_DB_PORT=55432
FOCUSQUEST_DATABASE_URL=postgresql+psycopg://focusquest:focusquest_local@127.0.0.1:55432/focusquest
FOCUSQUEST_TEST_DATABASE_URL=postgresql+psycopg://focusquest:focusquest_local@127.0.0.1:55432/focusquest_test
```

- [ ] **Step 8: Acrescentar os alvos de banco ao Makefile**

```make
.PHONY: help bootstrap check check-web check-api check-secrets format db-up db-down

db-up: ## Sobe o PostgreSQL e espera ficar saudavel
	docker compose up -d --wait postgres

db-down: ## Derruba o PostgreSQL, preservando o volume
	docker compose down
```

`--wait` faz o Compose bloquear até o healthcheck passar — é por isso que não existe `sleep` em lugar nenhum.

- [ ] **Step 9: Verificar que o container sobe saudável**

```bash
cp -n .env.example .env
make db-up
docker compose ps --format '{{.Service}} {{.Status}}'
```

Esperado: `postgres` com status contendo `healthy`.

```bash
docker compose exec -T postgres psql -U focusquest -d focusquest_test -c 'SELECT 1'
```

Esperado: retorna uma linha. Isso prova que o banco de teste foi criado.

- [ ] **Step 10: Verificar que a 5432 local não foi tocada**

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN | head -3
docker compose port postgres 5432
```

Esperado: a 5432 continua com o processo local de antes, e o container responde em `127.0.0.1:55432`.

- [ ] **Step 11: Commit**

```bash
git add src/focusquest/core tests/unit/test_config.py compose.yaml scripts/init-test-db.sql .env.example Makefile
git commit -m "feat: configuracao e PostgreSQL em container

Versao fixada (18.6-alpine), healthcheck do Compose em vez de sleep,
volume persistente e banco de teste separado do de desenvolvimento.

Porta 55432 no host porque a 5432 esta ocupada por uma instalacao local
do PostgreSQL que nao pertence ao projeto.

Settings nao tem valor padrao para as URLs: esquecer de configurar falha
na partida em vez de conectar silenciosamente em outro lugar."
```

---

### Task 4: Conexão, liveness e readiness real

**Files:**
- Create: `src/focusquest/core/database.py`
- Create: `src/focusquest/main.py`
- Create: `tests/integration/__init__.py`
- Create: `tests/integration/conftest.py`
- Create: `tests/integration/test_health.py`

**Interfaces:**
- Consumes: `Settings` da Task 3.
- Produces: `create_engine_from_url(url: str) -> Engine`, o app FastAPI em `focusquest.main:app`, a dependência `get_engine()`, e as rotas `GET /health` e `GET /ready`.

- [ ] **Step 1: Escrever os testes de integração**

`tests/integration/conftest.py`:

```python
"""Fixtures de integracao. Usam PostgreSQL real, nunca SQLite (README s10)."""

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings()


@pytest.fixture(scope="session")
def engine(settings: Settings) -> Iterator[Engine]:
    engine = create_engine_from_url(settings.test_database_url)
    yield engine
    engine.dispose()
```

`tests/integration/test_health.py`:

```python
"""Liveness nao toca no banco; readiness toca de verdade."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from focusquest.main import app, get_engine


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    app.dependency_overrides[get_engine] = lambda: engine
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_health_responde_sem_banco() -> None:
    # Sem override: nenhuma dependencia de banco e resolvida.
    with TestClient(app) as c:
        resposta = c.get("/health")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok"}


def test_ready_confirma_o_banco(client: TestClient) -> None:
    resposta = client.get("/ready")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok", "database": "ok"}


def test_ready_falha_quando_o_banco_nao_responde() -> None:
    quebrado = create_engine_from_url(
        "postgresql+psycopg://focusquest:focusquest_local@127.0.0.1:1/inexistente"
    )
    app.dependency_overrides[get_engine] = lambda: quebrado
    with TestClient(app) as c:
        resposta = c.get("/ready")
    app.dependency_overrides.clear()
    quebrado.dispose()

    assert resposta.status_code == 503
    assert resposta.json()["database"] == "indisponivel"
```

O import de `Iterator` vem de `collections.abc`; acrescente-o ao topo do arquivo de teste.

O terceiro teste é o que dá sentido ao readiness: apontar para uma porta onde nada escuta e exigir 503. Um readiness que nunca foi visto falhando pode não estar verificando nada.

- [ ] **Step 2: Rodar e ver falhar**

```bash
make db-up
uv run pytest tests/integration/test_health.py -v
```

Esperado: **FALHA** com `ModuleNotFoundError: No module named 'focusquest.core.database'`.

- [ ] **Step 3: Implementar a conexão**

`src/focusquest/core/database.py`:

```python
"""Engine e sessao do SQLAlchemy."""

from sqlalchemy import Engine, create_engine


def create_engine_from_url(url: str) -> Engine:
    """Cria a engine. `pool_pre_ping` evita entregar conexao morta apos o
    banco reiniciar, o que acontece com frequencia em desenvolvimento."""
    return create_engine(url, pool_pre_ping=True, future=True)
```

**Não** acrescente uma `session_factory` aqui. Ela só terá consumidor na Task 9,
e código sem chamador reprova a cobertura de 100% no Step 6 desta tarefa. A
dependência de sessão nasce onde é usada.

- [ ] **Step 4: Implementar o app**

`src/focusquest/main.py`:

```python
"""Aplicacao FastAPI do FocusQuest."""

from typing import Annotated, Any

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url

app = FastAPI(title="FocusQuest")

_engine: Engine | None = None


def get_engine() -> Engine:
    """Engine compartilhada, criada na primeira chamada.

    Os testes substituem esta dependencia; por isso ela e uma funcao e nao
    uma variavel de modulo lida diretamente.
    """
    global _engine
    if _engine is None:
        _engine = create_engine_from_url(Settings().database_url)
    return _engine


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness. NAO toca no banco: um liveness que consulta o banco derruba
    o processo toda vez que o banco pisca."""
    return {"status": "ok"}


@app.get("/ready")
def ready(engine: Annotated[Engine, Depends(get_engine)]) -> Any:
    """Readiness. Abre conexao e consulta de verdade: um readiness que nao
    consulta mente sobre estar pronto."""
    try:
        with engine.connect() as conexao:
            conexao.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse(
            status_code=503,
            content={"status": "indisponivel", "database": "indisponivel"},
        )
    return {"status": "ok", "database": "ok"}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
uv run pytest tests/integration -v
```

Esperado: os três testes passam. O terceiro leva alguns segundos — é o tempo de a conexão recusar.

- [ ] **Step 6: Verificar o gate inteiro**

```bash
make check
```

Esperado: passa, com cobertura do Python em 100%. Se algum ramo ficar descoberto, o relatório nomeia a linha — cubra com teste, **não** com exclusão.

- [ ] **Step 7: Commit**

```bash
git add src/focusquest tests/integration
git commit -m "feat: conexao, liveness e readiness real do banco

/health nao toca no banco: um liveness que consulta derruba o processo
quando o banco pisca. /ready abre conexao e executa SELECT 1, e devolve
503 quando o banco nao responde.

O teste que aponta para uma porta onde nada escuta e o que da sentido ao
readiness: um readiness que nunca foi visto falhando pode nao estar
verificando nada."
```

---

### Task 5: Domínio da missão

**Files:**
- Create: `src/focusquest/modules/__init__.py`
- Create: `src/focusquest/modules/missions/__init__.py`
- Create: `src/focusquest/modules/missions/domain.py`
- Create: `tests/unit/test_missions_domain.py`

**Interfaces:**
- Consumes: nada. **Este módulo não importa FastAPI nem SQLAlchemy** (README §3).
- Produces: `MissionState` (StrEnum com `PENDENTE`, `EM_ANDAMENTO`, `CONCLUIDA`), `TransicaoIlegalError`, `validar_transicao(atual, destino) -> None`, `xp_para_dificuldade(dificuldade: int) -> int`, `duracao_real(started_at, completed_at) -> timedelta | None`.

- [ ] **Step 1: Escrever os testes do domínio**

`tests/unit/test_missions_domain.py`:

```python
"""Regras da missao, sem banco e sem framework."""

from datetime import UTC, datetime, timedelta

import pytest

from focusquest.modules.missions.domain import (
    MissionState,
    TransicaoIlegalError,
    duracao_real,
    validar_transicao,
    xp_para_dificuldade,
)


@pytest.mark.parametrize(
    ("atual", "destino"),
    [
        (MissionState.PENDENTE, MissionState.EM_ANDAMENTO),
        (MissionState.PENDENTE, MissionState.CONCLUIDA),
        (MissionState.EM_ANDAMENTO, MissionState.CONCLUIDA),
    ],
)
def test_transicoes_legais(atual: MissionState, destino: MissionState) -> None:
    validar_transicao(atual, destino)


@pytest.mark.parametrize(
    ("atual", "destino"),
    [
        (MissionState.CONCLUIDA, MissionState.PENDENTE),
        (MissionState.CONCLUIDA, MissionState.EM_ANDAMENTO),
        (MissionState.CONCLUIDA, MissionState.CONCLUIDA),
        (MissionState.EM_ANDAMENTO, MissionState.PENDENTE),
        (MissionState.PENDENTE, MissionState.PENDENTE),
    ],
)
def test_transicoes_ilegais_explicam_o_bloqueio(
    atual: MissionState, destino: MissionState
) -> None:
    with pytest.raises(TransicaoIlegalError) as erro:
        validar_transicao(atual, destino)
    # O README s8 exige "Explique bloqueios": a mensagem precisa nomear
    # os dois estados, nao apenas dizer "invalido".
    assert atual.value in str(erro.value)
    assert destino.value in str(erro.value)


def test_concluida_e_terminal() -> None:
    for destino in MissionState:
        with pytest.raises(TransicaoIlegalError):
            validar_transicao(MissionState.CONCLUIDA, destino)


def test_duracao_real_e_none_enquanto_nao_concluida() -> None:
    assert duracao_real(datetime.now(UTC), None) is None
    assert duracao_real(None, None) is None


def test_duracao_real_quando_concluida() -> None:
    inicio = datetime(2026, 9, 17, 10, 0, tzinfo=UTC)
    fim = datetime(2026, 9, 17, 11, 30, tzinfo=UTC)
    assert duracao_real(inicio, fim) == timedelta(hours=1, minutes=30)


def test_duracao_real_sem_inicio_e_none() -> None:
    assert duracao_real(None, datetime.now(UTC)) is None


@pytest.mark.parametrize("dificuldade", [1, 2, 3, 4, 5])
def test_xp_cresce_com_a_dificuldade(dificuldade: int) -> None:
    if dificuldade > 1:
        assert xp_para_dificuldade(dificuldade) > xp_para_dificuldade(dificuldade - 1)


def test_xp_e_sempre_positivo() -> None:
    for dificuldade in range(1, 11):
        assert xp_para_dificuldade(dificuldade) > 0


def test_xp_rejeita_dificuldade_invalida() -> None:
    with pytest.raises(ValueError):
        xp_para_dificuldade(0)
    with pytest.raises(ValueError):
        xp_para_dificuldade(-1)
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
uv run pytest tests/unit/test_missions_domain.py -v
```

Esperado: **FALHA** com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar o domínio, deixando a fórmula do XP para o usuário**

`src/focusquest/modules/missions/domain.py`:

```python
"""Regras da missao, independentes de framework e de persistencia."""

from datetime import datetime, timedelta
from enum import StrEnum


class MissionState(StrEnum):
    """Estados possiveis de uma missao.

    CONCLUIDA e terminal. Isso nao e economia de estados: e o que faz
    "reenvios nao duplicam conclusoes" (README s8) vir da estrutura em vez
    de depender de codigo defensivo lembrar de checar.
    """

    PENDENTE = "pendente"
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDA = "concluida"


class TransicaoIlegalError(Exception):
    """Transicao de estado que as regras nao permitem."""


_TRANSICOES: dict[MissionState, frozenset[MissionState]] = {
    MissionState.PENDENTE: frozenset(
        {MissionState.EM_ANDAMENTO, MissionState.CONCLUIDA}
    ),
    MissionState.EM_ANDAMENTO: frozenset({MissionState.CONCLUIDA}),
    MissionState.CONCLUIDA: frozenset(),
}


def validar_transicao(atual: MissionState, destino: MissionState) -> None:
    """Valida a transicao. Levanta TransicaoIlegalError explicando o bloqueio."""
    if destino not in _TRANSICOES[atual]:
        permitidos = sorted(e.value for e in _TRANSICOES[atual])
        alvo = ", ".join(permitidos) if permitidos else "nenhum estado"
        raise TransicaoIlegalError(
            f"nao e possivel ir de '{atual.value}' para '{destino.value}'; "
            f"a partir de '{atual.value}' so se pode ir para: {alvo}"
        )


def duracao_real(
    started_at: datetime | None, completed_at: datetime | None
) -> timedelta | None:
    """Duracao real, derivada dos instantes.

    Nao e armazenada: um campo a mais seria mais um lugar para discordar do
    par (started_at, completed_at). Mesmo motivo do XP.
    """
    if started_at is None or completed_at is None:
        return None
    return completed_at - started_at


def xp_para_dificuldade(dificuldade: int) -> int:
    """XP concedido por uma missao, derivado da dificuldade.

    A dificuldade e um inteiro a partir de 1.

    TODO(usuario): escrever a formula.

    Trade-offs a considerar:
    - LINEAR (ex.: dificuldade * 10) e previsivel e facil de explicar, mas
      torna missoes faceis a forma mais eficiente de ganhar XP por hora.
    - QUADRATICA ou EXPONENCIAL premia encarar o dificil, e e o que costuma
      fazer um sistema de progressao parecer justo -- mas cresce rapido, e
      dificuldade 10 pode valer centenas de vezes a dificuldade 1.
    - COM PISO (ex.: base + curva) garante que nenhuma missao valha quase
      nada, o que importa quando a missao facil e a que destrava o habito.

    Os testes ja escritos exigem: valor sempre positivo, estritamente
    crescente com a dificuldade, e ValueError para dificuldade < 1.
    """
    raise NotImplementedError("TODO(usuario): escrever a formula do XP")
```

- [ ] **Step 4: PARADA — o usuário escreve a fórmula**

Apresente ao usuário: os testes que descrevem o comportamento esperado, os três trade-offs, e o fato de que a fórmula muda como o jogo se sente. **Não escreva a fórmula.** Aguarde.

- [ ] **Step 5: Rodar e ver passar**

```bash
uv run pytest tests/unit/test_missions_domain.py -v
```

Esperado: todos passam depois que a fórmula estiver escrita.

- [ ] **Step 6: Verificar a cobertura do domínio**

```bash
make check-api
```

Esperado: 100%. Se a fórmula do usuário tiver ramos (um `if` de piso, por exemplo), acrescente teste para cada ramo — e avise o usuário de qual ramo faltou, em vez de cobrir por conta própria.

- [ ] **Step 7: Commit**

```bash
git add src/focusquest/modules tests/unit/test_missions_domain.py
git commit -m "feat: regras de dominio da missao

Estados, transicoes e duracao real, sem framework e sem banco. CONCLUIDA
e terminal: e o que faz 'reenvios nao duplicam conclusoes' vir da
estrutura em vez de codigo defensivo.

A mensagem de transicao ilegal nomeia os dois estados e lista os destinos
legais, porque o README s8 exige explicar bloqueios.

Formula do XP escrita pelo usuario."
```

---

### Task 6: Alembic e a migração inicial

**Files:**
- Create: `alembic.ini`
- Create: `alembic/env.py`
- Create: `alembic/script.py.mako`
- Create: `alembic/versions/0001_esquema_inicial.py`
- Create: `src/focusquest/core/base.py`
- Create: `tests/integration/test_migrations.py`
- Modify: `Makefile`

**Interfaces:**
- Consumes: `Settings` (Task 3), `MissionState` (Task 5).
- Produces: `Base` declarativa em `focusquest.core.base`; as tabelas `users`, `missions` e `mission_operations`; alvos `make migrate` e `make migrate-test`.

- [ ] **Step 1: Criar a base declarativa**

`src/focusquest/core/base.py`:

```python
"""Base declarativa do SQLAlchemy, compartilhada por todos os modulos."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

- [ ] **Step 2: Inicializar o Alembic**

```bash
uv run alembic init -t generic alembic
```

Isso cria `alembic.ini`, `alembic/env.py` e `alembic/script.py.mako`. Em seguida ajuste:

Em `alembic.ini`, **remova** a linha `sqlalchemy.url = ...` — a URL vem do ambiente, e deixá-la ali é convite a apontar para o banco errado.

Substitua o corpo de `alembic/env.py` pelo seguinte:

```python
"""Ambiente do Alembic. A URL vem da configuracao, nunca do alembic.ini."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from focusquest.core.base import Base
from focusquest.core.config import Settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    """URL do banco.

    `-x test=true` aponta para o banco de teste. Sem isso, rodar a suite de
    migracao apagaria o banco de desenvolvimento -- e o README s10 manda
    recusar alvos de desenvolvimento.
    """
    settings = Settings()
    if context.get_x_argument(as_dictionary=True).get("test") == "true":
        return settings.test_database_url
    return settings.database_url


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _url()
    connectable = engine_from_config(
        section, prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 3: Escrever a migração à mão**

Não use `--autogenerate` nesta primeira: a restrição `CHECK` do estado e os índices precisam ser explícitos, e revisar um autogenerate custa mais do que escrever.

`alembic/versions/0001_esquema_inicial.py`:

```python
"""Esquema inicial: users, missions e mission_operations.

Revision ID: 0001
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

ESTADOS = ("pendente", "em_andamento", "concluida")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("display_name", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Usuario unico local e DECLARADO (README s8). Nao ha login; esta linha
    # existe porque missao pertence a alguem e a chave estrangeira precisa
    # de destino.
    op.bulk_insert(
        sa.table(
            "users",
            sa.column("id", sa.Integer),
            sa.column("display_name", sa.Text),
        ),
        [{"id": 1, "display_name": "Estudante"}],
    )

    op.create_table(
        "missions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("instructions", sa.Text, nullable=False),
        sa.Column("completion_criterion", sa.Text, nullable=False),
        sa.Column("difficulty", sa.Integer, nullable=False),
        sa.Column("estimated_minutes", sa.Integer, nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.Text, nullable=False, server_default="pendente"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        # VARCHAR + CHECK em vez de ENUM nativo (decisao A6 da spec):
        # acrescentar um estado depois e uma migracao comum, dentro de
        # transacao, em vez de ALTER TYPE ADD VALUE.
        sa.CheckConstraint(
            "state IN " + str(ESTADOS),
            name="ck_missions_state",
        ),
        sa.CheckConstraint("difficulty >= 1", name="ck_missions_difficulty"),
        sa.CheckConstraint(
            "estimated_minutes > 0",
            name="ck_missions_estimated_minutes",
        ),
    )
    op.create_index("ix_missions_user_id", "missions", ["user_id"])

    # Idempotencia: o identificador de operacao enviado pelo cliente, com
    # restricao unica. E o que sustenta "reenviar devolve o mesmo sucesso"
    # mesmo sob concorrencia (README s8).
    op.create_table(
        "mission_operations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("operation_id", sa.Text, nullable=False),
        sa.Column(
            "mission_id",
            sa.Integer,
            sa.ForeignKey("missions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("operation_id", name="uq_mission_operations_operation_id"),
    )


def downgrade() -> None:
    op.drop_table("mission_operations")
    op.drop_index("ix_missions_user_id", table_name="missions")
    op.drop_table("missions")
    op.drop_table("users")
```

- [ ] **Step 4: Escrever o teste da migração em banco vazio**

`tests/integration/test_migrations.py`:

```python
"""A migracao precisa aplicar em banco VAZIO (README s10)."""

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, inspect, text


def _alembic_config() -> Config:
    cfg = Config("alembic.ini")
    cfg.cmd_opts = type("Opts", (), {"x": ["test=true"]})()  # type: ignore[assignment]
    return cfg


def test_migracao_aplica_em_banco_vazio(engine: Engine) -> None:
    with engine.begin() as conexao:
        conexao.execute(text("DROP SCHEMA public CASCADE"))
        conexao.execute(text("CREATE SCHEMA public"))

    command.upgrade(_alembic_config(), "head")

    tabelas = set(inspect(engine).get_table_names())
    assert {"users", "missions", "mission_operations", "alembic_version"} <= tabelas


def test_migracao_cria_o_usuario_unico(engine: Engine) -> None:
    with engine.connect() as conexao:
        total = conexao.execute(text("SELECT count(*) FROM users")).scalar_one()
    assert total == 1


def test_check_de_estado_rejeita_valor_invalido(engine: Engine) -> None:
    from sqlalchemy.exc import IntegrityError

    import pytest

    with pytest.raises(IntegrityError):
        with engine.begin() as conexao:
            conexao.execute(
                text(
                    "INSERT INTO missions "
                    "(user_id, instructions, completion_criterion, difficulty, "
                    " estimated_minutes, deadline, state) VALUES "
                    "(1, 'x', 'y', 1, 30, now(), 'estado_invalido')"
                )
            )
```

O terceiro teste é o que prova que a restrição vive no banco, e não só no Python: um `UPDATE` direto no psql também seria rejeitado.

- [ ] **Step 5: Rodar a migração e os testes**

```bash
make db-up
uv run alembic -x test=true upgrade head
uv run alembic upgrade head
uv run pytest tests/integration/test_migrations.py -v
```

Esperado: os três testes passam.

- [ ] **Step 6: Acrescentar os alvos ao Makefile**

```make
.PHONY: help bootstrap check check-web check-api check-secrets format db-up db-down migrate migrate-test

migrate: ## Aplica as migracoes no banco de desenvolvimento
	uv run alembic upgrade head

migrate-test: ## Aplica as migracoes no banco de teste
	uv run alembic -x test=true upgrade head
```

- [ ] **Step 7: Commit**

```bash
git add alembic alembic.ini src/focusquest/core/base.py tests/integration/test_migrations.py Makefile
git commit -m "feat: migracao inicial com users, missions e mission_operations

Escrita a mao em vez de autogenerate: a restricao CHECK do estado e os
indices precisam ser explicitos, e revisar um autogenerate custa mais que
escrever.

VARCHAR + CHECK em vez de ENUM nativo (decisao A6): acrescentar um estado
depois e migracao comum dentro de transacao, em vez de ALTER TYPE ADD
VALUE, que historicamente nao roda em transacao.

A URL vem da configuracao, nunca do alembic.ini, e -x test=true aponta
para o banco de teste -- sem isso a suite apagaria o de desenvolvimento.

mission_operations com restricao unica no identificador de operacao: e o
que sustenta 'reenviar devolve o mesmo sucesso' sob concorrencia."
```

---

### Task 7: Modelo e persistência da missão

**Files:**
- Create: `src/focusquest/modules/missions/models.py`
- Create: `tests/integration/test_missions_models.py`
- Modify: `tests/integration/conftest.py`

**Interfaces:**
- Consumes: `Base` (Task 6), `MissionState` (Task 5).
- Produces: `Mission` e `MissionOperation` mapeados; fixture `session` que dá `Session` com rollback ao final de cada teste.

- [ ] **Step 1: Acrescentar a fixture de sessão isolada**

Ao final de `tests/integration/conftest.py`:

```python
from sqlalchemy.orm import Session


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    """Sessao com rollback ao final: um teste nunca ve o que outro escreveu."""
    conexao = engine.connect()
    transacao = conexao.begin()
    sessao = Session(bind=conexao, expire_on_commit=False)
    yield sessao
    sessao.close()
    transacao.rollback()
    conexao.close()
```

Transação externa com rollback é o que torna os testes independentes sem truncar tabelas entre eles — mais rápido e mais seguro.

- [ ] **Step 2: Escrever os testes de persistência**

`tests/integration/test_missions_models.py`:

```python
"""Persistencia da missao, contra PostgreSQL real."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.domain import MissionState
from focusquest.modules.missions.models import Mission, MissionOperation


def _missao(**kwargs: object) -> Mission:
    base: dict[str, object] = {
        "user_id": 1,
        "instructions": "Ler o capitulo 3",
        "completion_criterion": "Resumo de uma pagina entregue",
        "difficulty": 3,
        "estimated_minutes": 60,
        "deadline": datetime.now(UTC) + timedelta(days=1),
        "state": MissionState.PENDENTE,
    }
    base.update(kwargs)
    return Mission(**base)  # type: ignore[arg-type]


def test_persiste_e_recupera(session: Session) -> None:
    missao = _missao()
    session.add(missao)
    session.flush()
    assert missao.id is not None
    assert missao.state is MissionState.PENDENTE


def test_instante_volta_com_timezone(session: Session) -> None:
    missao = _missao()
    session.add(missao)
    session.flush()
    session.refresh(missao)
    assert missao.deadline.tzinfo is not None


def test_dificuldade_menor_que_um_e_rejeitada(session: Session) -> None:
    session.add(_missao(difficulty=0))
    with pytest.raises(IntegrityError):
        session.flush()


def test_usuario_inexistente_e_rejeitado(session: Session) -> None:
    session.add(_missao(user_id=9999))
    with pytest.raises(IntegrityError):
        session.flush()


def test_identificador_de_operacao_e_unico(session: Session) -> None:
    missao = _missao()
    session.add(missao)
    session.flush()
    session.add(
        MissionOperation(operation_id="op-1", mission_id=missao.id, kind="complete")
    )
    session.flush()
    session.add(
        MissionOperation(operation_id="op-1", mission_id=missao.id, kind="complete")
    )
    with pytest.raises(IntegrityError):
        session.flush()
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
uv run pytest tests/integration/test_missions_models.py -v
```

Esperado: **FALHA** com `ModuleNotFoundError`.

- [ ] **Step 4: Implementar os modelos**

`src/focusquest/modules/missions/models.py`:

```python
"""Mapeamento SQLAlchemy da missao."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from focusquest.core.base import Base
from focusquest.modules.missions.domain import MissionState


class Mission(Base):
    __tablename__ = "missions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )
    instructions: Mapped[str] = mapped_column(Text)
    completion_criterion: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[int] = mapped_column(Integer)
    estimated_minutes: Mapped[int] = mapped_column(Integer)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # O estado e texto no banco (VARCHAR + CHECK) e StrEnum no Python.
    state: Mapped[MissionState] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class MissionOperation(Base):
    """Registro de uma operacao idempotente sobre uma missao."""

    __tablename__ = "mission_operations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    operation_id: Mapped[str] = mapped_column(Text, unique=True)
    mission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("missions.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

- [ ] **Step 5: Rodar e ver passar**

```bash
make migrate-test
uv run pytest tests/integration/test_missions_models.py -v
```

- [ ] **Step 6: Commit**

```bash
git add src/focusquest/modules/missions/models.py tests/integration
git commit -m "feat: mapeamento e persistencia da missao

Testes contra PostgreSQL real, nunca SQLite (README s10). A fixture de
sessao usa transacao externa com rollback: cada teste fica isolado sem
truncar tabelas entre eles.

Os testes de restricao provam que as regras vivem no BANCO, nao so no
Python: dificuldade zero e usuario inexistente sao rejeitados pelo
PostgreSQL."
```

---

### Task 8: Serviço, idempotência e concorrência

**Files:**
- Create: `src/focusquest/core/errors.py`
- Create: `src/focusquest/modules/missions/service.py`
- Create: `tests/integration/test_missions_service.py`
- Create: `tests/integration/test_missions_concorrencia.py`

**Interfaces:**
- Consumes: `Mission`, `MissionOperation` (Task 7), domínio (Task 5).
- Produces: `criar_missao(...) -> Mission`, `listar_missoes(session, user_id) -> list[Mission]`, `concluir_missao(session, user_id, mission_id, operation_id) -> Mission`; erros `MissaoNaoEncontradaError` e `NaoPertenceAoUsuarioError`.

- [ ] **Step 1: Escrever os erros comuns**

`src/focusquest/core/errors.py`:

```python
"""Erros de dominio comuns, traduzidos para HTTP pelos handlers."""


class DomainError(Exception):
    """Base de todo erro previsto pelo dominio."""


class MissaoNaoEncontradaError(DomainError):
    pass


class NaoPertenceAoUsuarioError(DomainError):
    pass
```

- [ ] **Step 2: Escrever os testes do serviço**

`tests/integration/test_missions_service.py` cobre, um teste por caso:

1. criar devolve missão em `pendente`
2. listar devolve só as missões do usuário pedido
3. concluir passa para `concluida` e preenche `completed_at`
4. concluir missão inexistente levanta `MissaoNaoEncontradaError`
5. concluir missão de outro usuário levanta `NaoPertenceAoUsuarioError`
6. concluir já concluída, **com identificador de operação diferente**, levanta `TransicaoIlegalError`
7. concluir já concluída, **com o mesmo identificador**, devolve a mesma missão sem erro

Os casos 6 e 7 são o par que a spec desambiguou e não podem ser fundidos: reenviar não é erro, tentar de novo é.

```python
def test_reenviar_a_mesma_operacao_devolve_o_mesmo_sucesso(session: Session) -> None:
    missao = criar_missao(
        session,
        user_id=1,
        instructions="x",
        completion_criterion="y",
        difficulty=2,
        estimated_minutes=30,
        deadline=datetime.now(UTC) + timedelta(days=1),
    )
    session.flush()
    primeira = concluir_missao(session, 1, missao.id, "op-abc")
    segunda = concluir_missao(session, 1, missao.id, "op-abc")
    assert primeira.id == segunda.id
    assert segunda.state is MissionState.CONCLUIDA


def test_operacao_nova_sobre_missao_concluida_e_bloqueada(session: Session) -> None:
    missao = criar_missao(
        session,
        user_id=1,
        instructions="x",
        completion_criterion="y",
        difficulty=2,
        estimated_minutes=30,
        deadline=datetime.now(UTC) + timedelta(days=1),
    )
    session.flush()
    concluir_missao(session, 1, missao.id, "op-abc")
    with pytest.raises(TransicaoIlegalError):
        concluir_missao(session, 1, missao.id, "op-xyz")
```

- [ ] **Step 3: Implementar o serviço**

`src/focusquest/modules/missions/service.py`. O ponto central de `concluir_missao`:

```python
def concluir_missao(
    session: Session, user_id: int, mission_id: int, operation_id: str
) -> Mission:
    """Conclui a missao, de forma idempotente pelo identificador de operacao.

    Reenviar a MESMA operacao devolve o mesmo sucesso. Uma operacao NOVA
    sobre missao ja concluida e uma transicao ilegal e recebe erro. Confundir
    as duas coisas quebra o cliente ou deixa passar conclusao duplicada.
    """
    ja_feita = session.scalar(
        select(MissionOperation).where(MissionOperation.operation_id == operation_id)
    )
    if ja_feita is not None:
        return _buscar(session, user_id, ja_feita.mission_id)

    missao = _buscar(session, user_id, mission_id)
    validar_transicao(missao.state, MissionState.CONCLUIDA)
    missao.state = MissionState.CONCLUIDA
    missao.completed_at = datetime.now(UTC)
    session.add(
        MissionOperation(
            operation_id=operation_id, mission_id=missao.id, kind="complete"
        )
    )
    session.flush()
    return missao
```

E o auxiliar que distingue os dois bloqueios que o §8 manda explicar:

```python
def _buscar(session: Session, user_id: int, mission_id: int) -> Mission:
    missao = session.get(Mission, mission_id)
    if missao is None:
        raise MissaoNaoEncontradaError(f"missao {mission_id} nao existe")
    if missao.user_id != user_id:
        raise NaoPertenceAoUsuarioError(
            f"missao {mission_id} nao pertence ao usuario {user_id}"
        )
    return missao
```

São erros distintos no domínio mesmo devolvendo o mesmo status HTTP (Task 9):
a distinção é informação para quem lê o log, e o status é informação para quem
está do outro lado da rede. Não são a mesma pergunta.

- [ ] **Step 4: Escrever o teste de concorrência**

`tests/integration/test_missions_concorrencia.py`. O §8 exige testar concorrência, não só repetição sequencial. Duas threads, com barreira para partirem juntas, cada uma na **sua própria conexão** — a fixture `session` não serve aqui porque compartilha transação.

```python
def test_duas_conclusoes_simultaneas_produzem_uma_so(engine: Engine) -> None:
    # ... cria a missao numa sessao propria e commita ...
    barreira = threading.Barrier(2)
    resultados: list[str] = []

    def tentar(operation_id: str) -> None:
        with Session(bind=engine) as s:
            barreira.wait()
            try:
                concluir_missao(s, 1, mission_id, operation_id)
                s.commit()
                resultados.append("ok")
            except IntegrityError, TransicaoIlegalError:
                s.rollback()
                resultados.append("bloqueado")

    threads = [threading.Thread(target=tentar, args=(f"op-{i}",)) for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(resultados) == ["bloqueado", "ok"]
    # E apenas UMA operacao registrada.
    with Session(bind=engine) as s:
        total = s.scalar(select(func.count()).select_from(MissionOperation))
    assert total == 1
```

`threading.Barrier` em vez de `sleep`: o teste fica determinístico em vez de depender de tempo.

- [ ] **Step 5: Rodar tudo e verificar a cobertura**

```bash
make check-api
```

Esperado: passa, 100%. Cada `raise` do serviço precisa de um teste que o alcance.

- [ ] **Step 6: Commit**

```bash
git add src/focusquest/core/errors.py src/focusquest/modules/missions/service.py tests/integration
git commit -m "feat: casos de uso da missao, com idempotencia sob concorrencia

Reenviar a MESMA operacao devolve o mesmo sucesso; uma operacao NOVA
sobre missao concluida recebe erro de transicao ilegal. Sao comportamentos
opostos e confundi-los quebra o cliente ou deixa passar duplicata.

O teste de concorrencia usa threading.Barrier em vez de sleep: duas
conexoes partem juntas e exatamente uma vence, garantido pela restricao
unica no banco."
```

---

### Task 9: Router, schemas e handlers de erro

**Files:**
- Create: `src/focusquest/modules/missions/schemas.py`
- Create: `src/focusquest/modules/missions/router.py`
- Modify: `src/focusquest/main.py`
- Create: `tests/integration/test_missions_api.py`

**Interfaces:**
- Consumes: o serviço da Task 8.
- Produces: `POST /api/missions`, `GET /api/missions`, `POST /api/missions/{id}/complete`; handlers que traduzem `DomainError` e `TransicaoIlegalError` para HTTP.

- [ ] **Step 1: Escrever os testes da API**

`tests/integration/test_missions_api.py` cobre, via `TestClient`: criar devolve 201 com o corpo; listar devolve o que foi criado; concluir devolve 200 e o estado novo; missão inexistente devolve **404**; transição ilegal devolve **409** com mensagem que explica o bloqueio; reenviar o mesmo `operation_id` devolve **200** de novo; e o XP aparece no corpo, derivado da dificuldade.

Cada código de status precisa de um teste próprio — são ramos distintos e a cobertura exige todos.

- [ ] **Step 2: Implementar os schemas**

`src/focusquest/modules/missions/schemas.py`:

```python
"""Contratos de entrada e saida da missao."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from focusquest.modules.missions.domain import (
    MissionState,
    duracao_real,
    xp_para_dificuldade,
)


class MissionCreate(BaseModel):
    instructions: str = Field(min_length=1)
    completion_criterion: str = Field(min_length=1)
    difficulty: int = Field(ge=1)
    estimated_minutes: int = Field(gt=0)
    deadline: datetime


class MissionComplete(BaseModel):
    operation_id: str = Field(min_length=1)


class MissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    instructions: str
    completion_criterion: str
    difficulty: int
    estimated_minutes: int
    deadline: datetime
    state: MissionState
    started_at: datetime | None
    completed_at: datetime | None

    @computed_field
    @property
    def xp(self) -> int:
        """Derivado da dificuldade, nunca armazenado (decisao A4)."""
        return xp_para_dificuldade(self.difficulty)

    @computed_field
    @property
    def duracao_real_minutos(self) -> int | None:
        duracao = duracao_real(self.started_at, self.completed_at)
        return None if duracao is None else int(duracao.total_seconds() // 60)
```

Repare que `xp` e `duracao_real_minutos` são campos **computados**: não existem
no banco e não podem discordar da fonte.

- [ ] **Step 3: Implementar o router e os handlers**

`router.py` com as três rotas e a dependência de sessão. Em `main.py`, registre o router e os handlers:

```python
@app.exception_handler(MissaoNaoEncontradaError)
def _nao_encontrada(request: Request, exc: MissaoNaoEncontradaError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detalhe": str(exc)})


@app.exception_handler(NaoPertenceAoUsuarioError)
def _nao_pertence(request: Request, exc: NaoPertenceAoUsuarioError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detalhe": str(exc)})


@app.exception_handler(TransicaoIlegalError)
def _transicao_ilegal(request: Request, exc: TransicaoIlegalError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detalhe": str(exc)})
```

`NaoPertenceAoUsuarioError` devolve **404**, não 403: dizer "existe, mas não é seu" vaza a existência do recurso. Com usuário único isso é teórico, mas o hábito certo se estabelece agora.

- [ ] **Step 4: Verificar**

```bash
make check
```

- [ ] **Step 5: Commit**

```bash
git add src/focusquest tests/integration/test_missions_api.py
git commit -m "feat: endpoints de missao com handlers de erro

Transicao ilegal devolve 409 com a mensagem que explica o bloqueio; missao
inexistente e missao de outro usuario devolvem ambas 404 -- dizer 'existe
mas nao e seu' vazaria a existencia do recurso."
```

---

### Task 10: Quartel-General no frontend

**Files:**
- Create: `frontend/src/shared/api/client.ts`
- Create: `frontend/src/shared/api/client.test.ts`
- Create: `frontend/src/features/missions/types.ts`
- Create: `frontend/src/features/missions/useMissions.ts`
- Create: `frontend/src/features/missions/useMissions.test.tsx`
- Create: `frontend/src/features/missions/MissionList.tsx`
- Create: `frontend/src/features/missions/MissionList.test.tsx`
- Create: `frontend/src/pages/Headquarters.tsx`
- Create: `frontend/src/pages/Headquarters.test.tsx`
- Modify: `frontend/src/App.tsx` e `frontend/src/App.test.tsx`
- Create: `frontend/.env.example`

**Interfaces:**
- Consumes: `GET /api/missions`.
- Produces: a tela que o E2E da Task 11 vai exercitar, com `data-testid` estáveis.

- [ ] **Step 1: Escrever os testes primeiro**

Cada arquivo `.test.tsx` acompanha seu módulo. Os estados que o §7 exige e que **cada um é um ramo a cobrir**: carregando, vazio, erro, e lista preenchida. O teste de erro precisa de um `fetch` que rejeita; o de vazio, de uma resposta `[]`.

- [ ] **Step 2: Implementar o cliente HTTP**

`shared/api/client.ts` centraliza a URL base (de `import.meta.env.VITE_API_URL`) e o tratamento de erro — o §3 manda centralizar cliente HTTP e erros, e proíbe chamadas espalhadas pelos componentes.

- [ ] **Step 3: Implementar hook, lista e página**

A página compõe a feature; a feature não conhece a página. Textos em português do Brasil; identificadores em inglês.

- [ ] **Step 4: Verificar cobertura de 100%**

```bash
cd frontend && npm run test:coverage
```

Esperado: 100% nos quatro eixos. Cada estado (carregando, vazio, erro, lista) é um ramo.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat: Quartel-General listando as missoes da API

Cliente HTTP centralizado em shared/api, com a URL base em variavel de
ambiente. A pagina compoe a feature; a feature nao conhece a pagina.

Os quatro estados que o README s7 exige -- carregando, vazio, erro e lista
-- sao quatro ramos, e cada um tem teste proprio."
```

---

### Task 11: `check-e2e` entra no gate, e o CI ganha os dois jobs

**Files:**
- Create: `frontend/playwright.config.ts`
- Create: `frontend/tests/e2e/headquarters.spec.ts`
- Create: `scripts/e2e-env.sh`
- Modify: `frontend/package.json`, `Makefile`, `.github/workflows/quality.yml`

**Interfaces:**
- Consumes: a API (Tasks 4–9) e a tela (Task 10).
- Produces: `make check-e2e`; jobs `check-api` e `check-e2e` no CI; o agregador `quality-gate` passa a exigir os quatro.

- [ ] **Step 1: Instalar o Playwright e o axe**

```bash
cd frontend && npm install -D @playwright/test@1.63.0 @axe-core/playwright@4.13.0
cd frontend && npx playwright install --with-deps chromium
```

- [ ] **Step 2: Configurar o Playwright com servidores próprios**

`playwright.config.ts` usa `webServer` para subir **API e frontend próprios**, em portas dedicadas (API 8100, frontend 5273), com `reuseExistingServer: false` — o §10 proíbe reutilizar servidores pessoais.

- [ ] **Step 3: Escrever o cenário e a checagem de acessibilidade**

`headquarters.spec.ts`: popula o banco de teste com dados determinísticos, abre a página, confere que as missões aparecem, e roda `AxeBuilder` exigindo zero violações.

- [ ] **Step 4: Acrescentar o alvo**

```make
check-e2e: ## Build e testes ponta a ponta com Playwright e axe-core
	cd $(WEB) && npm run build
	cd $(WEB) && npx playwright test
```

E `check: check-web check-api check-e2e check-secrets`.

- [ ] **Step 5: Acrescentar os jobs ao CI**

Dois jobs novos em `.github/workflows/quality.yml`, mantendo a paridade 1:1. O `check-api` precisa de um serviço PostgreSQL; o `check-e2e` precisa de Node, Python e do Chromium. **Acrescente os dois ao `needs` do `quality-gate`** — esquecer isso faria o agregador aprovar sem verificá-los, que é o risco já registrado em `docs/QUALITY.md`.

- [ ] **Step 6: Validar o workflow**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest .github/workflows/quality.yml
```

- [ ] **Step 7: Verificar o gate completo**

```bash
make check
```

Esperado: os quatro alvos passam.

- [ ] **Step 8: Commit**

```bash
git add frontend Makefile .github/workflows/quality.yml scripts/e2e-env.sh
git commit -m "build: acrescenta check-e2e ao gate e os dois jobs ao CI

Playwright com Chromium e axe-core, subindo API e frontend proprios em
portas dedicadas, sem reutilizar servidores pessoais (README s10).

quality-gate passa a exigir os quatro jobs: esquecer de acrescentar um ao
needs faria o agregador aprovar sem verifica-lo."
```

---

### Task 12: Documentação e handoff

**Files:**
- Modify: `docs/QUALITY.md`, `docs/ARCHITECTURE.md`, `docs/HANDOFF.md`, `AGENTS.md`

**Interfaces:**
- Consumes: tudo.
- Produces: documentação que descreve o sistema como ele ficou.

- [ ] **Step 1: Atualizar `docs/QUALITY.md`**

O roadmap de `check-api` e `check-e2e` deixa de ser contrato e vira descrição: os alvos existem. **A fonte de verdade do contrato do `check-api` migra de `docs/QUALITY.md` §4 para o `Makefile`**, exatamente como aquele documento já previa. A pendência sobre validação do `uv.lock` vence: `uv sync --locked` está no `bootstrap`.

- [ ] **Step 2: Atualizar `docs/ARCHITECTURE.md`**

A árvore real muda bastante. **Gere-a do disco**, não de memória. Os blocos que eram "contrato" para o backend viram "existe" — mas só os que de fato existem: `tutoring`, `progress` e as demais entidades do §8 continuam contrato.

- [ ] **Step 3: Atualizar `docs/HANDOFF.md`**

Revisão-base, decisões A1 a A8, comandos novos (`db-up`, `migrate`, `check-api`, `check-e2e`), resultados, e as pendências que vencem. Acrescente o que 1b vai precisar: provedor Anthropic, `claude-opus-5`, o módulo `tutoring`.

- [ ] **Step 4: Atualizar `AGENTS.md`**

A seção de setup ganha `make db-up` e `make migrate-test`. A regra sobre Ruff e mypy fora do gate **deixa de valer** — eles estão no gate agora. Deixar essa linha ali seria a sétima afirmação falsa do projeto.

- [ ] **Step 5: Verificar e commitar**

```bash
make check
git add docs AGENTS.md
git commit -m "docs: registra o Incremento 1a"
```

---

### Task 13: Pull request

- [ ] **Step 1: Empurrar a branch** — uma ref por vez.
- [ ] **Step 2: Abrir o PR** descrevendo o que entra, as decisões A1 a A8, e o que ficou deliberadamente fora.
- [ ] **Step 3: Confirmar os quatro checks verdes.**
- [ ] **Step 4: PARADA — não mescle.** O merge é do usuário.

---

## Notas de execução

- **Ordem é obrigatória.** A Task 2 liga o gate do Python; a partir dela, todo commit paga Ruff, mypy e cobertura.
- **A Task 5 Step 4 para e espera o usuário** escrever a fórmula do XP. Não escreva por ele.
- **Cobertura de 100% é a maior parte do trabalho**, e concentra-se nos caminhos de erro. Cada `raise` precisa de um teste que o alcance. Quando faltar cobertura, **acrescente teste** — nunca exclusão, nunca `# pragma: no cover`.
- **Nenhum passo usa `--no-verify` ou `SKIP`.** Se um hook bloquear, o defeito é real ou o gate está errado; as duas saídas são corrigir.
- O banco de teste é `focusquest_test`. **Nenhum teste toca o banco de desenvolvimento**, e nenhum toca o PostgreSQL local da porta 5432.
