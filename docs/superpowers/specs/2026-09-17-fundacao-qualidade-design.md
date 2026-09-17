# Fundação de qualidade — design

Data: 2026-09-17
Incremento: 2 (o 0 foi o saneamento; o 1, a fatia vertical, vem depois)
Especificação de origem: `README.md`, seções 9, 11 e 12

## Objetivo

Estabelecer o gate de qualidade — `make check` — e fazê-lo valer antes de todo
commit, merge e push, local e no CI. Nenhuma funcionalidade de produto entra
neste incremento.

## Contexto

Estado no início deste incremento:

- Repositório git com dois commits, sem remoto.
- Frontend React 19.2 / Vite 8.3 / TypeScript 6.0 estrito / Tailwind 4.3,
  contendo `src/App.tsx` e `src/main.tsx`.
- Nenhum código Python. Nenhum teste. Nenhum `pyproject.toml`.
- `pre-commit`, `gitleaks`, `ruff` e `mypy` ausentes da máquina; nenhum browser
  do Playwright em cache.
- `make` disponível é o GNU Make 3.81 da Apple, sem `.ONESHELL`.

## Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | O gate cobre apenas categorias com código real por trás; cada incremento futuro traz a sua | Rodar Ruff, mypy, pytest ou Playwright sobre conjunto vazio é o "sucesso com suíte vazia" proibido pelo §9. A alternativa — alvos que falham por pendência — travaria todo commit, já que os hooks do §11 rodam o gate e não admitem `SKIP`. |
| D2 | `pyproject.toml` + `uv.lock` criados agora, só com dev-dependencies | Fonte única de verdade para versões das ferramentas Python. `uv sync --frozen` no CI entrega exatamente o mesmo que a máquina local. |
| D3 | Hooks do pre-commit usam `language: system` e invocam `make check` | Impede a divergência clássica entre a versão que o hook instala e a que o lockfile fixa. |
| D4 | Gitleaks é instalado por `scripts/install-gitleaks.sh` em `.tools/`, com versão e checksum SHA-256 fixados | É um binário Go, ausente do `uv.lock`. Usar o hook gerenciado pelo pre-commit criaria recursão: pre-commit invocaria `make check`, que invocaria `pre-commit run` — proibido pelo §9. Um binário local, pinado e verificado, mantém o fluxo em uma só direção e não depende de Homebrew nem de Docker no caminho do commit. |
| D5 | Alvos granulares no Makefile, espelhados 1:1 nos jobs do CI | O §12 exige jobs distintos sob um agregador. Um alvo por job mantém local e CI com o mesmo caminho de execução, e permite rodar só a fatia quebrada. |
| D6 | Lógica com mais de duas linhas mora em `scripts/`, não no Makefile | GNU Make 3.81 executa cada linha de receita em sua própria shell. O §12 pede scripts compartilhados entre local e CI. |
| D7 | `main.tsx` é testado, não excluído da cobertura | O §9 proíbe excluir código difícil e proíbe diretivas de ignorar cobertura. Testá-lo custa cerca de oito linhas. |
| D8 | Prettier sem `eslint-config-prettier` | No flat config do ESLint 9+, os presets `recommended` não trazem regras de formatação. Não há conflito a desarmar. |

## Arquitetura do gate

```
make check          agrega; é o que hooks e CI executam
├── check-web       ESLint, Prettier --check, tsc --noEmit, Vitest + cobertura
└── check-secrets   Gitleaks

make format         MODIFICA arquivos (Prettier --write). Jamais invocado por check.
```

O §9 exige separação estrita entre o alvo que verifica e o que reescreve. `check`
nunca formata, nunca usa watch, nunca invoca hooks.

### Roadmap dos alvos ausentes

Registrado em `docs/QUALITY.md` e repetido no `docs/HANDOFF.md`:

| Alvo | Conteúdo | Entra junto com |
|---|---|---|
| `check-api` | Ruff lint, Ruff format --check, mypy estrito, pytest com cobertura | O primeiro módulo Python |
| `check-e2e` | Build, Playwright/Chromium, axe-core | O primeiro fluxo ponta a ponta real |

## Componentes

### 1. Raiz Python

- `.python-version` fixando 3.14.
- `pyproject.toml` declarando o projeto e um grupo `dev` com `ruff`, `mypy` e
  `pre-commit`. Sem dependências de aplicação e sem pacote Python.
- `uv.lock` versionado.

Ruff e mypy ficam declarados mas **fora** do `make check` neste incremento, por
D1. Entram no gate no incremento que trouxer código Python.

### 2. Frontend: formatação, testes e cobertura

Novas dev-dependencies em `frontend/package.json`, todas fixadas no
`package-lock.json`:

| Pacote | Versão | Papel |
|---|---|---|
| `prettier` | 3.9.7 | formatador único |
| `vitest` | 5.0.1 | runner |
| `@vitest/coverage-v8` | 5.0.1 | cobertura |
| `@testing-library/react` | 16.3.3 | render e asserções sobre o DOM |
| `@testing-library/jest-dom` | corrente | matchers de DOM |
| `jsdom` | 30.1.0 | ambiente de DOM |

Novos scripts npm: `format`, `format:check`, `typecheck`, `test`, `test:coverage`.

**Limiares de cobertura:** 100% de linhas, ramificações, funções e instruções.
A configuração inclui arquivos não importados pela suíte, conforme o §9.

**Denominador declarado**, como o §9 exige:

- *Dentro*: `frontend/src/**/*.{ts,tsx}`, exceto arquivos de teste.
- *Fora*: `vite.config.ts`, `eslint.config.js`, `*.d.ts`, CSS, assets, e os
  próprios testes. São configuração de ferramenta e recursos, não código de
  aplicação.

**Testes deste incremento:**

- `App.test.tsx`: renderiza e verifica o conteúdo visível.
- `main.test.tsx`: monta `<div id="root">` no jsdom, importa `main.tsx`
  dinamicamente e verifica que o `App` foi montado sob `#root`. Cobre o
  bootstrap sem excluí-lo (D7).

### 3. Detecção de segredos

`scripts/install-gitleaks.sh` baixa a release oficial correspondente ao sistema e
à arquitetura, confere o SHA-256 contra um valor fixado no próprio script e
extrai o binário em `.tools/gitleaks` (diretório ignorado pelo git). O script é
idempotente: se o binário já existe e o checksum bate, não baixa nada.

O alvo `check-secrets` invoca `.tools/gitleaks` diretamente, varrendo o projeto
inteiro e não apenas o diff. O mesmo script roda no CI, garantindo versão
idêntica nos dois lugares.

Checksum divergente aborta com erro, nunca prossegue com o binário baixado.

**Direção única de invocação.** O §9 proíbe que o gate chame hooks
recursivamente. O fluxo é, portanto, estritamente descendente:

```
git hook → pre-commit → make check → ferramentas
make check → ferramentas                        (invocação direta, sem hook)
```

Nenhum alvo do Makefile invoca `pre-commit`. Por isso o Gitleaks precisa do
binário local em vez do hook gerenciado — foi o que motivou D4.

### 4. Hooks de git

`.pre-commit-config.yaml` com um hook local `make check`, `language: system`,
`always_run: true`, `pass_filenames: false`, sem filtros de arquivo ou de branch,
registrado nos estágios `pre-commit`, `pre-merge-commit` e `pre-push`.

Instalação: `uv run pre-commit install --hook-type pre-commit --hook-type
pre-merge-commit --hook-type pre-push`.

**Fidelidade ao índice (§11):** o pre-commit guarda alterações não staged antes
de executar e as restaura depois, de modo que o gate avalia exatamente o
conteúdo que será commitado. Arquivo parcialmente staged não mascara defeito.

**Limitação conhecida e aceita no `pre-push`:** o §11 pede validação das
revisões enviadas. Validar cada commit novo individualmente exigiria checkout e
gate por commit, o que é proibitivo. `scripts/check-push.sh` valida o **topo de
cada ref enviada**, num worktree temporário criado a partir daquele commit — não
do diretório de trabalho, que pode conter alterações não enviadas. Commits
intermediários não são verificados isoladamente. Documentado no `docs/QUALITY.md`
como limitação, não contornado em silêncio.

**Custo assumido:** o gate roda integralmente a cada commit. Hoje são cerca de
quinze segundos; com backend, PostgreSQL e Playwright serão minutos. O §11
proíbe `--no-verify`, `SKIP` e desativação de hooks, portanto não há válvula de
escape por projeto. É a troca escolhida pela especificação.

**Alcance dos hooks:** hooks não vêm no clone e são contornáveis por quem
controla o git. Não são proteção inviolável; a proteção real é a do §12, no
remoto.

### 5. CI

`.github/workflows/quality.yml`:

- Gatilhos: `push` e `pull_request` em qualquer branch, sem filtros de caminho;
  `workflow_dispatch`; `merge_group`.
- `permissions: contents: read`.
- Concorrência agrupada por ref, **sem** `cancel-in-progress`: o §12 proíbe
  cancelar verificações anteriores.
- Jobs `check-web` e `check-secrets` em paralelo, restaurando dependências com
  `npm ci` e `uv sync --frozen`.
- Sem `continue-on-error`, sem segredos.
- Job `quality-gate` com `needs` de todos os demais e `if: always()`, que falha
  se qualquer dependência não for exatamente `success`. Resultado pulado,
  cancelado ou ausente reprova. Upload de relatório não converte falha em
  sucesso.

## Fluxo de execução e pontos de autorização

1. Implementação local; `make check` até passar.
2. Instalação dos hooks e commit deste incremento — primeira validação real do
   gate sobre si mesmo.
3. **Autorização do usuário** → `gh repo create`, privado.
4. **Autorização do usuário** → primeiro push.
5. Conferência dos nomes reais dos checks no Actions, já executados.
6. **Autorização do usuário** → proteção de branch exigindo `quality-gate`,
   bloqueando push direto e force-push.

O passo 5 precede o 6 porque exigir um check com nome incorreto tranca a branch
contra o próprio autor. O §12 pede a confirmação dos nomes antes da exigência.

## Testes deste incremento

O gate é verificado por uso, não por testes sobre o gate:

| Verificação | Evidência esperada |
|---|---|
| `make check` em árvore limpa | sucesso |
| `make check` com erro de lint introduzido | falha, com o erro do ESLint |
| `make check` com cobertura abaixo do limiar | falha, apontando o arquivo |
| `make check` com segredo falso plantado | falha, apontando o Gitleaks |
| commit com defeito plantado | bloqueado pelo hook |
| commit com defeito apenas não staged | passa, e o defeito permanece fora do commit |
| `make format` | modifica arquivos; `make check` segue verde depois |

Cada demonstração de bloqueio é feita e revertida sem alterar o histórico
principal, como o §14 pede.

## Fora de escopo

FastAPI, PostgreSQL, Alembic, Playwright, axe-core, `AGENTS.md`, `CLAUDE.md`,
`docs/ARCHITECTURE.md` e qualquer código de produto. O `docs/ARCHITECTURE.md`
pertence ao Incremento 1, quando houver arquitetura a descrever.

## Riscos

| Risco | Mitigação |
|---|---|
| D1 depende de disciplina: um incremento futuro pode trazer código sem trazer sua categoria de gate | `docs/QUALITY.md` versiona o roadmap dos alvos ausentes e o `docs/HANDOFF.md` o repete; a revisão de cada incremento confere a tabela |
| Gate lento desestimula commits pequenos | Alvos granulares permitem iterar com `make check-web` antes de commitar; o gate completo roda uma vez, no commit |
| `quality-gate` pode aprovar por engano se um job novo não for adicionado ao `needs` | O agregador lista dependências explicitamente e o §12 exige sucesso explícito; adicionar job sem adicionar ao `needs` é item de revisão |
| YAML do workflow só é validado de fato no primeiro push | O passo 5 do fluxo confere a execução real antes de qualquer exigência de check |
| Checksum fixado do Gitleaks exige atualização manual a cada nova versão | A versão fica registrada no `docs/HANDOFF.md`; atualizá-la é uma alteração deliberada e revisável, que é justamente o comportamento desejado para uma ferramenta de segurança |
