# ARCHITECTURE

Este documento existe para responder uma pergunta prática: **onde vai o
arquivo que estou prestes a criar?** — e, antes dela, de que cada diretório é
responsável.

O documento é dividido em dois blocos rotulados, e a distinção é obrigatória:

- **O que existe hoje** (§1, e as linhas marcadas como *existe* em §3 e §4)
  — descrição. Gerada do disco, verificável com `git ls-files`.
- **O que é alvo e ainda não foi implementado** (§2, e as linhas marcadas
  como *contrato* em §3 e §4) — **contrato**, não descrição. Nada nesses
  trechos existe no repositório hoje.

Documentar como existente algo que não existe seria afirmação falsa, e este
projeto trata afirmação falsa em documentação como defeito grave. Por isso
os dois blocos nunca se misturam.

## 1. O que existe hoje

Árvore real dos arquivos versionados, gerada com `git ls-files` ao fim do
Incremento 1a. Ficam de fora os caminhos ignorados pelo git — dependências
(`node_modules/`, `.venv/`), ferramentas baixadas (`.tools/`), saída de build
e de teste (`frontend/dist/`, `frontend/coverage/`,
`frontend/test-results/`, `htmlcov/`, `coverage.xml`), caches, estado de IDE
(`.idea/`), os `.env` locais e `.superpowers/`. Eles existem na máquina de
desenvolvimento, mas não chegam a um clone.

```text
FocusQuest/
├── .github/
│   └── workflows/
│       └── quality.yml            # o gate no GitHub Actions: um job por alvo de verificação do Makefile
├── alembic/                       # migrações do banco
│   ├── versions/
│   │   └── 0001_esquema_inicial.py  # users, missions e mission_operations; semeia o usuário único
│   ├── README
│   ├── env.py                     # resolve a URL do banco; `-x test=true` aponta para o banco de teste
│   └── script.py.mako             # modelo de migração nova
├── docs/                          # documentação viva do projeto
│   ├── ARCHITECTURE.md            # este arquivo
│   ├── HANDOFF.md                 # estado corrente: decisões, alterações, pendências
│   ├── QUALITY.md                 # o gate: comandos, cobertura, limitações
│   └── superpowers/               # planos e specs do processo de execução por incrementos
│       ├── plans/
│       └── specs/
├── frontend/                      # a aplicação React; TODO código de interface mora aqui
│   ├── public/                    # arquivos servidos sem passar pelo bundler
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/                       # código-fonte da aplicação (denominador da cobertura)
│   │   ├── assets/                # hero.png, react.svg, vite.svg — nenhum importado hoje (ver abaixo)
│   │   ├── features/
│   │   │   └── missions/          # a feature de missões: tipos, hook de dados e componente
│   │   │       ├── MissionList.test.tsx
│   │   │       ├── MissionList.tsx
│   │   │       ├── types.ts
│   │   │       ├── useMissions.test.tsx
│   │   │       └── useMissions.ts
│   │   ├── pages/
│   │   │   ├── Headquarters.test.tsx
│   │   │   └── Headquarters.tsx   # o Quartel-General: compõe a tela, sem regra
│   │   ├── shared/
│   │   │   └── api/
│   │   │       ├── client.test.ts
│   │   │       └── client.ts      # o cliente HTTP único; componente nenhum chama fetch
│   │   ├── test/                  # infraestrutura de teste, não código de aplicação
│   │   │   └── setup.ts
│   │   ├── App.css                # não importado por nenhum módulo hoje (ver abaixo)
│   │   ├── App.test.tsx
│   │   ├── App.tsx                # escolhe a tela; hoje, só o Quartel-General
│   │   ├── index.css              # estilos globais (Tailwind), importado por main.tsx
│   │   ├── main.test.tsx
│   │   └── main.tsx
│   ├── tests/
│   │   └── e2e/                   # Playwright + axe-core; fora da coleta do Vitest
│   │       ├── headquarters.spec.ts
│   │       └── servers.ts         # as portas dedicadas do E2E (API 8100, frontend 5273)
│   ├── .env.example               # VITE_API_URL e o alvo do proxy; modelo do frontend/.env
│   ├── .gitignore
│   ├── .prettierignore
│   ├── .prettierrc.json
│   ├── README.md
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json               # também define os scripts que o Makefile chama
│   ├── playwright.config.ts       # servidores dedicados do E2E, sem reuso, sem retentativa
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.e2e.json          # faz o `tsc -b` alcançar tests/e2e
│   ├── tsconfig.node.json
│   └── vite.config.ts             # build, proxy de /api, coleta de teste e limiares de cobertura
├── scripts/                       # lógica de shell do gate, compartilhada entre local e CI
│   ├── check-push.sh              # valida o topo de cada ref enviada, em worktree isolado
│   ├── e2e-env.sh                 # sobe a API do E2E apontada para o banco de teste
│   ├── init-test-db.sql           # cria o focusquest_test (compose e CI usam o mesmo arquivo)
│   └── install-gitleaks.sh        # baixa o Gitleaks fixado, verificado por dois SHA-256
├── src/
│   └── focusquest/                # o pacote Python da API, instalado em modo editável
│       ├── core/                  # infraestrutura comum a todos os módulos
│       │   ├── __init__.py
│       │   ├── base.py            # base declarativa do SQLAlchemy
│       │   ├── config.py          # Settings (pydantic-settings), prefixo FOCUSQUEST_
│       │   ├── database.py        # engine e sessão por requisição
│       │   └── errors.py          # erros de domínio comuns
│       ├── modules/
│       │   ├── __init__.py
│       │   └── missions/
│       │       ├── __init__.py
│       │       ├── domain.py      # estados, transições, XP e duração real — sem FastAPI nem SQLAlchemy
│       │       ├── models.py      # User, Mission e MissionOperation
│       │       ├── router.py      # as três rotas de /api/missions
│       │       ├── schemas.py     # contratos de entrada e saída
│       │       └── service.py     # casos de uso: criar, listar, concluir
│       ├── __init__.py
│       └── main.py                # app FastAPI, tradução de erro em status, /health e /ready
├── tests/
│   ├── integration/               # contra PostgreSQL real (focusquest_test), nunca SQLite
│   │   ├── __init__.py
│   │   ├── conftest.py            # engine de teste, guarda do banco, DROP SCHEMA e migração
│   │   ├── test_e2e_env.py
│   │   ├── test_health.py
│   │   ├── test_migrations.py
│   │   ├── test_missions_api.py
│   │   ├── test_missions_concorrencia.py
│   │   ├── test_missions_models.py
│   │   └── test_missions_service.py
│   └── unit/                      # sem banco
│       ├── __init__.py
│       ├── test_config.py
│       ├── test_missions_domain.py
│       └── test_package.py
├── .env.example                   # modelo do .env da raiz (banco); o .env é ignorado pelo git
├── .gitignore
├── .gitleaks.toml                 # configuração da varredura de segredos
├── .pre-commit-config.yaml        # declara os hooks pre-commit, pre-merge-commit e pre-push
├── .python-version
├── AGENTS.md                      # regras comuns a todos os agentes
├── CLAUDE.md                      # importa AGENTS.md e acrescenta o específico do Claude Code
├── Makefile                       # a entrada única do gate e do ambiente local
├── README.md                      # a especificação do produto; autoridade final
├── alembic.ini
├── compose.yaml                   # o PostgreSQL local: postgres:18.6-alpine na porta 55432 do host
├── pyproject.toml                 # pacote focusquest, dependências e configuração de Ruff, mypy, pytest e coverage
└── uv.lock
```

### O que a árvore acima **não** tem

Registrado explicitamente, para que ninguém leia ausência como descuido:

- **Não existe `Dockerfile`.** A aplicação roda direto da árvore (`uv run`,
  `npm run`); só o PostgreSQL roda em container, pelo `compose.yaml`.
- **Não existe `.run/`.** O README §4 manda versionar configuração de execução
  compartilhada, e o `.gitignore` já reserva o caminho (comentando que `.run/`
  **não** entra nele), mas o diretório ainda não foi criado.
- **Não existe `repository.py`.** O `service.py` de `missions` usa a `Session`
  do SQLAlchemy diretamente; a camada de repositório do §2 continua contrato,
  e nasce quando se justificar (README §3: "quando necessário").
- **Não existem os módulos `tutoring` e `progress`, nem módulo `users`.** O
  modelo `User` mora em `modules/missions/models.py` como dívida consciente
  (ver `docs/HANDOFF.md`).
- **No frontend, não existem `app/`, `styles/`, nem `shared/ui/`,
  `shared/hooks/`, `shared/lib/` e `shared/types/`.** Nem as features
  `tutoring` e `rewards`.
- **Arquivos órfãos, versionados e sem uso.** `frontend/src/App.css` e os três
  arquivos de `frontend/src/assets/` (`hero.png`, `react.svg`, `vite.svg`)
  não são importados por nenhum módulo — conferido com `grep` em
  `frontend/src` e `frontend/index.html`. São restos do scaffold do Vite. A
  remoção é mudança de código, não deste documento; está registrada como
  pendência em `docs/HANDOFF.md`.

## 2. Árvore-alvo — contrato, não descrição

A árvore abaixo é a do README §3, reproduzida aqui como contrato. **Cada
módulo nasce apenas quando houver implementação real**; criar a pasta vazia
antes disso é a "camada vazia" que o README §3 proíbe. O que dela já existe
está no §1; o restante continua contrato.

```text
focusquest/
  src/focusquest/
    main.py
    core/                   # configuração, conexão e infraestrutura comum
    modules/
      missions/
        router.py           # transporte HTTP
        schemas.py          # contratos de entrada e saída
        service.py          # casos de uso
        domain.py           # regras independentes de framework
        repository.py       # acesso à persistência, quando necessário
        models.py           # mapeamento SQLAlchemy
      tutoring/
      progress/
  tests/
    unit/
    integration/
  alembic/
  web/
    src/
      app/                  # inicialização, rotas e providers
      pages/                # composição de telas
      features/
        tutoring/
        missions/
        rewards/
      shared/
        ui/                 # componentes visuais reutilizáveis
        api/                # cliente HTTP e tratamento de erros
        hooks/
        lib/
        types/
      assets/
      styles/               # tokens e estilos globais
    tests/e2e/
  scripts/
  docs/
  .github/workflows/
  .run/
  AGENTS.md
  CLAUDE.md
  pyproject.toml
  uv.lock
  compose.yaml
  Dockerfile
  Makefile
  .env.example
  README.md
```

### Divergência deliberada: `frontend/`, não `web/`

A árvore-alvo chama a pasta do frontend de `web/`; **neste repositório ela é
`frontend/` e assim permanece**. Não é descuido nem pendência: o próprio §3
manda "adaptar a árvore à localização atual do frontend" e "não mover arquivos
só por estética". Renomear `web/` custaria ajustar imports, aliases, scripts
do `package.json`, o `WEB := frontend` do Makefile, os
`cache-dependency-path: frontend/package-lock.json` e os
`working-directory: frontend` do workflow e os caminhos de cobertura — tudo
isso para não mudar nenhum comportamento. A decisão já está registrada em
`docs/HANDOFF.md`; esta seção é a versão arquitetural dela.

Onde o restante deste documento cita um caminho da árvore-alvo sob `web/`,
leia `frontend/`.

## 3. Responsabilidades por camada

### Backend — `missions` existe; o resto é contrato

Conforme o README §3. A coluna **Estado** diz se a camada já tem um arquivo
real no módulo `missions`.

| Camada | Responsabilidade | O que **não** faz | Estado |
|---|---|---|---|
| `router.py` | Coordena HTTP: recebe a requisição validada, chama o serviço, torna a transação permanente e devolve o contrato de saída. | Não contém regra de negócio nem acesso direto ao banco. Não trata erro: os erros de domínio sobem e `main.py` os traduz. | existe |
| `schemas.py` | Contratos de entrada e saída (Pydantic): a fronteira entre o mundo externo e o interno. | Não é o modelo de persistência. | existe |
| `service.py` | Executa o caso de uso: orquestra domínio e persistência, decide o que é sucesso e o que é falha. | Não conhece `Request`, `Response` nem código HTTP. | existe |
| `domain.py` | Concentra as regras, independentes de framework: transições de estado válidas, cálculo de XP, duração real. | Não importa SQLAlchemy, FastAPI nem nada de I/O. | existe |
| `repository.py` | Trata o banco: consultas e gravações, quando a camada se justificar. | Não decide regra; só busca e persiste. | contrato |
| `models.py` | Mapeamento SQLAlchemy das tabelas. | Não é o contrato da API. | existe |
| `core/` | Configuração, conexão e infraestrutura comum a todos os módulos. | Não é depósito de funções soltas. | existe |

Uma precisão sobre a transação, que a tabela resume demais: **quem faz o
`commit` é a rota**, não o serviço nem a dependência de sessão. O motivo
está em `core/database.py` — um commit feito depois do `yield` rodaria com
a resposta já montada, e uma falha ali não teria mais como mudar o status.
A dependência `get_session` abre uma sessão por requisição e a fecha ao
final, revertendo o que ficou pela metade.

A regra que dá sentido à tabela: o modelo **solicita**, o backend **autoriza e
executa** (README §6). Nenhuma camada acima do domínio pode conceder XP,
concluir missão ou confirmar recompensa por conta própria.

### O contrato HTTP que existe

> **Fonte de verdade:** `src/focusquest/modules/missions/router.py`,
> `src/focusquest/modules/missions/schemas.py` e `src/focusquest/main.py`.

| Método e caminho | Sucesso | O que faz |
|---|---|---|
| `POST /api/missions` | `201` com a missão criada | Cria uma missão `pendente` para o usuário único. |
| `GET /api/missions` | `200` com a lista | Lista as missões do usuário único, em ordem de prazo (`deadline`, com `id` como desempate). Coleção vazia é `[]` com 200, não 404. |
| `POST /api/missions/{mission_id}/complete` | `200` com a missão | Conclui a missão, de forma idempotente pelo `operation_id` do corpo: o reenvio do mesmo identificador devolve 200 de novo, com o mesmo corpo. |
| `GET /health` | `200 {"status": "ok"}` | Liveness. Não toca no banco. |
| `GET /ready` | `200` ou `503` | Readiness. Executa `SELECT 1`; responde `{"status": "unavailable", "database": "unavailable"}` com 503 quando o banco não responde. |

- **Usuário único, declarado** (decisão A2): as três rotas de missão usam a
  constante `USUARIO_UNICO = 1` do `router.py`. Não há autenticação, sessão
  nem token.
- **Entrada de criação** (`MissionCreate`): `instructions` e
  `completion_criterion` (texto não vazio), `difficulty` (inteiro de 1 a
  `DIFICULDADE_MAXIMA = 5`), `estimated_minutes` (inteiro maior que zero) e
  `deadline`. O teto da dificuldade mora no schema, e não no domínio, de
  propósito: o domínio responde quanto vale uma dificuldade, a borda
  responde qual dificuldade aceita receber.
- **`deadline` exige fuso.** O campo é `AwareDatetime`: um datetime sem fuso
  é recusado com 422, com `type: timezone_aware` no erro de validação.
  **O `/openapi.json` não expressa essa exigência** — o schema gerado diz
  apenas `{"type": "string", "format": "date-time"}`. A exigência é
  verificada em runtime, e um cliente gerado a partir do schema só a
  descobriria ao receber o 422.
- **Saída** (`MissionRead`): `id`, `instructions`, `completion_criterion`,
  `difficulty`, `estimated_minutes`, `deadline`, `state`, `started_at`,
  `completed_at`, mais dois campos **derivados, nunca gravados**: `xp`
  (calculado da dificuldade, decisão A4) e `actual_duration_minutes`
  (minutos inteiros entre início e conclusão, ou `null`). Não publica
  `user_id` nem `created_at`.
- **Estados**: `pendente`, `em_andamento` e `concluida`, com `concluida`
  terminal (decisão A5). Os valores ficam em português — são dados, não
  chave de payload. Não existe endpoint de iniciar missão: `em_andamento` e
  `started_at` existem no modelo e no domínio, mas as rotas atuais não os
  alcançam, e por isso `actual_duration_minutes` sai sempre `null` por elas.
- **Corpo de erro**: `{"detail": ...}`, com a **chave em inglês** (a mesma
  que o FastAPI usa no 422 de validação) e a **prosa em pt-BR**. O 422 de
  validação mantém o formato nativo do FastAPI, em que `detail` é uma
  **lista** de erros, não um texto.

| Situação | Status | `detail` |
|---|---|---|
| Missão inexistente | `404` | `"missao nao encontrada"` |
| Missão de outro usuário | `404`, não 403 | o **mesmo** corpo do 404 acima — responder diferente revelaria que o recurso existe |
| Transição ilegal (ex.: operação nova sobre missão já concluída) | `409` | a mensagem do domínio, dizendo de onde para onde não se pode ir |
| `operation_id` já gasto em outra operação | `409` | a mensagem do serviço, sem revelar a missão nem o tipo da outra operação |
| Corpo inválido | `422` | lista de erros do FastAPI |

Os dois 409 **não têm um `code` legível por máquina**: só a mensagem em
português os distingue, e a ação correta do cliente é oposta nos dois
(transição ilegal: não há o que repetir; identificador gasto: gerar um
`operation_id` novo e repetir o mesmo corpo). Registrado como pendência em
`docs/HANDOFF.md`.

### Frontend — parte descrição, parte contrato

- **`src/app/`** *(contrato)* — inicialização, rotas e providers. Hoje o papel
  é cumprido por `src/main.tsx`, que monta `App` em `#root` dentro de
  `StrictMode`, e por `src/App.tsx`, que escolhe a tela (sem roteador, porque
  só há uma).
- **`src/pages/`** *(existe)* — **composição**: uma página junta features e
  componentes reutilizáveis e decide o layout da tela. Não contém regra. Hoje
  há uma: `Headquarters.tsx`, o Quartel-General.
- **`src/features/<feature>/`** *(existe para `missions`; contrato para
  `tutoring` e `rewards`)* — a feature é a unidade real de organização:
  componentes, hooks, contratos e testes **daquele** assunto, agrupados. Em
  `missions`, `useMissions.ts` busca os dados e expõe os quatro estados de
  tela como união discriminada (carregando, vazio, erro, carregado), e
  `MissionList.tsx` os desenha.
- **`src/shared/api/`** *(existe)* — o cliente HTTP único (`client.ts`), com
  a tradução de falha em `ApiError`. Os demais `shared/` (`ui/`, `hooks/`,
  `lib/`, `types/`) continuam contrato.
- **`src/styles/`** *(contrato)* — tokens e estilos globais. Hoje os estilos
  globais estão em `src/index.css`.
- **`src/assets/`** *(existe)* — imagens e SVGs importados pelo código, em
  oposição a `public/`, servido sem passar pelo bundler. Hoje nenhum dos três
  arquivos da pasta é importado (§1).
- **`src/test/`** *(existe)* — infraestrutura de teste (setup do jsdom).
  Está **fora** do denominador da cobertura de propósito; ver
  `docs/QUALITY.md` §3.
- **`tests/e2e/`** *(existe)* — os cenários do Playwright, fora de `src/` e
  fora da coleta do Vitest.

### Como o frontend alcança a API

**Por proxy do Vite, não por CORS.** O navegador pede `/api/...` para a
própria origem do Vite, e o `server.proxy` do `frontend/vite.config.ts`
encaminha ao backend — então não existe pedido cross-origin, e o backend não
tem `CORSMiddleware`. O `vite preview`, que o E2E usa, herda o mesmo proxy
(no Vite 8.3.0 instalado, `preview.proxy ?? server.proxy`).

- **`VITE_API_URL`** é o caminho relativo `/api`, lido por
  `src/shared/api/client.ts`. O cliente **lança no carregamento do módulo**
  se a variável faltar ou estiver vazia, e a aplicação não chega a
  renderizar. É falha alta deliberada, não bug: um padrão silencioso
  transformaria "esqueci de configurar" num 404 três camadas adiante. Em
  desenvolvimento ela vem de `frontend/.env` (modelo em
  `frontend/.env.example`); nos testes, do `test.env` do `vite.config.ts`;
  no build do E2E, da linha de comando do `make check-e2e`.
- **`API_PROXY_TARGET`** é o alvo do proxy, com `http://127.0.0.1:8000` como
  padrão. Ela é lida de `process.env` pelo `vite.config.ts`, e **o Vite não
  injeta o `.env` em `process.env`** (ele carrega o `.env` só para
  `import.meta.env`, e só as chaves com prefixo `VITE_`). Escrita num
  `.env`, ela é ignorada em silêncio. A forma que funciona é na linha de
  comando ou no ambiente do processo:
  `API_PROXY_TARGET=http://127.0.0.1:8100 npm run dev`. É assim que o E2E a
  passa, pelo `env` do `webServer` no `playwright.config.ts`.
- **Consequência que precisa ser lembrada:** no dia em que o frontend for
  servido por outra coisa que não o Vite, volta a faltar CORS ou um proxy
  reverso.

## 4. Onde colocar cada tipo de arquivo

A coluna **Estado** separa o que já é caminho real do que é contrato. Um
caminho marcado como contrato é criado pelo primeiro arquivo que
legitimamente pertence a ele — nunca antes.

### Frontend

| Vou criar… | Vai em | Estado |
|---|---|---|
| Componente visual reutilizável, sem regra de negócio (botão, cartão, barra de progresso) | `frontend/src/shared/ui/<Componente>.tsx` | contrato |
| Componente específico de uma feature (cartão de missão, painel da Tifa) | `frontend/src/features/<feature>/<Componente>.tsx` | existe (`missions`) |
| Chamada HTTP | `frontend/src/shared/api/` — **sempre**. Componente nenhum chama `fetch` direto. | existe |
| Tipo compartilhado por mais de uma feature | `frontend/src/shared/types/` | contrato |
| Tipo usado só por uma feature | junto da feature, em `frontend/src/features/<feature>/` | existe (`missions/types.ts`) |
| Hook genérico | `frontend/src/shared/hooks/` | contrato |
| Hook que só faz sentido dentro de uma feature | `frontend/src/features/<feature>/` | existe (`missions/useMissions.ts`) |
| Token visual (cor, espaçamento, tipografia, foco, movimento) | `frontend/src/styles/` | contrato |
| Estilo global | hoje `frontend/src/index.css`; migra para `frontend/src/styles/` quando a pasta nascer | existe |
| Teste de componente | **ao lado do arquivo testado**, com o mesmo nome e sufixo `.test.tsx` (`App.tsx` → `App.test.tsx`) | existe |
| Página (composição de features) | `frontend/src/pages/` | existe |
| Teste ponta a ponta | `frontend/tests/e2e/` | existe |
| Imagem ou SVG importado pelo código | `frontend/src/assets/` | existe |
| Arquivo servido cru, sem bundler (favicon) | `frontend/public/` | existe |

### Backend

| Vou criar… | Vai em | Estado |
|---|---|---|
| Rota HTTP | `src/focusquest/modules/<módulo>/router.py`, registrada em `src/focusquest/main.py` com `include_router` | existe (`missions`) |
| Tradução de erro de domínio em status HTTP | `src/focusquest/main.py`, com `exception_handler` — em um lugar só, não por rota | existe |
| Contrato de entrada/saída da API | `src/focusquest/modules/<módulo>/schemas.py` | existe (`missions`) |
| Caso de uso | `src/focusquest/modules/<módulo>/service.py` | existe (`missions`) |
| Regra de domínio | `src/focusquest/modules/<módulo>/domain.py` | existe (`missions`) |
| Erro de domínio comum a mais de um módulo | `src/focusquest/core/errors.py` | existe |
| Modelo (tabela SQLAlchemy) | `src/focusquest/modules/<módulo>/models.py` | existe (`missions`) |
| Consulta ou gravação no banco | `src/focusquest/modules/<módulo>/repository.py` | contrato |
| Migração | `alembic/versions/` | existe |
| Configuração, conexão, infraestrutura comum | `src/focusquest/core/` | existe |
| Teste unitário (sem banco) / de integração (PostgreSQL real) | `tests/unit/` / `tests/integration/` | existe |
| Módulo `tutoring`, `progress` ou outro do README §8 | `src/focusquest/modules/<módulo>/` | contrato |

### Fora da aplicação

| Vou criar… | Vai em |
|---|---|
| Lógica de shell com mais de duas linhas usada pelo gate | `scripts/` (decisão D6: o Make do macOS roda cada linha em sua própria shell) |
| Job do CI | `.github/workflows/quality.yml`, **só depois** de existir o alvo do Makefile que ele executa |
| Serviço de infraestrutura local (banco) | `compose.yaml` |
| Variável de configuração do backend | um campo em `src/focusquest/core/config.py` **e** uma linha no `.env.example`. O `Settings` recusa **qualquer** chave do `.env` da raiz que não seja campo dele — com ou sem o prefixo `FOCUSQUEST_` —, então o `.env` da raiz não pode guardar variável de outro consumidor sem declará-la ali |
| Documentação de arquitetura | este arquivo |
| Configuração de execução compartilhada do PyCharm | `.run/` (ainda não existe; versionado de propósito) |

## 5. Convenções de fronteira

1. **Não importe detalhe interno de outra feature.** Se `missions` precisa de
   algo de `tutoring`, ou o que ela precisa é compartilhado — e então sobe
   para `shared/` — ou a dependência está errada. Importar
   `features/tutoring/internals/...` de dentro de `features/missions/` é o
   acoplamento que a divisão por feature existe para impedir.
2. **Nada de dependência circular.** Se A importa B e B importa A, o que as
   duas realmente compartilham é uma terceira coisa que ainda não foi
   extraída. Extraia-a em vez de fechar o ciclo. Foi por isso que
   `get_engine` e `get_session` moram em `core/database.py`, e não em
   `main.py`: `main.py` importa o router, e o router precisa da sessão.
3. **Só sobe para `shared/` o que é realmente compartilhado.** O critério é
   uso real por mais de uma feature, não expectativa de reúso futuro. Regra
   específica de uma feature fica na feature — mesmo que pareça genérica.
4. **Nada de depósito de código.** `utils`, `common`, `helpers` e um `core/`
   usado como sótão acumulam funções sem dono, e ninguém consegue dizer de que
   o arquivo é responsável. Se o nome do módulo não descreve uma
   responsabilidade, o módulo está errado. Prefira funções e composição;
   Repository, Unit of Work, Strategy e Adapter só quando resolverem um
   problema real (README §3).
5. **Centralize configuração, cliente HTTP, erros e tokens visuais.** Cada um
   em um lugar, não replicado por feature.
6. **Os dois alertas explícitos do README §3**, repetidos porque são os dois
   defeitos que este projeto mais provavelmente cometeria:
   - **Nada de `App.tsx` gigante.** Hoje `App.tsx` só devolve
     `<Headquarters />`. No dia em que houver mais de uma tela, o que entra
     nele é um roteador, não o conteúdo da segunda tela.
   - **Nada de chamadas HTTP espalhadas por componentes.** Toda ida à rede
     passa pelo cliente de `shared/api/`, com tratamento de erro no mesmo
     lugar. Um `fetch` dentro de um componente é um defeito de arquitetura,
     não um atalho.
7. **Idioma: interface em português do Brasil; contratos externos em
   inglês; identificadores internos podem ficar em português** (README §3).
   Contrato externo são nomes de coluna, chaves de payload JSON e rotas —
   o que atravessa o sistema. O texto que a pessoa lê é pt-BR, inclusive a
   prosa dentro do `detail` de um erro. Nomes internos do código Python
   (`criar_missao`, `xp_para_dificuldade`, `DIFICULDADE_MAXIMA`) estão em
   português; os valores do estado da missão (`pendente`, `em_andamento`,
   `concluida`) também, por serem dado e não chave de payload.

## 6. Qual documento responde o quê

| Pergunta | Documento |
|---|---|
| O que o produto deve ser? Qual a regra da spec sobre isto? | `README.md` — autoridade final |
| Onde vai este arquivo? De que este diretório é responsável? Qual é o contrato HTTP? | **este documento** |
| Como rodo o gate? O que ele mede, o que não mede, e o que ele **não** protege? | `docs/QUALITY.md` |
| O que já foi feito, o que foi decidido e por quê, o que ainda está pendente? | `docs/HANDOFF.md` |
| Como trabalho aqui sem quebrar nada? | `AGENTS.md` (e `CLAUDE.md`, que o importa) |

A fronteira entre este documento e os outros dois de `docs/`: **arquitetura**
descreve a forma do código e não fala de comandos; **qualidade** descreve a
verificação e não fala de onde o arquivo mora; **handoff** descreve o estado
em um momento do tempo e envelhece de propósito, enquanto estes dois só mudam
quando a forma ou o gate mudam.
