# Fundação de Qualidade — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabelecer `make check` como gate de qualidade reproduzível, fazê-lo valer antes de todo commit, merge e push, e replicá-lo no GitHub Actions sob um status agregador.

**Architecture:** Alvos granulares num Makefile espelham 1:1 os jobs do CI; a lógica que passa de duas linhas mora em `scripts/`. A invocação é estritamente descendente — `git hook -> pre-commit -> make -> ferramentas` — e nenhum alvo do Makefile invoca `pre-commit`. O gate cobre apenas categorias com código real por trás; as demais têm roadmap versionado.

**Tech Stack:** GNU Make 3.81, Node 24 / npm 11, Vite 8, Vitest 5, Prettier 3, uv 0.12 / Python 3.14, pre-commit, Gitleaks 8.30.1, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-17-fundacao-qualidade-design.md`

## Global Constraints

- Cobertura exigida no frontend: **100% de linhas, ramificações, funções e instruções**. Sem exceções, sem diretivas de ignorar cobertura, sem excluir código difícil.
- Denominador da cobertura — *dentro*: `frontend/src/**/*.{ts,tsx}` exceto arquivos de teste. *Fora*: `vite.config.ts`, `eslint.config.js`, `*.d.ts`, CSS, assets e os próprios testes.
- `make check` **nunca** modifica arquivos. `make format` modifica e jamais é invocado por `check`.
- Nenhum alvo do Makefile invoca `pre-commit` (proibição de recursão, README §9).
- Proibidos em qualquer lugar: `--no-verify`, `SKIP`, `|| true`, `continue-on-error`, sucesso com suíte vazia, falha ignorada.
- Hooks: `always_run: true`, `pass_filenames: false`, sem filtros de arquivo ou de branch.
- CI: sem filtros de caminho, sem `cancel-in-progress`, `permissions: contents: read`, sem segredos.
- Versões fixadas: Prettier 3.9.7, Vitest 5.0.1, `@vitest/coverage-v8` 5.0.1, `@testing-library/react` 16.3.3, jsdom 30.1.0, Gitleaks 8.30.1.
- Interface do produto em português do Brasil; identificadores de código em inglês.
- GNU Make 3.81 executa **cada linha de receita numa shell própria**: todo `cd` precisa estar na mesma linha do comando que depende dele. Receitas usam TAB, não espaços.

---

### Task 1: Prettier e os alvos de lint, formato e tipos

**Files:**
- Create: `Makefile`
- Create: `frontend/.prettierrc.json`
- Create: `frontend/.prettierignore`
- Modify: `frontend/package.json` (bloco `scripts` e `devDependencies`)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces: alvos `make help`, `make check`, `make check-web`, `make format`. Scripts npm `format`, `format:check`, `typecheck`. Tarefas seguintes acrescentam linhas a `check-web` e alvos novos a `check`.

- [ ] **Step 1: Instalar o Prettier**

```bash
cd frontend && npm install -D prettier@3.9.7
```

**Não instalar `eslint-config-prettier`** (decisão D8 da spec). No flat config do
ESLint 9+, os presets `recommended` não trazem regras de formatação, então não há
conflito entre ESLint e Prettier a desarmar. A camada extra seria cargo cult.

- [ ] **Step 2: Criar a configuração do Prettier**

O estilo escolhido reproduz o que o código já usa hoje (sem ponto-e-vírgula, aspas simples), para que a primeira formatação não vire um diff gigante e sem relação com o trabalho.

`frontend/.prettierrc.json`:

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100
}
```

`frontend/.prettierignore`:

```
dist
coverage
package-lock.json
```

- [ ] **Step 3: Acrescentar os scripts npm**

Em `frontend/package.json`, o bloco `scripts` passa a ser:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc -b"
  },
```

`typecheck` é `tsc -b` sem `--noEmit` porque os dois tsconfigs já declaram `"noEmit": true`.

- [ ] **Step 4: Verificar que o Prettier reprova o estado atual**

```bash
cd frontend && npm run format:check
```

Esperado: **FALHA**, listando arquivos que divergem do estilo. É o resultado correto — nenhum arquivo foi formatado até agora.

- [ ] **Step 5: Formatar de uma vez**

```bash
cd frontend && npm run format && npm run format:check
```

Esperado: o segundo comando passa. Conferir com `git diff` que as mudanças são só de estilo.

- [ ] **Step 6: Criar o Makefile**

Atenção: as receitas abaixo usam **TAB** de indentação.

```make
.DEFAULT_GOAL := help
.PHONY: help bootstrap check check-web format

WEB := frontend

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

bootstrap: ## Instala as dependencias dos dois ecossistemas
	cd $(WEB) && npm ci

check: check-web ## Gate completo. E o que os hooks e o CI executam.

check-web: ## ESLint, Prettier, TypeScript e testes do frontend
	cd $(WEB) && npm run lint
	cd $(WEB) && npm run format:check
	cd $(WEB) && npm run typecheck

format: ## MODIFICA arquivos: aplica o Prettier. Nunca chamado por check.
	cd $(WEB) && npm run format
```

- [ ] **Step 7: Verificar que o gate passa**

```bash
make check
```

Esperado: lint, format:check e typecheck passam em sequência.

- [ ] **Step 8: Verificar que o gate reprova de verdade**

```bash
printf 'const   x   =    1\nexport default x\n' > frontend/src/temp_check.ts
make check
```

Esperado: **FALHA** no `format:check`, apontando `src/temp_check.ts`.

```bash
rm frontend/src/temp_check.ts && make check
```

Esperado: volta a passar.

- [ ] **Step 9: Commit**

```bash
git add Makefile frontend/.prettierrc.json frontend/.prettierignore frontend/package.json frontend/package-lock.json frontend/src frontend/eslint.config.js frontend/vite.config.ts
git commit -m "build: adiciona Prettier e o gate de lint, formato e tipos

make check e make format ficam separados por exigencia do README s9:
check apenas verifica, format apenas modifica.

Estilo do Prettier reproduz o que o codigo ja usava (sem ponto-e-virgula,
aspas simples) para que a primeira formatacao nao produza ruido.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Vitest, testes e cobertura de 100%

**Files:**
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/App.test.tsx`
- Create: `frontend/src/main.test.tsx`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/package.json` (scripts `test`, `test:coverage`)
- Modify: `Makefile` (alvo `check-web`)

**Interfaces:**
- Consumes: alvo `check-web` e scripts npm da Task 1.
- Produces: scripts npm `test` e `test:coverage`; `check-web` passa a exigir cobertura de 100%.

- [ ] **Step 1: Instalar o runner e o ambiente de DOM**

```bash
cd frontend && npm install -D vitest@5.0.1 @vitest/coverage-v8@5.0.1 @testing-library/react@16.3.3 @testing-library/jest-dom jsdom@30.1.0
```

- [ ] **Step 2: Escrever o setup dos matchers**

`frontend/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Este arquivo fica **fora** do denominador da cobertura: é infraestrutura de teste.

- [ ] **Step 3: Configurar o Vitest e a cobertura**

`frontend/vite.config.ts` passa a importar de `vitest/config`, que é o mesmo `defineConfig` do Vite acrescido da chave `test` tipada:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/vite-env.d.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
})
```

`all: true` faz a cobertura incluir arquivos que nenhum teste importou — exigência literal do README §9 ("Inclua arquivos não importados pela suíte"). Sem isso, um arquivo sem teste algum simplesmente não apareceria no relatório, e 100% seria uma mentira aritmética.

Não há `globals: true`: os testes importam `describe`, `it` e `expect` explicitamente, o que dispensa mexer nos `types` do tsconfig.

- [ ] **Step 4: Acrescentar os scripts de teste**

Em `frontend/package.json`, dentro de `scripts`:

```json
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
```

- [ ] **Step 5: Escrever o teste do App e vê-lo falhar por falta de cobertura**

`frontend/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('exibe o título principal', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tailwind funcionando')
  })
})
```

```bash
cd frontend && npm run test:coverage
```

Esperado: o teste **passa**, mas o comando **FALHA** no limiar de cobertura, porque `main.tsx` está em 0%. A mensagem nomeia o arquivo. É exatamente o comportamento que se quer de `all: true`.

- [ ] **Step 6: Escrever o teste do bootstrap**

`main.tsx` executa no import e monta a aplicação no DOM. O README §9 proíbe excluí-lo da cobertura ou silenciá-lo com diretiva, então ele é testado de verdade.

`frontend/src/main.test.tsx`:

```tsx
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

describe('main', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('monta a aplicação dentro de #root', async () => {
    // main.tsx roda seus efeitos no proprio import; act() garante que o
    // React tenha descarregado o trabalho agendado antes da assercao.
    await act(async () => {
      await import('./main')
    })

    expect(document.querySelector('#root h1')).toHaveTextContent('Tailwind funcionando')
  })
})
```

Dois detalhes que costumam morder aqui:

1. `await import()` é cacheado pelo módulo. Este teste é o único que importa `main.tsx`; se um dia houver um segundo, ele precisará de `vi.resetModules()` no `beforeEach`.
2. Sem o `act()`, `createRoot().render()` agenda a renderização e o teste consulta o DOM antes dela acontecer.

- [ ] **Step 7: Verificar a cobertura de 100%**

```bash
cd frontend && npm run test:coverage
```

Esperado: **PASSA**, com `App.tsx` e `main.tsx` a 100% em linhas, ramificações, funções e instruções.

- [ ] **Step 8: Ligar os testes ao gate**

No `Makefile`, o alvo `check-web` ganha uma quarta linha:

```make
check-web: ## ESLint, Prettier, TypeScript e testes do frontend
	cd $(WEB) && npm run lint
	cd $(WEB) && npm run format:check
	cd $(WEB) && npm run typecheck
	cd $(WEB) && npm run test:coverage
```

- [ ] **Step 9: Verificar que a queda de cobertura reprova o gate**

```bash
printf 'export const naoTestado = (n: number): number => (n > 0 ? n : -n)\n' > frontend/src/temp_uncovered.ts
make check
```

Esperado: **FALHA** no limiar de cobertura, nomeando `src/temp_uncovered.ts`.

```bash
rm frontend/src/temp_uncovered.ts && make check
```

Esperado: volta a passar.

- [ ] **Step 10: Ignorar o diretório de cobertura**

Conferir que `coverage/` já consta do `.gitignore` da raiz. Consta desde o Incremento 0; nenhuma alteração é necessária.

- [ ] **Step 11: Commit**

```bash
git add frontend/vite.config.ts frontend/package.json frontend/package-lock.json frontend/src/test frontend/src/App.test.tsx frontend/src/main.test.tsx Makefile
git commit -m "test: adiciona Vitest com cobertura exigida de 100%

Limiares em 100% de linhas, ramificacoes, funcoes e instrucoes, com
all:true para que arquivos nao importados pela suite tambem contem.

main.tsx e testado, nao excluido: o README s9 proibe tirar codigo dificil
do denominador ou usar diretivas de ignorar cobertura.

Denominador declarado em vite.config.ts: src/**/*.{ts,tsx} exceto testes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Raiz Python gerenciada por uv

**Files:**
- Create: `.python-version`
- Create: `pyproject.toml`
- Create: `uv.lock` (gerado)
- Modify: `Makefile` (alvo `bootstrap`)

**Interfaces:**
- Consumes: alvo `bootstrap` da Task 1.
- Produces: `uv run pre-commit`, `uv run ruff` e `uv run mypy` disponíveis; `uv sync --frozen` como comando de restauração no CI.

- [ ] **Step 1: Fixar a versão do Python**

`.python-version`:

```
3.14
```

- [ ] **Step 2: Declarar o projeto e as ferramentas**

`pyproject.toml`:

```toml
[project]
name = "focusquest"
version = "0.1.0"
description = "Plataforma de estudos gamificada com tutoria interativa"
requires-python = ">=3.14"
dependencies = []

[dependency-groups]
dev = ["mypy", "pre-commit", "ruff"]

[tool.uv]
package = false

[tool.ruff]
target-version = "py314"
line-length = 88

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]

[tool.mypy]
python_version = "3.14"
strict = true
```

`package = false` declara um projeto virtual: o uv gerencia o ambiente e o lockfile sem tentar construir um pacote instalável. É o correto aqui, já que ainda não existe código Python — e continua correto depois, porque o backend será executado a partir da árvore, não instalado.

As dependências de desenvolvimento vão **sem versão mínima**. O `uv.lock` é a fonte de verdade das versões exatas; repetir um piso no `pyproject.toml` só cria um segundo lugar para ficar desatualizado.

- [ ] **Step 3: Resolver e criar o ambiente**

```bash
uv sync
```

Esperado: cria `.venv/` na raiz e `uv.lock`. Ambos já cobertos pelo `.gitignore` — exceto `uv.lock`, que **deve** ser versionado; confirmar que ele não está sendo ignorado:

```bash
git check-ignore -v uv.lock || echo "uv.lock sera versionado (correto)"
```

- [ ] **Step 4: Verificar que as três ferramentas respondem**

```bash
uv run pre-commit --version && uv run ruff --version && uv run mypy --version
```

Esperado: as três imprimem versão.

- [ ] **Step 5: Verificar a reprodutibilidade**

```bash
uv sync --frozen
```

Esperado: sucesso sem alterar o `uv.lock`. É o comando que o CI usará; se ele falhar, o lockfile está dessincronizado do `pyproject.toml`.

- [ ] **Step 6: Acrescentar o Python ao bootstrap**

No `Makefile`:

```make
bootstrap: ## Instala as dependencias dos dois ecossistemas
	cd $(WEB) && npm ci
	uv sync --frozen
```

- [ ] **Step 7: Confirmar que Ruff e mypy NÃO entram no gate ainda**

Conferir que o alvo `check` continua sendo apenas `check-web`. Não há um único arquivo `.py` no projeto; rodar Ruff ou mypy sobre conjunto vazio produziria sucesso com suíte vazia, proibido pelo README §9. Eles entram no gate na mesma tarefa que criar o primeiro módulo Python.

- [ ] **Step 8: Commit**

```bash
git add .python-version pyproject.toml uv.lock Makefile
git commit -m "build: cria a raiz Python gerenciada por uv

Projeto virtual (package=false) com ruff, mypy e pre-commit no grupo dev.
Sem codigo de aplicacao: este incremento so precisa das ferramentas.

Ruff e mypy ficam declarados mas FORA do make check, porque nao ha
arquivo .py para analisar e o README s9 proibe sucesso com suite vazia.
Entram no gate junto com o primeiro modulo Python.

Versoes sem piso no pyproject: o uv.lock e a fonte unica de verdade.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Gitleaks e a agregação do gate

**Files:**
- Create: `scripts/install-gitleaks.sh`
- Modify: `Makefile` (alvos `check`, `check-secrets`, `bootstrap`)
- Modify: `.gitignore` (acrescentar `.tools/`)

**Interfaces:**
- Consumes: alvos `check` e `bootstrap` das tarefas anteriores.
- Produces: binário em `.tools/gitleaks`; alvo `make check-secrets`; `make check` passa a agregar `check-web` e `check-secrets`.

- [ ] **Step 1: Escrever o instalador com versão e checksum fixados**

`scripts/install-gitleaks.sh`:

```bash
#!/usr/bin/env bash
# Instala o Gitleaks numa versao fixa, verificando o checksum.
# Idempotente: se o binario ja existe e confere, nao baixa nada.
set -euo pipefail

VERSION="8.30.1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="${ROOT}/.tools"
BIN="${TOOLS}/gitleaks"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)
    ASSET="gitleaks_${VERSION}_darwin_arm64.tar.gz"
    SHA256="b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5"
    ;;
  Linux-x86_64)
    ASSET="gitleaks_${VERSION}_linux_x64.tar.gz"
    SHA256="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
    ;;
  *)
    echo "erro: plataforma nao suportada: $(uname -s)-$(uname -m)" >&2
    echo "acrescente o par asset/checksum em scripts/install-gitleaks.sh" >&2
    exit 1
    ;;
esac

if [ -x "$BIN" ] && "$BIN" version 2>/dev/null | grep -q "$VERSION"; then
  exit 0
fi

URL="https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${ASSET}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "baixando gitleaks ${VERSION}..."
curl --fail --silent --show-error --location --output "${TMP}/${ASSET}" "$URL"

echo "${SHA256}  ${TMP}/${ASSET}" | shasum -a 256 -c - >/dev/null || {
  echo "erro: checksum do gitleaks nao confere. Download abortado." >&2
  exit 1
}

mkdir -p "$TOOLS"
tar -xzf "${TMP}/${ASSET}" -C "$TMP" gitleaks
mv "${TMP}/gitleaks" "$BIN"
chmod +x "$BIN"
echo "gitleaks ${VERSION} instalado em .tools/"
```

O `||` ali não é `|| true`: ele converte uma falha silenciosa do `shasum` numa mensagem clara **e** aborta com código 1. A proibição do README é contra engolir falhas, não contra tratá-las.

- [ ] **Step 2: Tornar executável e ignorar o diretório**

```bash
chmod +x scripts/install-gitleaks.sh
printf '\n# Binarios de ferramenta baixados por scripts/\n.tools/\n' >> .gitignore
```

- [ ] **Step 3: Rodar o instalador e conferir a versão**

```bash
./scripts/install-gitleaks.sh && .tools/gitleaks version
```

Esperado: imprime `8.30.1`.

- [ ] **Step 4: Verificar que o checksum é mesmo checado**

```bash
sed -i '' 's/^SHA256="b40ab0/SHA256="000000/' scripts/install-gitleaks.sh
rm -rf .tools && ./scripts/install-gitleaks.sh
```

Esperado: **FALHA** com "checksum do gitleaks nao confere". Restaurar em seguida:

```bash
git checkout scripts/install-gitleaks.sh 2>/dev/null || sed -i '' 's/^SHA256="000000/SHA256="b40ab0/' scripts/install-gitleaks.sh
./scripts/install-gitleaks.sh && .tools/gitleaks version
```

- [ ] **Step 5: Acrescentar o alvo ao Makefile**

Edição **parcial**: substituir apenas a linha `.PHONY` e os alvos `bootstrap` e
`check`, e acrescentar `check-secrets`. Os alvos `help`, `check-web` e `format`
permanecem como estão.

```make
.PHONY: help bootstrap check check-web check-secrets format

bootstrap: ## Instala as dependencias dos dois ecossistemas
	cd $(WEB) && npm ci
	uv sync --frozen
	./scripts/install-gitleaks.sh

check: check-web check-secrets ## Gate completo. E o que os hooks e o CI executam.

check-secrets: ## Varredura de segredos no projeto inteiro
	./scripts/install-gitleaks.sh
	.tools/gitleaks dir . --no-banner --redact --exit-code 1
```

Se `gitleaks dir` não for reconhecido nesta versão, conferir com
`.tools/gitleaks --help` qual subcomando varre um diretório e ajustar a linha —
sem trocar por `|| true` nem por `--exit-code 0`, que transformariam achado em
silêncio.

`check-secrets` chama o instalador antes de usar o binário: sendo idempotente, custa nada quando já está instalado, e faz o alvo funcionar em máquina limpa e no CI sem passo extra. `--redact` evita que o segredo encontrado apareça no log — que seria vazá-lo de novo, agora no CI.

- [ ] **Step 6: Verificar que o gate completo passa**

```bash
make check
```

Esperado: `check-web` e `check-secrets` passam em sequência.

- [ ] **Step 7: Verificar que um segredo plantado reprova**

```bash
printf 'AWS_SECRET_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE"\n' > frontend/src/temp_secret.ts
make check
```

Esperado: **FALHA** no `check-secrets`, apontando o arquivo, com o valor redigido.

```bash
rm frontend/src/temp_secret.ts && make check
```

Esperado: volta a passar.

- [ ] **Step 8: Commit**

```bash
git add scripts/install-gitleaks.sh Makefile .gitignore
git commit -m "build: adiciona deteccao de segredos ao gate

Gitleaks 8.30.1 vem de binario baixado por script, com checksum SHA-256
fixado por plataforma, e nao do hook gerenciado pelo pre-commit.

O motivo e estrutural: o hook do pre-commit executa make check, entao um
alvo do Makefile que chamasse pre-commit fecharia um ciclo, proibido pelo
README s9. A invocacao fica estritamente descendente.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Hooks de git

**Files:**
- Create: `.pre-commit-config.yaml`
- Create: `scripts/check-push.sh`

**Interfaces:**
- Consumes: `make check` (Task 4), `uv run pre-commit` (Task 3), `make bootstrap` (Task 3).
- Produces: hooks instalados nos estágios `pre-commit`, `pre-merge-commit` e `pre-push`. A partir daqui, todo commit deste plano é validado pelo gate.

- [ ] **Step 1: Escrever o script de validação do push**

O pre-push recebe na entrada padrão uma linha por ref enviada, no formato `<ref_local> <sha_local> <ref_remota> <sha_remoto>`. O script valida o **topo de cada ref**, num worktree limpo criado a partir daquele commit — e não do diretório de trabalho, que pode conter alterações que não estão sendo enviadas.

`scripts/check-push.sh`:

```bash
#!/usr/bin/env bash
# Valida o gate no topo de cada ref enviada, em worktree isolado.
# Limitacao conhecida: commits intermediarios nao sao validados um a um.
set -euo pipefail

ZERO="0000000000000000000000000000000000000000"
status=0
validadas=0
delecoes=0

while read -r ref_local sha_local _ref_remota _sha_remoto; do
  if [ "$sha_local" = "$ZERO" ]; then
    delecoes=$((delecoes + 1))
    continue
  fi

  work="$(mktemp -d)"
  echo "==> validando ${ref_local} (${sha_local:0:8}) em worktree limpo"
  git worktree add --quiet --detach "$work" "$sha_local"

  if make -C "$work" bootstrap && make -C "$work" check; then
    validadas=$((validadas + 1))
  else
    echo "!! gate reprovou em ${ref_local} (${sha_local:0:8})" >&2
    status=1
  fi

  git worktree remove --force "$work"
done

if [ "$status" -eq 0 ] && [ "$validadas" -eq 0 ] && [ "$delecoes" -eq 0 ]; then
  echo "!! nada foi validado: operacao nao verificavel, push rejeitado" >&2
  exit 1
fi

exit $status
```

O `make bootstrap` dentro do worktree não é desperdício: um worktree novo não tem `node_modules`, `.venv` nem `.tools`, e sem eles o gate falharia por falta de dependência em vez de por defeito real. É o mesmo que o CI faz. O preço é um push lento — está documentado como custo assumido.

A rejeição quando nada foi validado atende o "Rejeite operações não verificáveis" do README §11.

```bash
chmod +x scripts/check-push.sh
```

- [ ] **Step 2: Escrever a configuração do pre-commit**

`.pre-commit-config.yaml`:

```yaml
default_install_hook_types: [pre-commit, pre-merge-commit, pre-push]
fail_fast: false

repos:
  - repo: local
    hooks:
      - id: gate
        name: gate completo (make check)
        entry: make check
        language: system
        always_run: true
        pass_filenames: false
        stages: [pre-commit, pre-merge-commit]

      - id: gate-push
        name: gate nas revisoes enviadas
        entry: scripts/check-push.sh
        language: system
        always_run: true
        pass_filenames: false
        stages: [pre-push]
```

`language: system` significa que o pre-commit não instala nada: ele executa a ferramenta que já está no projeto. É o que impede a divergência entre a versão do hook e a do lockfile.

- [ ] **Step 3: Instalar os hooks**

```bash
uv run pre-commit install --install-hooks
```

Esperado: confirma instalação em `pre-commit`, `pre-merge-commit` e `pre-push`, conforme `default_install_hook_types`.

- [ ] **Step 4: Verificar que o hook bloqueia um commit com defeito**

```bash
printf 'export const quebrado: number = "texto"\n' > frontend/src/temp_broken.ts
git add frontend/src/temp_broken.ts
git commit -m "teste: deve ser bloqueado"
```

Esperado: **commit bloqueado**, com o erro do TypeScript (`Type 'string' is not assignable to type 'number'`).

```bash
git restore --staged frontend/src/temp_broken.ts && rm frontend/src/temp_broken.ts
```

- [ ] **Step 5: Verificar a fidelidade ao índice**

Este é o cenário do README §11: uma alteração **não staged** com defeito não pode reprovar um commit cujo conteúdo está correto — e, principalmente, não pode ser confundida com o que está sendo commitado.

O defeito precisa estar num arquivo **já rastreado**. O pre-commit guarda
alterações não staged de arquivos rastreados, mas **não guarda arquivos não
rastreados**: um `.ts` novo e quebrado permaneceria no diretório durante o gate e
reprovaria o commit. Esse comportamento é conservador e é o que o README §11
sanciona ("sem validação fiel, bloqueie preservando o trabalho"), mas testá-lo
aqui mediria outra coisa.

```bash
# Defeito num arquivo JA RASTREADO, deixado fora do indice de proposito.
printf '\nexport const quebrado: number = "texto"\n' >> frontend/src/App.tsx
git add .pre-commit-config.yaml scripts/check-push.sh
git commit -m "chore: adiciona hooks de qualidade

Instala o gate nos estagios pre-commit, pre-merge-commit e pre-push, com
always_run e pass_filenames:false, sem filtros de arquivo ou de branch.

O pre-push valida o topo de cada ref enviada num worktree limpo, e rejeita
a operacao quando nada pode ser validado. Commits intermediarios ficam
fora dessa validacao: limitacao documentada em docs/QUALITY.md.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Esperado: o commit **passa**. O pre-commit guarda o arquivo não staged antes de rodar o gate e o restaura depois, de modo que o gate avaliou exatamente o conteúdo do índice.

```bash
git log -1 --stat
git diff --stat
```

Esperado: `App.tsx` **não** aparece no commit, e `git diff` ainda mostra a linha
quebrada no diretório de trabalho — prova de que o pre-commit devolveu o trabalho
não staged intacto depois de rodar o gate.

Restaurar:

```bash
git restore frontend/src/App.tsx && make check
```

Esperado: gate verde.

- [ ] **Step 6: Registrar que este foi o primeiro commit validado**

Anotar o hash do commit do Step 5. Ele é a primeira validação real do gate sobre si mesmo e vai citado no `docs/HANDOFF.md` na Task 6.

---

### Task 6: Documentação do gate e demonstração das barreiras

**Files:**
- Create: `docs/QUALITY.md`
- Modify: `docs/HANDOFF.md`

**Interfaces:**
- Consumes: todo o gate das Tasks 1 a 5.
- Produces: `docs/QUALITY.md` como contrato do roadmap dos alvos ausentes — a mitigação do risco de a decisão D1 depender de disciplina.

- [ ] **Step 1: Escrever docs/QUALITY.md**

Conteúdo obrigatório, nesta ordem:

1. **Comandos**: `make help`, `make bootstrap`, `make check`, `make check-web`, `make check-secrets`, `make format`, com uma linha de descrição cada.
2. **A regra da direção única**: o diagrama `git hook -> pre-commit -> make -> ferramentas`, e a frase "nenhum alvo do Makefile invoca pre-commit", com a referência ao README §9.
3. **Denominador da cobertura**: as duas listas (dentro e fora), copiadas da spec, com a justificativa de cada exclusão.
4. **Roadmap dos alvos ausentes**: a tabela abaixo, apresentada como contrato — nenhum incremento que traga código de uma linha pode ser aceito sem trazer o alvo correspondente.

   | Alvo | Conteúdo | Entra junto com |
   |---|---|---|
   | `check-api` | Ruff lint, Ruff format --check, mypy estrito, pytest com cobertura | O primeiro módulo Python |
   | `check-e2e` | Build, Playwright/Chromium, axe-core | O primeiro fluxo ponta a ponta real |

5. **Limitações conhecidas**, escritas sem eufemismo:
   - o `pre-push` valida o topo de cada ref, não cada commit intermediário;
   - o gate roda inteiro a cada commit e ficará lento conforme o projeto crescer;
   - hooks não vêm no clone e são contornáveis por quem controla o git — a proteção real é a do remoto.
6. **Como atualizar o Gitleaks**: o comando que obtém os checksums da nova versão e quais duas constantes trocar em `scripts/install-gitleaks.sh`.

```bash
curl -sL "https://github.com/gitleaks/gitleaks/releases/download/vX.Y.Z/gitleaks_X.Y.Z_checksums.txt" | grep -E 'darwin_arm64|linux_x64'
```

- [ ] **Step 2: Executar a tabela de demonstrações da spec**

Cada linha abaixo é executada e o resultado conferido. Todas as alterações são revertidas em seguida; nenhuma entra no histórico.

| Verificação | Comando | Resultado esperado |
|---|---|---|
| gate em árvore limpa | `make check` | sucesso |
| erro de lint | criar `frontend/src/tmp.ts` com `var x = 1` e `make check` | falha no ESLint |
| cobertura abaixo do limiar | criar `frontend/src/tmp.ts` exportando função não testada e `make check` | falha nomeando o arquivo |
| segredo plantado | criar `frontend/src/tmp.ts` com chave falsa e `make check` | falha no Gitleaks, valor redigido |
| commit com defeito | `git add` + `git commit` | bloqueado pelo hook |
| defeito só não staged, em arquivo rastreado | alterar `App.tsx` sem `git add`, commitar outro arquivo | passa; defeito preservado fora do commit |
| defeito em arquivo não rastreado | criar `.ts` novo e quebrado, commitar outro arquivo | bloqueia — comportamento conservador sancionado pelo §11 |
| `make format` | `make format && make check` | modifica arquivos; gate segue verde |

- [ ] **Step 3: Atualizar docs/HANDOFF.md**

Alterações necessárias:

- Revisão-base passa a apontar o Incremento 2.
- Acrescentar as decisões D1 a D8 à tabela de decisões, em uma linha cada.
- Na seção de comandos e resultados, acrescentar `make check` com o resultado obtido e o hash do primeiro commit validado pelo gate (Task 5, Step 5).
- Na seção de pendências: **remover** a pendência 1 (hooks ausentes) e a pendência 3 (sem suíte de testes); **manter** as pendências 2, 4, 5 e 6; **acrescentar** que `check-api` e `check-e2e` ainda não existem, com referência a `docs/QUALITY.md`.
- Registrar a versão fixada do Gitleaks (8.30.1) e onde atualizá-la.
- Próximo incremento passa a ser a fatia vertical (Incremento 1 da numeração original).

- [ ] **Step 4: Commit**

```bash
git add docs/QUALITY.md docs/HANDOFF.md
git commit -m "docs: documenta o gate de qualidade e suas limitacoes

docs/QUALITY.md registra comandos, a regra de invocacao descendente, o
denominador declarado da cobertura, o roadmap dos alvos ausentes e o
procedimento de atualizacao do Gitleaks.

As tres limitacoes ficam escritas como limitacoes: pre-push nao valida
commits intermediarios, o gate fica lento conforme o projeto cresce, e
hooks sao contornaveis por quem controla o git.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Esperado: o commit passa pelo gate, agora ativo.

---

### Task 7: Workflow do GitHub Actions

**Files:**
- Create: `.github/workflows/quality.yml`

**Interfaces:**
- Consumes: alvos `check-web` e `check-secrets` do Makefile.
- Produces: jobs `check-web` e `check-secrets`, e o status agregador `quality-gate`, cujo nome será exigido na proteção de branch da Task 8.

- [ ] **Step 1: Escrever o workflow**

`.github/workflows/quality.yml`:

```yaml
name: quality

on:
  push:
  pull_request:
  workflow_dispatch:
  merge_group:

permissions:
  contents: read

concurrency:
  # Sem cancel-in-progress: o README s12 proibe cancelar verificacoes anteriores.
  group: quality-${{ github.ref }}
  cancel-in-progress: false

jobs:
  check-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Instalar dependencias do frontend
        run: npm ci
        working-directory: frontend
      - name: Gate do frontend
        run: make check-web

  check-secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - name: Varredura de segredos
        run: make check-secrets

  quality-gate:
    runs-on: ubuntu-latest
    needs: [check-web, check-secrets]
    if: always()
    steps:
      - name: Exigir sucesso explicito de todos os jobs
        run: |
          echo "check-web=${{ needs.check-web.result }}"
          echo "check-secrets=${{ needs.check-secrets.result }}"
          for r in "${{ needs.check-web.result }}" "${{ needs.check-secrets.result }}"; do
            if [ "$r" != "success" ]; then
              echo "quality-gate reprovado: um job nao terminou em success" >&2
              exit 1
            fi
          done
          echo "quality-gate aprovado"
```

Pontos que o README §12 exige e que estão implementados acima:

- `on: push` e `on: pull_request` sem `branches:` nem `paths:` — qualquer branch, qualquer caminho, inclusive mudanças só de documentação.
- `if: always()` no agregador, sem o qual ele seria **pulado** quando um job falha — e um job pulado não reprova um check obrigatório, o que abriria exatamente o buraco que o agregador existe para fechar.
- A comparação é contra `success` literal: `skipped`, `cancelled` e `failure` reprovam.
- `check-secrets` usa `fetch-depth: 0` para que o Gitleaks veja o histórico completo.
- Nenhum `continue-on-error`, nenhum segredo, permissão mínima.

- [ ] **Step 2: Validar o YAML localmente**

```bash
uv run python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/quality.yml')); print('YAML valido')"
```

Esperado: imprime `YAML valido`. Isto pega erro de sintaxe, **não** pega nome de action inexistente nem expressão inválida — esses só aparecem na execução real, que é o Step 5 da Task 8.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/quality.yml
git commit -m "ci: adiciona o workflow de qualidade com status agregador

Dispara em push e pull_request de qualquer branch, sem filtros de caminho,
mais workflow_dispatch e merge_group. Permissao minima, sem segredos, sem
continue-on-error e sem cancelar execucoes anteriores.

O job quality-gate usa if:always() e exige o literal success de cada
dependencia: pulado, cancelado ou ausente reprovam. Sem o always(), ele
seria pulado junto com a falha e o check obrigatorio nao pegaria nada.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Remoto, execução real do CI e proteção de branch

**Files:** nenhum arquivo do repositório é alterado; esta tarefa opera sobre o GitHub.

**Interfaces:**
- Consumes: o workflow da Task 7 e todos os commits anteriores.
- Produces: repositório remoto, execução real do CI e proteção de `main` exigindo `quality-gate`.

> **Esta tarefa contém três pontos de parada obrigatórios.** Cada um publica ou altera algo fora da máquina local. O README §1 exige autorização para commit, push, merge e publicação. Não avance nenhum deles sem o "sim" explícito do usuário para aquele passo específico.

- [ ] **Step 1: PARADA — pedir autorização para criar o repositório**

Apresentar: nome proposto (`FocusQuest`), visibilidade **privada**, conta de destino, e o fato de que nada é enviado ainda. Aguardar resposta.

- [ ] **Step 2: Criar o repositório**

```bash
gh repo create FocusQuest --private --source=. --remote=origin --push=false
git remote -v
```

Esperado: `origin` configurado, nenhum commit enviado.

- [ ] **Step 3: PARADA — pedir autorização para o primeiro push**

Apresentar: quantidade de commits a enviar, o fato de que o pre-push vai rodar o gate num worktree limpo antes de permitir, e o tempo estimado. Aguardar resposta.

- [ ] **Step 4: Primeiro push**

```bash
git push -u origin main
```

Esperado: o hook `gate-push` cria o worktree, roda `make bootstrap` e `make check`, aprova, e o push é aceito. Este é o primeiro exercício real do `check-push.sh` — se ele falhar por motivo de infraestrutura, e não por defeito, corrigir o script antes de prosseguir e **não** contornar com `--no-verify`.

- [ ] **Step 5: Conferir a execução real e os nomes dos checks**

```bash
gh run list --limit 3
gh run watch
```

Após a conclusão, obter os nomes exatos como o GitHub os registra:

```bash
gh api "repos/{owner}/{repo}/commits/main/check-runs" --jq '.check_runs[].name'
```

Esperado: a lista contém `check-web`, `check-secrets` e `quality-gate`. **Usar o nome exato retornado aqui** no passo seguinte — exigir um nome que não existe tranca a branch contra o próprio autor, e é a razão de este passo vir antes da proteção.

Se algum job falhar, corrigir, commitar e repetir antes de prosseguir.

- [ ] **Step 6: PARADA — pedir autorização para proteger a branch**

Apresentar: que `main` passará a exigir o check `quality-gate` e a rejeitar push direto e force-push, e que isso afeta o próprio usuário. Aguardar resposta.

- [ ] **Step 7: Proteger a main**

```bash
gh api -X PUT "repos/{owner}/{repo}/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["quality-gate"] },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

`strict: true` exige base atualizada antes do merge. `enforce_admins: true` faz a regra valer para o dono do repositório — sem isso a proteção é decorativa para quem mais provavelmente vai contorná-la.

- [ ] **Step 8: Verificar que a proteção morde**

```bash
gh api "repos/{owner}/{repo}/branches/main/protection" --jq '{checks: .required_status_checks.contexts, admins: .enforce_admins.enabled, force: .allow_force_pushes.enabled}'
```

Esperado: `checks: ["quality-gate"]`, `admins: true`, `force: false`.

- [ ] **Step 9: Atualizar o HANDOFF com o estado remoto**

Registrar em `docs/HANDOFF.md`: remoto configurado, nomes reais dos checks, proteção ativa e seu conteúdo. Remover a pendência 4 (sem remoto). Commitar e enviar por pull request, já que `main` agora rejeita push direto — o que é, em si, a verificação final de que a proteção funciona.

---

## Notas de execução

- **Ordem é obrigatória.** A Task 5 instala os hooks; a partir dela, todo commit do plano é validado pelo gate. As Tasks 1 a 4 commitam sem hook porque o gate ainda está sendo construído — mesma situação de bootstrap já registrada no Incremento 0, e pelo mesmo motivo.
- **Nenhum passo usa `--no-verify` ou `SKIP`.** Se um hook bloquear, o defeito é real ou o gate está errado; as duas saídas são corrigir, nunca contornar.
- **Os arquivos `temp_*.ts` das demonstrações** existem apenas durante a verificação e são removidos no mesmo passo. Nenhum deles entra em commit.
