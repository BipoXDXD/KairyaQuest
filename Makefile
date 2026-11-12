.DEFAULT_GOAL := help
.PHONY: help bootstrap check check-handoff check-web check-api check-e2e check-secrets check-wheel format db-up db-down migrate migrate-test reset-test-db

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
# `--with-deps` e o job do CI, que roda em ubuntu-24.04 -- e la ele tem
# efeito.
	cd $(WEB) && npx playwright install chromium
	uv sync --locked
	./scripts/install-gitleaks.sh

check: check-handoff check-web check-api check-e2e check-secrets check-wheel ## Gate completo. E o que os hooks e o CI executam.

check-web: ## ESLint, Prettier, TypeScript e testes do frontend
	cd $(WEB) && npm run lint
	cd $(WEB) && npm run format:check
	cd $(WEB) && npm run typecheck
	cd $(WEB) && npm run test:coverage

check-api: ## Ruff, mypy e pytest com cobertura no backend
# PRIMEIRA receita do alvo, e nao a ultima: um lock defasado significa que as
# versoes que as linhas seguintes verificam podem nao ser as versoes
# declaradas. Nao faz sentido gastar o pytest inteiro para so depois descobrir
# que ele rodou contra o ambiente errado.
#
# `uv lock --check` COMPARA, nao sincroniza: reprova com "The lockfile at
# `uv.lock` needs to be updated" e nao escreve nada. Ate aqui a validacao do
# lock so acontecia no `make bootstrap` (`uv sync --locked`) e no preparo dos
# jobs do CI -- ou seja, quem roda `make check` num clone ja preparado nao
# recebia aviso nenhum, e o `docs/QUALITY.md` §4 prometeu essa validacao
# DENTRO do alvo.
#
# Nao ha equivalente npm no check-web, de proposito: nao existe comando barato
# e confiavel que compare `package.json` com `package-lock.json` sem instalar,
# e forcar `npm ci` no check-web faria o gate local reinstalar tudo a cada
# execucao. A assimetria e declarada, nao consertada com verificacao fragil.
	uv lock --check
	uv run ruff check .
	uv run ruff format --check .
# alembic/ entra no mypy junto com src e tests: o env.py resolve a URL do
# banco e as migracoes escrevem DDL -- codigo onde um erro de tipo custa
# dados, nao um traceback. O Ruff ja o cobria via `ruff check .`; deixar o
# mypy de fora era a unica assimetria.
	uv run mypy src tests alembic scripts/verify_image_platforms.py scripts/promote_images.py scripts/check_wheel.py scripts/turntable_params.py
	uv run pytest --cov --cov-report=term-missing --cov-report=html --cov-report=xml

# `reset-test-db` e PRE-REQUISITO, e nao `migrate-test`: desde o Incremento B
# o E2E semeia um plano semanal, que e unico por semana -- sem esquema limpo,
# o segundo `make check-e2e` seguido reprovaria com 409 (spec do ciclo, C17).
#
# `VITE_API_URL=/api` na propria linha do build porque o valor e embutido no
# BUNDLE, em tempo de build (o `vite preview` serve o que o build produziu; ler
# a variavel depois seria tarde). O `frontend/.env` nao serve aqui: ele e
# ignorado pelo git, entao nao existe em clone novo nem no CI -- e o cliente
# HTTP recusa carregar sem a variavel, de proposito.
#
# O deslocamento das portas (FOCUSQUEST_E2E_PORT_OFFSET, pendencia 19) chega ao
# Playwright por esta receita, e SO ele: o `servers.ts` le a variavel do
# ambiente do processo, e o Node nao le o `.env`. Quem resolve o valor e o
# `Settings` -- o mesmo leitor do `.env` que a aplicacao usa, com a mesma
# precedencia (ambiente acima do `.env`, como no pre-push) e a mesma validacao
# (0 a 49) --, e a receita repassa apenas esse campo; nenhuma outra linha do
# `.env` vai para o ambiente do Playwright. A atribuicao fica SOZINHA antes do
# `&&`: numa atribuicao isolada, a falha da substituicao derruba a receita;
# prefixada ao comando (`VAR=$$(...) npx ...`), ela seria ignorada e o E2E
# subiria com deslocamento vazio -- as portas de outro worktree.
check-e2e: reset-test-db ## Build e testes ponta a ponta com Playwright e axe-core
	cd $(WEB) && VITE_API_URL=/api npm run build
	deslocamento="$$(uv run python -c 'from focusquest.core.config import Settings; print(Settings().e2e_port_offset)')" \
		&& cd $(WEB) && FOCUSQUEST_E2E_PORT_OFFSET="$$deslocamento" npx playwright test

# Desde a pendencia 19 o banco de teste e POR WORKTREE (o nome vem do .env), e
# por isso o primeiro passo tambem CRIA o banco se ele ainda nao existir -- atras
# da mesma guarda de nome do DROP SCHEMA (tests/integration/banco_de_teste.py).
reset-test-db: ## DESTRUTIVO: cria se faltar, recria o banco de TESTE do zero e migra
	PYTHONPATH=tests uv run python -m integration.banco_de_teste
	uv run alembic -x test=true upgrade head

check-handoff: ## Reprova a branch que edita docs/HANDOFF.md fora da consolidacao
	./scripts/check-handoff.sh

check-secrets: ## Varredura de segredos no projeto inteiro
	./scripts/install-gitleaks.sh
	$(TOOLS)/gitleaks dir . --no-banner --redact --exit-code 1 --config .gitleaks.toml

# Os prompts da persona e da rubrica sao `.md` lidos por importlib.resources;
# a imagem instala o wheel, e um `.md` fora dele so quebraria em producao. O
# motivo completo esta no proprio script e no docs/HANDOFF.md.
check-wheel: ## Constroi o wheel e confere que os prompts .md estao nele
	./scripts/check-wheel.sh

format: ## MODIFICA arquivos: aplica o Prettier. Nunca chamado por check.
	cd $(WEB) && npm run format

db-up: ## Sobe o PostgreSQL e espera ficar saudavel
	./scripts/docker-build.sh compose up -d --wait postgres

db-down: ## Derruba o PostgreSQL, preservando o volume
	docker compose down

migrate: ## Aplica as migracoes no banco de desenvolvimento
	uv run alembic upgrade head

# Alvo separado em vez de variavel porque a escolha do banco precisa estar
# escrita no nome do que se executa: `make migrate-test` nao se confunde com
# `make migrate` do jeito que FQ_DB=test se confundiria com esquecer de passar.
migrate-test: ## Aplica as migracoes no banco de teste
	uv run alembic -x test=true upgrade head

# Local nativo; release portátil exportada sem sobrescrever imagens locais.
IMAGE_TAG ?= dev

.PHONY: image image-release
image: ## Constrói API e frontend para o Docker local, com verificação de arquitetura
	./scripts/docker-build.sh local -f docker/api.Dockerfile -t kairyaquest-api:$(IMAGE_TAG) .
	./scripts/docker-build.sh local -f docker/web.Dockerfile -t kairyaquest-web:$(IMAGE_TAG) .

image-release: ## Exporta API e frontend em OCI com AMD64 e ARM64, sem carregar no Docker local
	mkdir -p .docker-artifacts
	./scripts/docker-build.sh oci .docker-artifacts/kairyaquest-api.tar -f docker/api.Dockerfile -t kairyaquest-api:$(IMAGE_TAG) .
	./scripts/docker-build.sh oci .docker-artifacts/kairyaquest-web.tar -f docker/web.Dockerfile -t kairyaquest-web:$(IMAGE_TAG) .

.PHONY: check-image-platforms promote-images
check-image-platforms: ## Confere IMAGE_REFERENCE no GHCR; tags exigem IMAGE_DIGEST aprovado
	python3 scripts/verify_image_platforms.py

promote-images: ## Promove API_REFERENCE e WEB_REFERENCE aprovados se GITHUB_SHA ainda for a main
	python3 scripts/promote_images.py
