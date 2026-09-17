# HANDOFF

Estado corrente para qualquer agente (Kimi, Codex, Claude) que assumir o trabalho.
Sem credenciais, sem caminhos pessoais.

## Objetivo

FocusQuest: plataforma de estudos gamificada com Tifa Lockhart como tutora
interativa. Especificação completa em `README.md`. Entrega por incrementos.

## Revisão-base

Incremento 2 — fundação de qualidade. Compreende o saneamento (Incremento 0,
já concluído antes deste) e o gate de qualidade completo (`make check`,
hooks de git, o workflow do GitHub Actions e a documentação dos três —
Tasks 1 a 7 deste incremento). A fatia vertical (Incremento 1 da numeração
original da spec) ainda não foi iniciada; ver "Próximo incremento".

## Decisões tomadas

| Decisão | Motivo |
|---|---|
| Pasta do frontend permanece `frontend/`, não `web/` | README §3 manda adaptar a árvore à localização atual e não mover arquivos por estética. Divergência deliberada da árvore de exemplo. |
| Dois commits no saneamento | O primeiro congela o estado encontrado; o segundo isola as correções como diff auditável (README §3: comparar build antes/depois). |
| Tailwind como `devDependency` | O plugin roda no build do Vite; nada dele chega ao bundle do navegador. Na raiz estava como `dependency`. |
| `.run/` fora do `.gitignore` | README §4 manda versionar configuração de execução compartilhada. `.idea/` continua ignorado por ser estado pessoal. |
| D1 — O gate cobre apenas categorias com código real por trás; cada incremento futuro traz a sua | Rodar Ruff, mypy, pytest ou Playwright sobre conjunto vazio é o "sucesso com suíte vazia" proibido pelo §9; alvos que falham por pendência travariam todo commit, já que os hooks do §11 não admitem `SKIP`. |
| D2 — `pyproject.toml` + `uv.lock` criados agora, só com dev-dependencies | Fonte única de verdade para versões das ferramentas Python; `uv sync --frozen` no CI entrega exatamente o mesmo que a máquina local. |
| D3 — Hooks do pre-commit usam `language: system` e invocam `make check` | Impede a divergência clássica entre a versão que o hook instala e a que o lockfile fixa. |
| D4 — Gitleaks instalado por `scripts/install-gitleaks.sh` em `.tools/`, versão e checksums SHA-256 fixados | Binário Go, ausente do `uv.lock`. O hook gerenciado pelo pre-commit criaria recursão (pre-commit chamaria `make check`, que chamaria `pre-commit run`), proibida pelo §9. |
| D5 — Alvos granulares no Makefile, espelhados 1:1 nos jobs do CI | O §12 exige jobs distintos sob um agregador; um alvo por job mantém local e CI no mesmo caminho de execução. |
| D6 — Lógica com mais de duas linhas mora em `scripts/`, não no Makefile | GNU Make 3.81 (o disponível no macOS) executa cada linha de receita em sua própria shell; o §12 pede scripts compartilhados entre local e CI. |
| D7 — `main.tsx` é testado, não excluído da cobertura | O §9 proíbe excluir código difícil e proíbe diretivas de ignorar cobertura; testá-lo custa poucas linhas. |
| D8 — Prettier sem `eslint-config-prettier` | No flat config do ESLint 9+, os presets `recommended` não trazem regras de formatação; não há conflito a desarmar. |

## Alterações do incremento 0

- `git init` na raiz, branch `main`; `.gitignore` cobrindo Python, Node,
  segredos e estado de IDE.
- Tailwind desduplicado: `@tailwindcss/vite` e `tailwindcss` movidos do
  `package.json` da raiz para `frontend/package.json` como devDependencies.
  `package.json`, `package-lock.json` e `node_modules/` da raiz removidos.
- `"strict": true` adicionado a `tsconfig.app.json` e `tsconfig.node.json`.
  Nenhum erro novo: o código atual é simples demais para acusar.
- Removidos restos do projeto `PythonProject`: `main.py` (sample do PyCharm),
  `.venv/` (criado para outro projeto, continha apenas pip) e
  `.idea/PythonProject.iml`. Referência pendente em `.idea/modules.xml`
  corrigida para `FocusQuest.iml`.

## Alterações do incremento 2

Tasks 1 a 7 (spec em
`docs/superpowers/specs/2026-09-17-fundacao-qualidade-design.md`):

- **Task 1:** `Makefile` (alvos `help`, `check`, `check-web`, `format`) e
  Prettier (`frontend/.prettierrc.json`) com ESLint, `tsc -b` e verificação
  de formato encadeados em `check-web`.
- **Task 2:** Vitest + Testing Library + `@vitest/coverage-v8`, limiares de
  100% (linhas, ramificações, funções, instruções) sobre
  `frontend/src/**/*.{ts,tsx}`, incluindo teste de `main.tsx` (D7).
- **Task 3:** raiz Python gerenciada por `uv` (`.python-version`,
  `pyproject.toml`, `uv.lock`, `.venv`), só com o grupo `dev` (Ruff, mypy,
  pre-commit) — D1 e D2. Sem pacote nem dependência de aplicação.
- **Task 4:** `scripts/install-gitleaks.sh` (Gitleaks 8.30.1, fixado por
  dois checksums SHA-256 — do tarball e do binário extraído — D4) e o alvo
  `check-secrets`, agregado em `check` junto com `check-web`.
- **Task 5:** `.pre-commit-config.yaml` declarando os três estágios de hook
  (`pre-commit`/`pre-merge-commit`/`pre-push`, D3) e `scripts/check-push.sh`,
  que valida o topo de cada ref enviada em worktree isolado (D5, D6). A
  instalação em si (`uv run pre-commit install --install-hooks`) não faz
  parte de `make bootstrap` — ver "Setup" acima.
  **Primeiro commit validado pelo gate: `b237e47`** (o commit que introduziu
  os próprios hooks — todos os onze commits anteriores, do saneamento à
  Task 4, antecederam a instalação do gate e não foram avaliados por ele).
- **Task 6:** `docs/QUALITY.md` (comandos, regra de direção única,
  denominador da cobertura, roadmap de `check-api`/`check-e2e`, integração
  contínua, limitações conhecidas e procedimento de atualização do
  Gitleaks) e as oito demonstrações de que o gate reprova de fato — cada
  uma rodada e conferida de forma independente. O relatório de execução
  dessas demonstrações (`task-6-report.md`) é local, sob
  `.superpowers/sdd/`, diretório ignorado pelo `.gitignore` da raiz: não
  acompanha o repositório nem chega a um clone, então ninguém além de quem
  o gerou consegue abri-lo por esse caminho.
- **Task 7:** `.github/workflows/quality.yml` — o mesmo gate no GitHub
  Actions, com um job por alvo do Makefile (`check-web`, `check-secrets`) e
  o agregador `quality-gate` com `if: always()`, destinado a ser o status
  obrigatório da proteção de branch (D5). Dispara em `push`,
  `pull_request`, `workflow_dispatch` e `merge_group`, com
  `contents: read`, sem segredos, sem `continue-on-error` e sem cancelar
  execuções anteriores. Versões de `actions/checkout` e `actions/setup-node`
  confirmadas via `gh api` (@v7 nas duas), não copiadas de memória.
  **Executado de verdade e aprovado** na primeira execução após o push
  inicial: `check-web` em 21s, `check-secrets` em 5s e `quality-gate` em 3s.
  Antes disso o YAML já havia passado por `actionlint` via Docker,
  verificação conferida de forma independente. O relatório dessa
  execução (`task-7-report.md`) é local, sob `.superpowers/sdd/` — ignorado
  pelo `.gitignore` da raiz e portanto ausente de qualquer clone, não um
  caminho que o leitor deste documento consiga abrir; descrição funcional
  em `docs/QUALITY.md` §5.

### Documentação de agentes e arquitetura (README §13 e §3)

Resolve as pendências 3 e 4 abaixo. Entregue pelo fluxo de branch + pull
request (PR #2), sob a `main` protegida. **Não é o primeiro exercício desse
fluxo:** o PR #1 (`docs/estado-remoto`) veio antes e já está mesclado em
`0f43b28` — conferido com `gh pr list --state all`.

- `AGENTS.md` (raiz) — regras comuns a Kimi, Codex e Claude: leitura
  obrigatória antes de trabalhar, fluxo por branch e PR, `make check` antes de
  propor commit ou merge, proibição de `--no-verify`/`SKIP`/`|| true`/
  `continue-on-error`, um implementador por worktree, e as regras desta base
  que um agente novo quebraria sem saber (direção única da invocação,
  paridade 1:1 CI × Makefile, cobertura de 100%, contrato do `check-api`,
  push de uma ref por vez, instalação dos hooks por clone/worktree).
- `CLAUDE.md` (raiz) — importa `AGENTS.md` e acrescenta apenas o específico do
  Claude Code. Sem conteúdo duplicado.
- `docs/ARCHITECTURE.md` — ver pendência 4.

## Comandos e resultados

Executados em `frontend/` (incremento 0):

| Comando | Antes | Depois |
|---|---|---|
| `npm ci` | ok | ok |
| `npm run build` | ok | ok |
| `npm run lint` | ok (0 erros) | ok (0 erros) |

Artefatos de build idênticos antes e depois (mesmos hashes de conteúdo:
`index-CzAwYuOZ.css` 6.65 kB, `index-DIqAoAkR.js` 219.77 kB).

Verificação adicional: com `node_modules/` da raiz removido e antes de
declarar as dependências em `frontend/`, o build falhou com
`TS2307: Cannot find module '@tailwindcss/vite'` — confirmando que a
configuração anterior dependia da resolução hierárquica de `node_modules` e
quebraria em `npm ci` isolado ou em CI.

Executado na raiz (incremento 2):

| Comando | Resultado |
|---|---|
| `make check` | Aprovado: ESLint, Prettier `--check`, `tsc -b` e Vitest com 100% de cobertura, seguidos de Gitleaks sem achados, em ~2,5 s em árvore limpa. Primeiro commit validado pelo gate (via hook `pre-commit`, não por invocação manual): `b237e47`. |
| `shellcheck` via Docker | Aprovado (`koalaman/shellcheck:stable`) em `scripts/install-gitleaks.sh` e `scripts/check-push.sh`. Os dois únicos avisos são falsos positivos conhecidos, ambos em `check-push.sh`: SC2034 na variável de controle do `for` da limpeza (ela é um contador, não é lida de propósito) e SC2329 em `on_signal`, que é invocada por `trap` e o ShellCheck não enxerga. Nenhum defeito real. |
| `actionlint` via Docker | Aprovado (`rhysd/actionlint:latest`) em `.github/workflows/quality.yml`, sem findings. |
| `git push` contra remoto bare local | Aprovado: o `pre-push` roda o gate em worktree isolado, aceita o push de `main` e rejeita o push de uma branch com erro de tipo — checado de forma independente. A saída completa (`final-fix-report.md`) é um relatório local, sob `.superpowers/sdd/`, ignorado pelo `.gitignore` da raiz: não vai para o repositório nem chega a um clone. |

## Ambiente verificado

Node 24.21.0 / npm 11.19.0; Python 3.14.7 (sistema); uv 0.12.13;
Docker 29.7.2 com daemon rodando; Compose v5.5.1; git 2.55.0; gh 2.100.0.

**Versões fixadas do gate:** Gitleaks 8.30.1 (checksums do tarball e do
binário extraído em `scripts/install-gitleaks.sh` — os dois valores ficam
só ali, não duplicados aqui; procedimento de atualização em
`docs/QUALITY.md` §7); Ruff, mypy e pre-commit conforme `uv.lock`; Prettier
3.9.7 e Vitest 5.0.1 conforme `frontend/package-lock.json`.

## Setup (clone ou worktree novo)

`make bootstrap` **não** instala hooks de git — só dependências. Em
qualquer clone ou worktree novo, rode os três comandos abaixo, nesta ordem
(detalhado, com o porquê da separação, em `docs/QUALITY.md`, seção
"Primeiro uso após clonar"):

```bash
make bootstrap
uv run pre-commit install --install-hooks
make check
```

Sem o segundo comando, commits e pushes não passam por nenhuma validação
local, sem aviso.

## Pendências

1. **Backend sem código de aplicação.** `pyproject.toml`, `uv.lock`,
   `.python-version` e `.venv` existem desde a Task 3 deste incremento
   (D2), mas só com o grupo `dev` (Ruff, mypy, pre-commit) — sem pacote,
   sem dependência de aplicação, sem nenhum módulo Python real.
2. **Integração remota concluída.** Remoto em
   `github.com/BipoXDXD/FocusQuest` (privado), 32 commits publicados, CI
   verde na primeira execução, e a `main` protegida exigindo o status
   `quality-gate`, com base atualizada obrigatória, `enforce_admins`
   ativo e sem force-push nem deleção (README §12).

   A proteção foi verificada por comportamento, não só por configuração:
   um push direto na `main` é recusado pelo servidor com
   `GH006: Required status check "quality-gate" is expected`, **mesmo
   depois de o gate local ter aprovado** — as duas camadas são
   independentes e a do servidor não confia na do cliente.

   Consequência operacional: a `main` não aceita mais push direto. Todo
   trabalho passa por branch e pull request, com merge condicionado ao
   `quality-gate` verde.

   Caminhos exercitados pela primeira vez neste push, ambos aprovados: a
   trilha `PRE_COMMIT_LOCAL_BRANCH` + `git rev-parse` do
   `scripts/check-push.sh`, que só existe quando o push inclui o commit
   raiz; e a branch `Linux-x86_64` de `scripts/install-gitleaks.sh`, que a
   máquina de desenvolvimento (ARM) nunca executa.
3. **`AGENTS.md` e `CLAUDE.md` criados** (README §13). `AGENTS.md` na raiz
   concentra as regras comuns; `CLAUDE.md` o importa com `@AGENTS.md`, o
   mecanismo oficial do Claude Code, e acrescenta só o que é específico dele.
   Sem duplicação de conteúdo entre os dois.

   A descoberta de instruções por agente foi registrada com o estado de cada
   uma, conforme o §13 exige ("não invente capacidades"): **Claude Code** e
   **Codex** confirmados na documentação oficial de cada um; **Kimi Code
   confirmado no binário instalado** (kimi-code 2.0.0) — a função de
   descoberta caminha da raiz do work-tree do Git até o diretório de trabalho
   recolhendo `.kimi-code/AGENTS.md` e `AGENTS.md` em cada nível, e o prompt
   padrão do agente principal injeta o resultado em `${agents_md}`. Fica a
   ressalva de que `SYSTEM.md`, `--agent`/`--agent-file` e um agente de
   projeto com `override: true` substituem esse prompt e podem derrubar a
   injeção. Nenhum dos três foi verificado por execução neste repositório. A
   tabela com o estado de cada agente está em `AGENTS.md` §5.
4. **`docs/ARCHITECTURE.md` criado** (README §3). Separa em blocos rotulados o
   que existe hoje (árvore gerada do disco, com a responsabilidade de cada
   diretório) do que é alvo e ainda não foi implementado (a árvore do §3 do
   README, as camadas do backend e os caminhos do frontend que ainda não
   nasceram). Documenta onde colocar cada tipo de arquivo, as convenções de
   fronteira e a divergência deliberada `frontend/` × `web/`.

   O backend está registrado como **contrato**, nunca como descrição: não
   existe um único arquivo `.py` no repositório, e descrevê-lo como existente
   seria a afirmação falsa que a revisão deste projeto trata como defeito
   grave. Mesmo tratamento para `.run/`, `alembic/`, `compose.yaml`,
   `Dockerfile` e `.env.example`, todos ausentes e registrados como tal.
5. **`check-api` e `check-e2e` ainda não existem.** Ruff, mypy e pytest
   entram no gate junto com o primeiro módulo Python; Playwright/axe-core
   junto com o primeiro fluxo ponta a ponta real. Contrato completo e
   motivo da ausência atual em `docs/QUALITY.md` §4 (roadmap dos alvos
   ausentes).
6. **Divergência conhecida da spec: o `uv.lock` não é validado em lugar
   nenhum.** A spec previa `uv sync --frozen` no CI; o workflow só faz
   `npm ci`, e `uv sync --frozen` existe apenas no alvo `bootstrap`, que o
   CI não chama. Um `uv.lock` dessincronizado do `pyproject.toml` não é
   detectado por nada — e, medido com `uv 0.12.13`, **`--frozen` não
   validaria nem se estivesse no CI**: ele usa o lockfile como está sem
   compará-lo ao `pyproject.toml`. Quem valida é `uv sync --locked` ou
   `uv lock --check`. Deliberadamente **não corrigido agora**: um passo só
   no CI quebraria a paridade 1:1 de D5, e um alvo só para isso colocaria
   uma etapa Python no gate sem nenhum arquivo `.py` no repositório. Entra
   junto com o alvo `check-api`, que vai precisar de `uv` de qualquer
   forma. Detalhe, com a medição, em `docs/QUALITY.md` §4.

## Próximo incremento

Incremento 1 (numeração original da spec) — fatia vertical: API FastAPI com
liveness e readiness real do banco, PostgreSQL em Docker com versão fixada,
uma migração Alembic útil, entidade de missão persistida e testada, e o
Quartel-General consumindo a API. Sem integração de IA. Exige spec própria
antes da implementação — e, por D1, traz consigo o alvo `check-api`
(README §9, `docs/QUALITY.md` §4).
