# HANDOFF

Estado corrente para qualquer agente (Kimi, Codex, Claude) que assumir o trabalho.
Sem credenciais, sem caminhos pessoais.

## Objetivo

FocusQuest: plataforma de estudos gamificada com Tifa Lockhart como tutora
interativa. Especificação completa em `README.md`. Entrega por incrementos.

## Revisão-base

Incremento 0 — saneamento. Repositório criado neste incremento; antes disso
não havia histórico.

## Decisões tomadas

| Decisão | Motivo |
|---|---|
| Pasta do frontend permanece `frontend/`, não `web/` | README §3 manda adaptar a árvore à localização atual e não mover arquivos por estética. Divergência deliberada da árvore de exemplo. |
| Dois commits no saneamento | O primeiro congela o estado encontrado; o segundo isola as correções como diff auditável (README §3: comparar build antes/depois). |
| Tailwind como `devDependency` | O plugin roda no build do Vite; nada dele chega ao bundle do navegador. Na raiz estava como `dependency`. |
| `.run/` fora do `.gitignore` | README §4 manda versionar configuração de execução compartilhada. `.idea/` continua ignorado por ser estado pessoal. |

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

## Comandos e resultados

Executados em `frontend/`:

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

## Ambiente verificado

Node 24.21.0 / npm 11.19.0; Python 3.14.7 (sistema); uv 0.12.13;
Docker 29.7.2 com daemon rodando; Compose v5.5.1; git 2.55.0; gh 2.100.0.

## Pendências

1. **Hooks de qualidade ausentes.** Os dois commits do incremento 0 nasceram
   sem `pre-commit`/`pre-push`, porque nem git nem gate existiam. Bootstrap
   inevitável; não houve `--no-verify` nem `SKIP`. A partir da instalação dos
   hooks, o gate passa a valer sem exceção (README §11).
2. **Backend inexistente.** Sem `pyproject.toml`, `uv.lock`,
   `.python-version` nem `.venv` gerenciado por uv.
3. **Sem suíte de testes.** Nenhum teste Python ou frontend; `make check`
   ainda não existe (README §9).
4. **Sem remoto.** Nenhum remote configurado; CI e proteções de branch
   (README §12) pendentes de autorização.
5. **`AGENTS.md` e `CLAUDE.md` não criados** (README §13).
6. **`docs/ARCHITECTURE.md` não criado** (README §3).

## Próximo incremento

Incremento 1 — fatia vertical: API FastAPI com liveness e readiness real do
banco, PostgreSQL em Docker com versão fixada, uma migração Alembic útil,
entidade de missão persistida e testada, e o Quartel-General consumindo a API.
Sem integração de IA. Exige spec própria antes da implementação.
