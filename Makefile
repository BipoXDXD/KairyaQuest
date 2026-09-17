.DEFAULT_GOAL := help
.PHONY: help bootstrap check check-web check-secrets format

WEB := frontend

# Diretorio das ferramentas baixadas por scripts/. FQ_TOOLS_DIR (absoluto)
# sobrescreve, para o scripts/check-push.sh compartilhar o cache do
# repositorio principal com os worktrees temporarios do pre-push. O binario
# compartilhado continua sendo verificado pelo proprio hash SHA-256 em
# scripts/install-gitleaks.sh.
TOOLS := $(if $(FQ_TOOLS_DIR),$(FQ_TOOLS_DIR),.tools)

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

bootstrap: ## Instala as dependencias dos dois ecossistemas
	cd $(WEB) && npm ci
	uv sync --frozen
	./scripts/install-gitleaks.sh

check: check-web check-secrets ## Gate completo. E o que os hooks e o CI executam.

check-web: ## ESLint, Prettier, TypeScript e testes do frontend
	cd $(WEB) && npm run lint
	cd $(WEB) && npm run format:check
	cd $(WEB) && npm run typecheck
	cd $(WEB) && npm run test:coverage

check-secrets: ## Varredura de segredos no projeto inteiro
	./scripts/install-gitleaks.sh
	$(TOOLS)/gitleaks dir . --no-banner --redact --exit-code 1 --config .gitleaks.toml

format: ## MODIFICA arquivos: aplica o Prettier. Nunca chamado por check.
	cd $(WEB) && npm run format
