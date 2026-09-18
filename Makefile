.DEFAULT_GOAL := help
.PHONY: help bootstrap check check-web check-api check-e2e check-secrets format db-up db-down migrate migrate-test

WEB := frontend

# Diretorio das ferramentas baixadas por scripts/. FQ_TOOLS_DIR (absoluto)
# sobrescreve, para o scripts/check-push.sh compartilhar o cache do
# repositorio principal com os worktrees temporarios do pre-push. O binario
# compartilhado continua sendo verificado pelo proprio hash SHA-256 em
# scripts/install-gitleaks.sh.
TOOLS := $(if $(FQ_TOOLS_DIR),$(FQ_TOOLS_DIR),.tools)

help: ## Lista os alvos disponíveis
# O `0-9` na classe de caracteres nao e enfeite: sem ele o `check-e2e` -- o
# unico alvo com digito no nome -- some do `make help`, e um alvo que nao
# aparece na ajuda e um alvo que ninguem descobre.
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

bootstrap: ## Instala as dependencias dos dois ecossistemas
	cd $(WEB) && npm ci
# O navegador do check-e2e. Sem esta linha, um clone novo seguiria o roteiro do
# AGENTS.md (bootstrap, hooks, check) e reprovaria no check-e2e com
# "Executable doesn't exist" -- uma dependencia que nada instala. O binario vai
# para o cache do usuario (fora do repositorio), entao a segunda execucao e
# quase instantanea, inclusive no worktree do pre-push.
#
# SEM `--with-deps` de proposito: o installDeps() do Playwright so trata win32
# e linux, e em darwin ele e no-op (quando nao pede sudo). Quem passa
# `--with-deps` e o job do CI, que roda em ubuntu-latest -- e la ele tem
# efeito.
	cd $(WEB) && npx playwright install chromium
	uv sync --locked
	./scripts/install-gitleaks.sh

check: check-web check-api check-e2e check-secrets ## Gate completo. E o que os hooks e o CI executam.

check-web: ## ESLint, Prettier, TypeScript e testes do frontend
	cd $(WEB) && npm run lint
	cd $(WEB) && npm run format:check
	cd $(WEB) && npm run typecheck
	cd $(WEB) && npm run test:coverage

check-api: ## Ruff, mypy e pytest com cobertura no backend
	uv run ruff check .
	uv run ruff format --check .
# alembic/ entra no mypy junto com src e tests: o env.py resolve a URL do
# banco e as migracoes escrevem DDL -- codigo onde um erro de tipo custa
# dados, nao um traceback. O Ruff ja o cobria via `ruff check .`; deixar o
# mypy de fora era a unica assimetria.
	uv run mypy src tests alembic
	uv run pytest --cov --cov-report=term-missing --cov-report=html --cov-report=xml

# `migrate-test` e PRE-REQUISITO, e nao a primeira linha da receita: o cenario
# fala com a API de verdade, e uma API contra um banco sem esquema responde 500
# -- falha ruidosa, mas com o sintoma longe da causa. Com o pre-requisito,
# `make check-e2e` roda sozinho num clone novo, sem depender de o `check-api`
# ter passado antes e deixado o esquema em head.
#
# `VITE_API_URL=/api` na propria linha do build porque o valor e embutido no
# BUNDLE, em tempo de build (o `vite preview` serve o que o build produziu; ler
# a variavel depois seria tarde). O `frontend/.env` nao serve aqui: ele e
# ignorado pelo git, entao nao existe em clone novo nem no CI -- e o cliente
# HTTP recusa carregar sem a variavel, de proposito.
check-e2e: migrate-test ## Build e testes ponta a ponta com Playwright e axe-core
	cd $(WEB) && VITE_API_URL=/api npm run build
	cd $(WEB) && npx playwright test

check-secrets: ## Varredura de segredos no projeto inteiro
	./scripts/install-gitleaks.sh
	$(TOOLS)/gitleaks dir . --no-banner --redact --exit-code 1 --config .gitleaks.toml

format: ## MODIFICA arquivos: aplica o Prettier. Nunca chamado por check.
	cd $(WEB) && npm run format

db-up: ## Sobe o PostgreSQL e espera ficar saudavel
	docker compose up -d --wait postgres

db-down: ## Derruba o PostgreSQL, preservando o volume
	docker compose down

migrate: ## Aplica as migracoes no banco de desenvolvimento
	uv run alembic upgrade head

# Alvo separado em vez de variavel porque a escolha do banco precisa estar
# escrita no nome do que se executa: `make migrate-test` nao se confunde com
# `make migrate` do jeito que FQ_DB=test se confundiria com esquecer de passar.
migrate-test: ## Aplica as migracoes no banco de teste
	uv run alembic -x test=true upgrade head
