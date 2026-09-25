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
Incremento B (`feat/incremento-b`, ainda não publicado — ver
`docs/HANDOFF.md`), com as Tasks 0–9 comitadas (`12288a2..0b9197b`).
Ficam de fora os caminhos ignorados pelo git — dependências
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
│   │   ├── 0001_esquema_inicial.py  # users, missions e mission_operations; semeia o usuário único
│   │   ├── 0002_tutoria.py        # tutor_messages e tutor_actions, com as restrições da tutoria
│   │   └── 0003_ciclo_diario.py   # weekly_plans; mission_type/plan_id/day em missions; deadline vira nulável (B)
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
│   │   │   ├── missions/          # a feature de missões: tipos, hooks de leitura e de conclusão, componente
│   │   │   │   ├── CycleSection.test.tsx  # (B, Task 8, commit 08b3dcc)
│   │   │   │   ├── CycleSection.tsx       # a "Missão de hoje", sequência, progresso/especial (B, Task 8)
│   │   │   │   ├── MissionCard.tsx        # o cartão de missão, extraído de MissionList.tsx (B, Task 8)
│   │   │   │   ├── MissionList.test.tsx
│   │   │   │   ├── MissionList.tsx  # o quadro "Outras missões — tarefas com prazo" (B, decisão P8); expõe MissionListHandle (reload) por useImperativeHandle
│   │   │   │   ├── civilDate.test.ts      # (B, Task 7, commit 242d677)
│   │   │   │   ├── civilDate.ts           # formata "YYYY-MM-DD" sem conversão de fuso (B, Task 7 — Risco 3 do plano)
│   │   │   │   ├── completionFailure.test.ts
│   │   │   │   ├── completionFailure.ts # code de erro → mensagem e ação da tela; ganhou missao_expirada (B)
│   │   │   │   ├── types.ts             # ganhou MissionType, Availability, DAYS_PER_MILESTONE, Cycle (B)
│   │   │   │   ├── useCompleteMission.test.tsx
│   │   │   │   ├── useCompleteMission.ts # conclui uma missão; ganhou onCompleted opcional (B, Task 8)
│   │   │   │   ├── useCompletionRegistry.test.tsx
│   │   │   │   ├── useCompletionRegistry.ts # chaves por missão, acima dos cartões; a recarga que espera
│   │   │   │   ├── useCycle.test.tsx      # (B, Task 7, commit 242d677)
│   │   │   │   ├── useCycle.ts            # busca GET /api/cycle; refresh sem passar por carregando (B, decisão P9)
│   │   │   │   ├── useMissions.test.tsx
│   │   │   │   └── useMissions.ts
│   │   │   └── tutoring/          # a Tifa na tela (1b-2); importa só de shared/, nunca de features/missions/
│   │   │       ├── ProposalCard.test.tsx
│   │   │       ├── ProposalCard.tsx       # o cartão de proposta: Confirmar/Recusar, um ramo por Outcome
│   │   │       ├── TutorConversation.tsx  # a conversa: histórico, campo, região viva de status
│   │   │       ├── TutorPanel.test.tsx
│   │   │       ├── TutorPanel.tsx         # o painel: lateral (desktop) ou folha modal (celular), hooks no topo
│   │   │       ├── actionFailure.test.ts
│   │   │       ├── actionFailure.ts       # mapa exaustivo BY_CODE (describeActionFailure) para confirmar/recusar
│   │   │       ├── conversationHistory.test.ts
│   │   │       ├── conversationHistory.ts # appendTurn, settleInterrupted, pendingFromHistory, replaceAction
│   │   │       ├── messageFailure.test.ts
│   │   │       ├── messageFailure.ts      # mapas PRE_STREAM e IN_STREAM para o envio de pergunta
│   │   │       ├── panelPreference.test.ts
│   │   │       ├── panelPreference.ts     # localStorage do painel aberto/fechado, tolerante a exceção
│   │   │       ├── questionLimit.test.ts
│   │   │       ├── questionLimit.ts       # MAX_QUESTION_LENGTH, COUNTER_VISIBLE_FROM, describeQuestionLength
│   │   │       ├── types.ts               # contrato da API e os três code (PreStream/Stream/Action)
│   │   │       ├── useActionKeys.test.tsx
│   │   │       ├── useActionKeys.ts       # chaves de confirmação por ação, no topo do TutorPanel
│   │   │       ├── useDecideAction.test.tsx
│   │   │       ├── useDecideAction.ts     # confirmar/recusar via postJson, reusando o CodigoDeErro do A
│   │   │       ├── useIsDesktop.test.tsx
│   │   │       ├── useIsDesktop.ts        # useSyncExternalStore sobre matchMedia (min-width: 1024px)
│   │   │       ├── useTutorConversation.test.tsx
│   │   │       ├── useTutorConversation.ts # histórico, rascunho, envio por postStream, reenvio idempotente
│   │   │       ├── useTutorStatus.test.tsx
│   │   │       └── useTutorStatus.ts      # disponibilidade da Tifa, error separado de unavailable
│   │   ├── pages/
│   │   │   ├── Headquarters.test.tsx
│   │   │   └── Headquarters.tsx   # o Quartel-General: compõe missions e tutoring; CycleSection acima de MissionList (B)
│   │   ├── shared/
│   │   │   ├── api/
│   │   │   │   ├── client.test.ts
│   │   │   │   └── client.ts      # o cliente HTTP único: postJson e postStream; componente nenhum chama fetch
│   │   │   └── lib/                # funções puras com mais de um usuário entre features (docs/ARCHITECTURE.md §5)
│   │   │       ├── deadline.test.ts
│   │   │       └── deadline.ts     # formatDeadline em America/Sao_Paulo; usado pelo cartão da missão e o da proposta
│   │   ├── test/                  # infraestrutura de teste, não código de aplicação (docs/QUALITY.md §3)
│   │   │   ├── fetchRoutes.ts     # routeFetch: fetch falso roteado por metodo/URL, um Response novo por chamada
│   │   │   ├── setup.ts           # liga o modo de teste do React; limpa o DOM entre testes
│   │   │   ├── sse.ts             # quadros e corpos SSE falsos, sem rede
│   │   │   └── viewport.ts        # stubViewport: matchMedia falso (jsdom não implementa)
│   │   ├── App.css                # não importado por nenhum módulo hoje (ver abaixo)
│   │   ├── App.test.tsx
│   │   ├── App.tsx                # escolhe a tela; hoje, só o Quartel-General
│   │   ├── index.css              # estilos globais (Tailwind), importado por main.tsx
│   │   ├── main.test.tsx
│   │   └── main.tsx
│   ├── tests/
│   │   └── e2e/                   # Playwright + axe-core; fora da coleta do Vitest
│   │       ├── cycle.spec.ts      # semeia o plano pela API, conclui a diária de hoje, axe (B, Task 9, commit 0b9197b)
│   │       ├── falso.ts           # cliente do controle do falso: definirRoteiro, liberar, reiniciar, requisicoes
│   │       ├── headquarters.spec.ts
│   │       ├── servers.ts         # as portas dedicadas do E2E (API 8100, frontend 5273, falso 8150)
│   │       └── tutoring.spec.ts   # cinco cenários da tutoria contra o falso como processo (docs/QUALITY.md §9)
│   ├── .env.example               # VITE_API_URL e o alvo do proxy; modelo do frontend/.env
│   ├── .gitignore
│   ├── .prettierignore
│   ├── .prettierrc.json
│   ├── README.md
│   ├── eslint.config.js
│   ├── index.html                 # lang="pt-BR" e interactive-widget=resizes-content (1b-2, Task 4)
│   ├── package-lock.json
│   ├── package.json               # também define os scripts que o Makefile chama
│   ├── playwright.config.ts       # servidores dedicados do E2E, sem reuso, sem retentativa; três webServer
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.e2e.json          # faz o `tsc -b` alcançar tests/e2e
│   ├── tsconfig.node.json
│   └── vite.config.ts             # build, proxy de /api, coleta de teste e limiares de cobertura
├── scripts/                       # lógica de shell do gate, compartilhada entre local e CI
│   ├── check-push.sh              # valida o topo de cada ref enviada, em worktree isolado
│   ├── e2e-env.sh                 # sobe a API do E2E; guarda de loopback e chave fictícia (1b-2); guarda do banco compartilhada com tests/integration/banco_de_teste.py (B, Task 6)
│   ├── init-test-db.sql           # cria o focusquest_test (compose e CI usam o mesmo arquivo)
│   ├── install-gitleaks.sh        # baixa o Gitleaks fixado, verificado por dois SHA-256
│   └── push-env.sh                # mecanismo de lista de permissão que o pre-push usa para exportar FOCUSQUEST_*
├── src/
│   └── focusquest/                # o pacote Python da API, instalado em modo editável — o 1b-2 não muda nada aqui
│       ├── core/                  # infraestrutura comum a todos os módulos
│       │   ├── __init__.py
│       │   ├── base.py            # base declarativa do SQLAlchemy
│       │   ├── clock.py           # o relógio injetável: Clock, system_now e a dependência get_clock
│       │   ├── config.py          # Settings (pydantic-settings), prefixo FOCUSQUEST_
│       │   ├── database.py        # engine e sessão por requisição
│       │   └── errors.py          # erros de domínio comuns
│       ├── modules/
│       │   ├── __init__.py
│       │   ├── missions/
│       │   │   ├── __init__.py
│       │   │   ├── cycle_domain.py  # regras puras do ciclo: dia, semana, disponibilidade, sequencia, marco, janela (B)
│       │   │   ├── cycle_router.py  # POST /api/plans, GET /api/plans/current, GET /api/cycle (B)
│       │   │   ├── cycle_schemas.py # contratos do plano semanal e do ciclo (B)
│       │   │   ├── cycle_service.py # criar plano, ler plano/ciclo/missao, historico, ocultacao (B)
│       │   │   ├── domain.py      # estados/transições/XP de missão; MissionType e xp_da_missao (B) — sem FastAPI nem SQLAlchemy
│       │   │   ├── models.py      # User, Mission (mission_type/plan_id/day, B), MissionOperation e WeeklyPlan (B)
│       │   │   ├── router.py      # as três rotas de /api/missions
│       │   │   ├── schemas.py     # contratos de entrada e saída; MissionRead com mission_type/day/availability (B)
│       │   │   └── service.py     # casos de uso: criar, listar (só avulsas, B), concluir (ocultação e regra do dia, B)
│       │   └── tutoring/          # a Tifa (1b-1); depende de missions, nunca o contrário
│       │       ├── __init__.py
│       │       ├── domain.py      # enums (Papel, StatusDaMensagem, EstadoDaAcao, TipoDeAcao, CodigoDoStream), transição da ação
│       │       ├── models.py      # TutorMessage, TutorAction
│       │       ├── provider.py    # o Protocol do provedor e seus eventos (Delta, Proposta, Fim) e erros
│       │       ├── anthropic_provider.py  # o adaptador: única peça que importa o SDK `anthropic`
│       │       ├── persona.py     # o prompt de sistema da Tifa (README §5)
│       │       ├── context.py     # monta o turno: persona, agora, missões pendentes, histórico fundido
│       │       ├── schemas.py     # contratos de entrada e saída (chaves em inglês: contrato externo)
│       │       ├── service.py     # preparar, transmitir, listar, confirmar, recusar
│       │       ├── sse.py         # formato do evento SSE e o invólucro que fecha o gerador na desconexão
│       │       ├── dependencies.py  # get_tutoria() -> Tutoria | None ("sem chave" é None, não exceção)
│       │       └── router.py      # as cinco rotas de /api/tutoring
│       ├── __init__.py
│       └── main.py                # app FastAPI, tradução de erro em status, /health, /ready e a tutoria
├── tests/
│   ├── conftest.py                 # guarda de sessão: nenhum teste alcança a Anthropic de verdade
│   ├── integration/               # contra PostgreSQL real (focusquest_test), nunca SQLite
│   │   ├── __init__.py
│   │   ├── banco_de_teste.py    # guarda do banco de teste + recriar_esquema, compartilhada com make reset-test-db e scripts/e2e-env.sh (B, Task 6)
│   │   ├── camada3.py             # grava a referência da camada 3 (chamada real, manual, do dono; nunca no gate) (1b-2)
│   │   ├── conftest.py            # engine de teste; banco_migrado usa banco_de_teste.recriar_esquema + upgrade (B); fixtures da tutoria (`falso`, `fabrica`, `tutoria`, `conversa`)
│   │   ├── falso_do_e2e.py        # o falso como processo próprio (1b-2): controle HTTP /_control/*, porta por --porta
│   │   ├── provedor_falso.py      # o servidor HTTP falso da Anthropic, roteirizável, com o bloco de thinking da API real por padrão (não é teste)
│   │   ├── referencia_da_api_real.json  # a sequência de tipos de evento de uma resposta real, sem conteúdo (gerada pelo camada3.py)
│   │   ├── test_anthropic_provider.py  # o adaptador contra o servidor falso (inclui: o thinking não chega ao domínio)
│   │   ├── test_camada3.py        # camada 3 do falso: a mesma sequência de eventos da API real (docs/QUALITY.md)
│   │   ├── test_banco_de_teste.py  # a guarda recusa o banco de desenvolvimento; recriar_esquema apaga tudo do de teste (B, Task 6)
│   │   ├── test_cycle_api.py      # o contrato HTTP do ciclo: formas, recusas, códigos, ocultação por 404 (B, Task 5)
│   │   ├── test_cycle_completion.py  # ocultação e regra do dia na conclusão, listagem só de avulsas (B, Task 4)
│   │   ├── test_cycle_concorrencia.py  # a trava perto da virada do dia, provada por entrelaçamento (B, Task 4)
│   │   ├── test_cycle_models.py   # restrições do ciclo no banco, uma por INSERT recusado e nomeado (B, Task 2)
│   │   ├── test_cycle_service.py  # criar o plano semanal e ler o ciclo derivado do relógio (B, Task 3)
│   │   ├── test_e2e_env.py        # guarda de loopback e chave fictícia do scripts/e2e-env.sh (1b-2)
│   │   ├── test_falso_do_e2e.py   # o contrato do controle HTTP do falso_do_e2e.py, do lado Python (1b-2)
│   │   ├── test_health.py
│   │   ├── test_install_gitleaks.py  # o script de download do Gitleaks, verificação de checksum e retentativa
│   │   ├── test_migrations.py
│   │   ├── test_missions_api.py
│   │   ├── test_missions_concorrencia.py
│   │   ├── test_missions_models.py
│   │   ├── test_missions_service.py
│   │   ├── test_provedor_falso.py # camadas 1 e 2 do falso: contrato com o SDK real (docs/QUALITY.md)
│   │   ├── test_push_env.py       # o mecanismo de lista de permissão de scripts/push-env.sh
│   │   ├── test_sessao_em_utc.py  # sessão em UTC com PGTZ a leste e a oeste
│   │   ├── test_tutoring_acoes.py # confirmar e recusar, inclusive concorrência real
│   │   ├── test_tutoring_api.py   # rotas, códigos de erro, SSE, segredo
│   │   ├── test_tutoring_desconexao.py  # desconexão com uvicorn real (M9: o TestClient não serve)
│   │   ├── test_tutoring_models.py  # restrições do banco, uma por INSERT
│   │   └── test_tutoring_service.py  # preparar e transmitir um turno
│   └── unit/                      # sem banco
│       ├── __init__.py
│       ├── test_clock.py
│       ├── test_config.py         # inclui a regressão da guarda com a chave exportada no ambiente (1b-2, Task 8 Step 1)
│       ├── test_cycle_domain.py   # dia, semana, disponibilidade, sequência, marco e janela, em tabela (B, Task 1)
│       ├── test_cycle_invariantes.py  # MissaoLida, dia_da_diaria, leitura_da_avulsa (B, Task 2)
│       ├── test_missions_domain.py
│       ├── test_package.py
│       ├── test_tutoring_context.py  # montagem do turno
│       ├── test_tutoring_domain.py   # enums e transição da ação
│       ├── test_tutoring_persona.py  # o prompt cumpre as exigências do README §5/§6
│       ├── test_tutoring_router_sse.py  # o `finally: eventos.close()` de `_em_sse`
│       └── test_tutoring_sse.py      # o invólucro `fechando_ao_cancelar`
├── .env.example                   # modelo do .env da raiz (banco e a tutoria); a chave da Anthropic fica vazia — a de verdade mora no Keychain (D-a, 1b-2)
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
├── pyproject.toml                 # pacote focusquest, dependências (inclui anthropic, httpx2 e anyio, da tutoria) e configuração de Ruff, mypy, pytest e coverage
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
- **Não existe o módulo `progress`, nem módulo `users`.** O modelo `User`
  mora em `modules/missions/models.py` como dívida consciente (ver
  `docs/HANDOFF.md`). O módulo `tutoring` **nasceu no 1b-1** (backend) e
  ganhou o lado do frontend (`frontend/src/features/tutoring/`) **no
  1b-2** — a feature existe hoje, não é mais contrato.
- **No frontend, não existem `app/`, `styles/`, nem `shared/ui/`,
  `shared/hooks/` e `shared/types/`.** `shared/lib/` **nasceu no 1b-2**, com
  `deadline.ts` (§5 regra 3). A feature `rewards` continua contrato.
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

### Backend — `missions` e `tutoring` existem; o resto é contrato

Conforme o README §3. A coluna **Estado** diz se a camada já tem um arquivo
real, e em qual módulo.

| Camada | Responsabilidade | O que **não** faz | Estado |
|---|---|---|---|
| `router.py` | Coordena HTTP: recebe a requisição validada, chama o serviço, torna a transação permanente e devolve o contrato de saída. | Não contém regra de negócio nem acesso direto ao banco. Não trata erro: os erros de domínio sobem e `main.py` os traduz. | existe (`missions`, `tutoring`) |
| `schemas.py` | Contratos de entrada e saída (Pydantic): a fronteira entre o mundo externo e o interno. | Não é o modelo de persistência. | existe (`missions`, `tutoring`) |
| `service.py` | Executa o caso de uso: orquestra domínio e persistência, decide o que é sucesso e o que é falha. | Não conhece `Request`, `Response` nem código HTTP. | existe (`missions`, `tutoring`) |
| `domain.py` | Concentra as regras, independentes de framework: transições de estado válidas, cálculo de XP, duração real (`missions`); enums e transição da ação (`tutoring`). | Não importa SQLAlchemy, FastAPI nem nada de I/O. | existe (`missions`, `tutoring`) |
| `repository.py` | Trata o banco: consultas e gravações, quando a camada se justificar. | Não decide regra; só busca e persiste. | contrato |
| `models.py` | Mapeamento SQLAlchemy das tabelas. | Não é o contrato da API. | existe (`missions`, `tutoring`) |
| `provider.py` / `anthropic_provider.py` / `persona.py` / `context.py` / `sse.py` / `dependencies.py` | Peças específicas da tutoria: o `Protocol` do provedor, o único adaptador que importa o SDK, o prompt de sistema, a montagem do turno, o formato SSE e a dependência que resolve "sem chave". | O adaptador é a **única** peça que importa `anthropic`; nenhuma outra camada da tutoria sabe que existe Anthropic. | existe (`tutoring`) |
| `core/` | Configuração, conexão e infraestrutura comum a todos os módulos. | Não é depósito de funções soltas. | existe |

**A dependência é `tutoring → missions`, nunca o contrário.**
`tutoring/service.py` importa `Mission` e `criar_missao` de
`modules/missions/service.py`, e `tutoring/domain.py` reusa
`TransicaoIlegalError` de `modules/missions/domain.py` (mesmo `code`, mesmo
sentido — confirmar ou recusar uma ação segue o desenho de concluir uma
missão). Nada em `modules/missions/` importa nada de `modules/tutoring/`; a
convenção de fronteira 2 (§5, "nada de dependência circular") proíbe o
sentido inverso.

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
| `GET /ready` | `200`, `503` ou `500` | Readiness. Executa `SELECT 1`. Três casos: `200` quando o banco responde; `503` com `{"status": "unavailable", "database": "unavailable"}` quando o banco está configurado mas não responde; **`500`** quando **não há configuração de banco** (sem `FOCUSQUEST_DATABASE_URL` no ambiente nem no `.env` do diretório corrente) — a criação da engine falha antes da consulta, com `ValidationError` do `Settings`. Medido. Qualquer orquestrador trata não-2xx como "não pronto", então a probe reprova nos dois casos de falha; a diferença de status está registrada como pendência em `docs/HANDOFF.md`. |

- **Usuário único, declarado** (decisão A2): as três rotas de missão usam a
  constante `USUARIO_UNICO = 1` do `router.py`. Não há autenticação, sessão
  nem token.
- **O instante da conclusão vem do relógio injetado.** A rota de concluir
  recebe o relógio pela dependência `get_clock` (`core/clock.py`) e o repassa
  ao serviço, que o lê **depois** de travar a linha (decisão C13 da spec do
  ciclo diário). A dependência entrega o relógio, e não o instante: um
  instante resolvido pelo FastAPI seria lido antes da trava. Os testes o
  substituem por `dependency_overrides`.
- **Sem barra final.** As rotas são `/api/missions`, sem `/` no fim. Um
  pedido a `/api/missions/` recebe **`307`** com `Location` apontando para
  `/api/missions` (o redirecionamento automático do FastAPI/Starlette;
  medido). O cliente do frontend chama sem a barra; um cliente que siga
  redirecionamento funciona com um ida e volta a mais, e um que não siga vê
  o 307.
- **`mission_id` do caminho** é inteiro de `1` a `2**31 - 1`
  (`MAIOR_INTEIRO_DA_COLUNA`, o maior valor da coluna `Integer`/int4). Fora
  disso, `422` com `loc: ["path", "mission_id"]` — antes do teto, um id de
  onze dígitos chegava ao banco e estourava o parâmetro com 500.
- **Entrada de criação** (`MissionCreate`): `instructions` e
  `completion_criterion` (texto não vazio), `difficulty` (inteiro de 1 a
  `DIFICULDADE_MAXIMA = 5`), `estimated_minutes` (inteiro de 1 a
  `MAIOR_INTEIRO_DA_COLUNA = 2**31 - 1`) e `deadline`. O teto da dificuldade
  mora no schema, e não no domínio, de propósito: o domínio responde quanto
  vale uma dificuldade, a borda responde qual dificuldade aceita receber. O
  teto de `estimated_minutes` é **técnico** — o maior valor da coluna int4,
  para o excesso virar 422 e não 500 —, e não responde "quanto tempo cabe
  numa missão", que é decisão de produto em aberto (`docs/HANDOFF.md`).
- **`deadline` exige fuso.** O campo é `AwareDatetime`: um datetime sem fuso
  é recusado com 422, com `type: timezone_aware` no erro de validação.
  **O `/openapi.json` não expressa essa exigência** — o schema gerado diz
  apenas `{"type": "string", "format": "date-time"}`. A exigência é
  verificada em runtime, e um cliente gerado a partir do schema só a
  descobriria ao receber o 422.
- **`deadline` precisa caber no `datetime` do Python depois de convertido
  para UTC.** `9999-12-31T23:59:59-03:00` tem data local válida, mas em UTC
  é o ano 10000: é recusado com 422 (`type: value_error`). Antes da guarda
  ele era aceito com 201, o PostgreSQL o gravava, e a partir daí o
  `GET /api/missions` respondia 500 para sempre. Não há janela de negócio
  (prazo no passado, prazo longe demais) — decisão de produto em aberto.
- **Todo instante lido do banco sai em UTC, com `Z`.** A coluna é
  `timestamptz`, e o banco converte o instante para o `TimeZone` da
  **sessão** na leitura; `create_engine_from_url` (`core/database.py`) fixa
  essa sessão em UTC com um `SET TIME ZONE 'UTC'` em toda conexão nova, e
  por ali nascem as engines da aplicação, da suíte e do Alembic. É um `SET`,
  e não `options=-c timezone=UTC`, porque a variável `PGTZ` do ambiente vence
  as `options` (medido). Sem o fuso fixado, a guarda da faixa do prazo não
  bastava: com a sessão em `Asia/Tokyo` o último instante aceito, e com ela
  em `America/Sao_Paulo` o primeiro, deixavam a listagem em 500 (medido;
  `tests/integration/test_sessao_em_utc.py`).
  **Exceção:** o 201 da criação serializa o prazo como ele chegou no pedido,
  com o offset que o cliente mandou (`-03:00` entra e sai `-03:00`); só a
  leitura seguinte o devolve com `Z`. O instante é o mesmo; quem consome
  compara instantes, não strings.
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
- **Corpo de erro de domínio**: `{"detail": ..., "code": ...}`, com as
  **chaves em inglês**. O `code` é o que o cliente lê para decidir; o
  `detail` é prosa em pt-BR **sem acento**, para quem depura, e a tela nunca
  o mostra. Os códigos estão no enum `CodigoDeErro` de `main.py` e são só os
  que algum handler devolve. O 422 de validação mantém o formato nativo do
  FastAPI, em que `detail` é uma **lista** de erros e não há `code`.

| Situação | Status | `code` | `detail` |
|---|---|---|---|
| Missão inexistente | `404` | `missao_nao_encontrada` | `"missao nao encontrada"` |
| Missão de outro usuário | `404`, não 403 | `missao_nao_encontrada` | o **mesmo** corpo do 404 acima, byte a byte: responder diferente revelaria que o recurso existe |
| Transição ilegal (ex.: operação nova sobre missão já concluída) | `409` | `transicao_ilegal` | a mensagem do domínio, dizendo de onde para onde não se pode ir |
| `operation_id` já gasto em outra operação | `409` | `operacao_reutilizada` | a mensagem do serviço, sem revelar a missão nem o tipo da outra operação |
| Corpo inválido, ou `mission_id` fora de `1..2**31 - 1` | `422` | — | lista de erros do FastAPI |

Os dois 409 pedem ações **opostas** do cliente, e é o `code` que os separa:
na transição ilegal não há o que repetir; no identificador gasto, gera-se um
`operation_id` novo e repete-se o mesmo corpo.

### O modelo de dados e o contrato HTTP da tutoria que existem

> **Fonte de verdade:** `src/focusquest/modules/tutoring/models.py`,
> `alembic/versions/0002_tutoria.py`, `src/focusquest/modules/tutoring/router.py`,
> `schemas.py`, `service.py` e `src/focusquest/main.py`.

**As duas tabelas da migração `0002`** (nomes de coluna são contrato, em
inglês). Dos três valores de enum, só `role` (`user`/`tutor`) é inglês —
é contrato externo por si só (`Papel`, em `domain.py`: "valores em inglês:
`role` é contrato"); `status` (`gerando`/`completa`/`interrompida`/`falhou`)
e `state` (`proposta`/`executada`/`recusada`/`falhou`) são português, no
mesmo padrão dos estados de `missions`
(`pendente`/`em_andamento`/`concluida`):

| Tabela | O que guarda | Restrições que o banco garante |
|---|---|---|
| `tutor_messages` | Cada mensagem da conversa contínua (`role` `user`/`tutor`). | `ck_tutor_messages_role` (valor de `role`); `ck_tutor_messages_status` (valor de `status`); `ck_tutor_messages_forma` — um `CASE role WHEN 'user' THEN ... WHEN 'tutor' THEN ... ELSE true END`, não o `OR` que a spec original descrevia (ver "Emendas" da spec) — a forma exigida de cada papel, com a legalidade do próprio `role` delegada só a `ck_tutor_messages_role`; um índice único parcial por `reply_to_id WHERE status = 'completa'` (uma resposta viva por pergunta) e por `user_id WHERE status = 'gerando'` (uma geração por vez); `client_message_id` único entre as mensagens do usuário. |
| `tutor_actions` | Uma proposta de ação da Tifa (hoje só `create_mission`) e o seu ciclo de vida. | `ck_tutor_actions_kind`; `ck_tutor_actions_state`; `ck_tutor_actions_missao_so_quando_executada` (`(state = 'executada') = (mission_id IS NOT NULL)`); `ck_tutor_actions_decisao_datada` (`(state = 'proposta') = (decided_at IS NULL)`); `operation_id` único. `mission_id` **sem** `ondelete` (decisão registrada em `docs/HANDOFF.md`: nem `SET NULL` nem `CASCADE` servem, e não existe exclusão de missão no produto). |

**As cinco rotas de `/api/tutoring`:**

| Método e rota | Entrada | Saída |
|---|---|---|
| `GET /status` | — | `{"available": bool}` — `false` sem chave configurada (`get_tutoria()` devolve `None`) |
| `GET /messages` | — | as últimas 50 mensagens, cronológicas, cada resposta da Tifa com as ações embutidas |
| `POST /messages` | `{"client_message_id", "content"}` | `text/event-stream` (formato abaixo) |
| `POST /actions/{action_id}/confirm` | `{"operation_id"}` | `{"action", "mission"}` |
| `POST /actions/{action_id}/reject` | — | `{"action"}` |

**O stream do `POST /messages`**, eventos SSE nesta ordem: `user_message`
(a pergunta já gravada, com o `id` do banco) → `delta` zero ou mais vezes
(`{"text": "…"}`) → um final, só um: `done` (a resposta completa e as ações
dela, emitido **depois do commit**) ou `error` (`{"code": "…"}`, emitido
**depois** de a falha estar gravada como `falhou`). Um stream sem `done` nem
`error` é resultado desconhecido (a desconexão do cliente, provada com
uvicorn real em `tests/integration/test_tutoring_desconexao.py`, M9 do
plano — o `TestClient` bufferiza a resposta inteira e não desconecta).

**Erros antes do stream** (a pergunta não é gravada): `503
provedor_nao_configurado` (sem chave); `409 mensagem_em_andamento` (já há
uma resposta `gerando`); `409 operacao_reutilizada` (`client_message_id`
com outro `content`); `422` do Pydantic (corpo inválido).

**Erros dentro do stream** (`event: error`, coluna `error_code`), do enum
`CodigoDoStream` de `tutoring/domain.py` — fora do `CodigoDeErro` de
`main.py` de propósito, porque não passam por handler HTTP:
`provedor_indisponivel`, `tempo_esgotado`, `proposta_invalida`.

**Confirmar e recusar**, os mesmos `code` e sentido de concluir uma missão
(`missions`, decisão registrada acima): `200` ao confirmar uma `proposta`
(cria a missão e grava `executada` na mesma transação, com `SELECT ... FOR
UPDATE` na ação) ou ao reenviar a mesma confirmação; `409
operacao_reutilizada` com `operation_id` já usado em outra ação; `409
transicao_ilegal` fora dessas transições; `422 prazo_expirado` quando o
prazo proposto já passou — a ação vira `falhou` com esse código **antes**
de a rota levantar o 422 (o commit vem antes do `raise`, ou a gravação
morreria com a transação); `404 acao_nao_encontrada`.

### O contrato HTTP do ciclo diário que existe (Incremento B)

> **Fonte de verdade:** `src/focusquest/modules/missions/cycle_router.py`,
> `cycle_schemas.py`, `cycle_service.py`, `models.py` (`WeeklyPlan`,
> colunas novas de `Mission`) e `src/focusquest/main.py`. Backend comitado
> (Tasks 0–5); ver `docs/HANDOFF.md` "Alterações do Incremento B" para o
> estado de cada Task.

**Por que o ciclo mora em `missions`, e não num módulo `cycle` próprio**
(decisão P1): a diária e a especial **são** missões — mesma tabela, mesmo
`state`, mesma rota de conclusão —, e um módulo `cycle` separado fecharia um
ciclo de import: `missions/service.py` precisa das regras do ciclo dentro de
`concluir_missao` (a ocultação e a regra do dia), e o ciclo precisa de
`Mission` e de `User` (que mora em `missions/models.py`, pendência 8). A
convenção de fronteira 2 (§5, "nada de dependência circular") proíbe
exatamente essa forma. Por isso os quatro arquivos novos entram como
`cycle_domain.py`/`cycle_service.py`/`cycle_schemas.py`/`cycle_router.py`
dentro de `modules/missions/`, e não como `modules/cycle/`.

**O modelo de dados novo.** `weekly_plans` (`id`, `user_id`, `week_start`,
`created_at`) — o plano de uma semana, com `uq_weekly_plans_user_id_week_start`
(um plano por semana), `uq_weekly_plans_id_user_id` (alvo da FK composta
abaixo) e `ck_weekly_plans_week_start_segunda` (`EXTRACT(ISODOW FROM
week_start) = 1`). `created_at` vem do **relógio injetável**, nunca do
`now()` do banco (decisão P4) — é entrada da regra `fora_do_plano`, e
misturar o relógio do banco com o dos testes faria a regra comparar dois
relógios diferentes.

`missions` ganhou três colunas e seis `CHECK`: `mission_type` (`avulsa` |
`diaria` | `especial`, `ck_missions_mission_type`), `plan_id` (nulo só para
avulsa, `ck_missions_plano_do_tipo`), `day` (preenchido só para diária,
`ck_missions_dia_do_tipo`); `deadline` passou a nulável (obrigatório só
para avulsa, `ck_missions_prazo_do_tipo` — a diária e a especial têm prazo
**derivado**, nunca gravado, C10); `ck_missions_dificuldade_da_especial`
(a especial é sempre dificuldade 5) e `ck_missions_estimativa_do_ciclo`
(diária e especial ≤ 1440 minutos, C10 — a avulsa continua sem teto,
pendência 26). A FK composta `fk_missions_plano_do_usuario`
(`plan_id, user_id` → `weekly_plans.id, user_id`) usa **MATCH SIMPLE** (o
padrão), de propósito: com `plan_id` nulo a FK não é verificada, e é isso
que deixa a avulsa (sem plano) passar — MATCH FULL a recusaria. Mais duas
restrições: `uq_missions_plan_id_day` (uma diária por dia do plano) e
`uq_missions_especial_por_plano`, um **índice único parcial**
(`WHERE mission_type = 'especial'`) — uma especial por plano, sem colidir
com os `NULL` de `day` que ela também tem. Todas as onze restrições nomeadas
são provadas por **recusa nomeada** (`tests/integration/test_cycle_models.py`
insere o que a restrição deveria barrar e afirma o nome dela no erro do
PostgreSQL); só os seis `CHECK` entram no teste de divergência
modelo×migração — os `UNIQUE`, o índice parcial e a FK composta não
(pendência 9, atualizada no B).

**As três rotas novas**, todas em `/api`:

| Método e caminho | Sucesso | O que faz |
|---|---|---|
| `POST /api/plans` | `201` com `PlanRead` | Cria o plano da semana: sete diárias e uma especial. Reenvio responde `409 plano_existente` — nunca duplica (README §6). |
| `GET /api/plans/current` | `200` com `{"plan": PlanRead \| null}` | O plano da semana atual, na **mesma forma** do 201 acima (decisão P2) — "sem plano" é estado, não erro. |
| `GET /api/cycle` | `200` com `CycleRead` | O ciclo derivado do relógio: a missão de hoje, a sequência, os dias até o próximo marco e a especial (se disponível). |

**A forma da trilha (`PlanRead`)**: `{"week_start", "days": [{"day",
"availability", "mission"} × 7], "special": {"availability", "progress",
"mission"}}`. Cada dia carrega sua `availability`
(`fora_do_plano`/`bloqueada`/`disponivel`/`concluida`/`perdida`) e a
`mission` — **o baú fechado**: para um dia `bloqueada` (ainda não revelado),
`mission` é `null` e a chave-forma do objeto é só `{"day", "availability",
"mission"}`, sem vazar nenhum campo da missão futura. O mesmo vale para a
especial `bloqueada`: `{"availability": "bloqueada", "progress": N,
"mission": null}`, sem `id`, sem conteúdo, sem dificuldade.

**`MissionRead` ganhou três campos** (`mission_type`, `day`, `availability`)
e passou a ser construído por `MissionRead.da_leitura(lida: MissaoLida)`, em
vez de `model_validate`/`from_attributes` — `deadline` e `availability` são
**derivados** para a diária e a especial (C10, C2), e só o serviço
(`ler_missao`, `leitura_da_avulsa`) sabe derivá-los. `xp` continua
computado, agora chamando `xp_da_missao(mission_type, difficulty)` — a
especial vale `3 × xp_para_dificuldade(5) = 660` (C9).

**`GET /api/missions` (a rota do 1a) agora lista só avulsas** —
`listar_missoes` filtra `Mission.mission_type == MissionType.AVULSA` — para
não vazar a diária ainda não revelada nem a trilha da semana para quem só
lista missões soltas. Isso também é o motivo da pendência nova sobre a Tifa
não ver o ciclo no contexto (`docs/HANDOFF.md`, pendência 55): o contexto da
tutoria é montado com `listar_missoes`.

**A ocultação: 404 idêntico ao de missão inexistente (C11).** Tudo que
ainda não foi revelado — um dia futuro da semana, uma semana seguinte já
criada, a especial sem marco batido — responde ao `POST
.../complete` com o **mesmo** corpo e `code` de um `mission_id` que não
existe. `ler_missao` decide isso numa função só, chamada tanto pela leitura
quanto pela conclusão (decisão P6): duas funções que decidissem "revelado"
separadamente acabariam discordando uma da outra.

**Quatro códigos de erro novos, todos `409`:**

| Situação | `code` |
|---|---|
| Plano já existe para a semana | `plano_existente` |
| `week_start` no passado (semana já encerrada) | `semana_encerrada` |
| `week_start` mais de uma semana à frente | `semana_distante` |
| Dia ou janela já passou, ou não era do plano (a diária de ontem, a diária `fora_do_plano`, a especial fora da janela) | `missao_expirada` |

A ordem das duas recusas de `criar_plano` **importa**: `semana_encerrada` é
checada **antes** de `semana_distante`, porque a checagem de distância soma
`DIAS_DA_SEMANA - 1` ao `week_start` — para uma semana no último ano
representável (`9999-12-27`, a última segunda-feira válida), essa soma
estoura o `datetime` (`OverflowError`) se a recusa por distância for
tentada primeiro. Testado com `test_semana_no_ano_9999_e_distante_e_nao_500`;
invertida a ordem, o teste reprova com `500` em vez de `409`.

**A ordem completa da conclusão** (diária ou especial): trava
(`SELECT ... FOR UPDATE`) → relógio (lido **depois** da trava, C13) →
ocultação (`ler_missao`) → reenvio (o `operation_id` já usado devolve o
mesmo 200) → regra do dia (`NAO_CONCLUIVEIS`: `fora_do_plano`, `perdida`,
`expirada` → `409 missao_expirada`) → transição de estado. A rota relê a
missão com `ler_missao(session, missao, clock())` **depois do commit**, com
uma segunda chamada ao relógio, para montar a `availability` da resposta
(pendência nova 56, `docs/HANDOFF.md`).

**Reenvio depois da meia-noite continua `200`, nunca `missao_expirada`.**
Uma diária concluída às 23:59:59 e reenviada com a mesma chave às 00:00:01
do dia seguinte devolve o mesmo 200 — a disponibilidade `concluida` nunca
está em `NAO_CONCLUIVEIS`, porque "concluída" é fato permanente, e a
checagem de disponibilidade vem **antes** da checagem de reenvio na ordem
acima só na leitura da ocultação, não na regra do dia (que só se aplica a
quem ainda não concluiu).

### Frontend — parte descrição, parte contrato

- **`src/app/`** *(contrato)* — inicialização, rotas e providers. Hoje o papel
  é cumprido por `src/main.tsx`, que monta `App` em `#root` dentro de
  `StrictMode`, e por `src/App.tsx`, que escolhe a tela (sem roteador, porque
  só há uma).
- **`src/pages/`** *(existe)* — **composição**: uma página junta features e
  componentes reutilizáveis e decide o layout da tela. Não contém regra. Hoje
  há uma: `Headquarters.tsx`, o Quartel-General.
- **`src/features/<feature>/`** *(existe para `missions` e `tutoring`;
  contrato para `rewards`)* — a feature é a unidade real de organização:
  componentes, hooks, contratos e testes **daquele** assunto, agrupados. Em
  `missions`, `useMissions.ts` busca os dados e expõe os quatro estados de
  tela como união discriminada (carregando, vazio, erro, carregado), e
  `MissionList.tsx` os desenha. Cada cartão ainda não concluído tem o botão
  **Concluir**: `useCompleteMission.ts` envia `POST /complete` com um
  `operation_id` gerado no primeiro clique e **mantido entre as tentativas**
  (README §7), e `completionFailure.ts` traduz o `code` de cada falha em
  mensagem e ação (tentar de novo com a mesma chave, com uma chave nova, ou
  atualizar o quadro). As chaves moram em `useCompletionRegistry.ts`, um
  registro **por missão** que vive no `MissionList`, acima dos cartões: o
  reload remonta os cartões, e a chave de uma tentativa com resultado
  desconhecido tem de sobreviver a isso. O mesmo registro conta as conclusões
  em voo, e "Atualizar o quadro" pedido com uma delas em voo **espera** — o
  botão fica desabilitado em "Aguardando a conclusão em andamento…" e o quadro
  recarrega uma vez, sozinho, quando a última termina. Tudo é estado local do
  React; nada disso sai da feature.

  **Desde o Incremento B** (Tasks 7–8, commits `242d677` e `08b3dcc`),
  `missions` ganhou o ciclo diário: `useCycle.ts` busca
  `GET /api/cycle` e expõe um `refresh` que **não** passa por "carregando"
  (decisão P9 — recarregar assim desmontaria o cartão e apagaria o anúncio
  "Missão concluída."); `civilDate.ts` formata a data civil `"YYYY-MM-DD"`
  que a API devolve **sem** conversão de fuso — `new Date(civil)` sozinho
  levaria a tela num fuso a oeste de UTC a mostrar o dia anterior (Risco 3
  do plano); `CycleSection.tsx` desenha a "Missão de hoje", a sequência
  ("Sequência: N dia(s) seguido(s)") e o progresso até o marco ("N de 7"),
  ou o cartão da especial vigente no lugar dele. `MissionCard.tsx` foi
  extraído de `MissionList.tsx` para ser reaproveitado pelo cartão da
  missão de hoje, com o `onCompleted` opcional de `useCompleteMission.ts`
  acionando o `refresh` do ciclo depois de concluir. O quadro de avulsas
  (`MissionList.tsx`) passou a se chamar "Outras missões — tarefas com
  prazo" (decisão P8), e `Headquarters.tsx` compõe `<CycleSection />`
  **acima** dele.

  Em **`tutoring`** (nasceu no 1b-2), o painel da Tifa: `TutorPanel.tsx`
  compõe dois contêineres — lateral expansível no desktop, folha modal no
  celular (`useIsDesktop.ts`, `matchMedia`, não CSS responsivo: a semântica
  ARIA muda com o layout, e media query não tem gancho de JavaScript) — e uma
  região viva de status **fora** dos dois, existindo desde o primeiro render
  (o mesmo padrão do A e do 1a). Os hooks da conversa
  (`useTutorConversation.ts`, `useTutorStatus.ts`, `useActionKeys.ts`) vivem
  no **topo** do painel, acima dos dois contêineres: como a troca de layout
  desmonta e remonta o contêiner ativo, um hook mais fundo perderia o
  rascunho e o stream em voo a cada troca. O envio é uma união discriminada
  (`SendState`: `idle`/`sending`/`writing`/`failed`/`unknown`) sobre
  `postStream`, com reenvio **idempotente** — o `client_message_id` do
  "Tentar de novo" e do **Enviar** com o mesmo texto é o da pergunta
  pendente, e só texto editado gera um id novo (`crypto.randomUUID`). O
  cartão de proposta (`ProposalCard.tsx`) tem um ramo por `Outcome`
  (`proposta`/`executada`/`recusada`/`falhou`), com chave de confirmação por
  **ação** (não por cartão, porque a recarga da conversa remonta os
  cartões). A confirmação chama o backend direto por `useDecideAction.ts`
  (`postJson`, reusando `CodigoDeErro`), sem passar pelo hook da conversa
  (decisão D2 da spec). A recarga do quadro de missões é pedida pela
  **página** (`Headquarters.tsx`), por um `ref`
  (`MissionListHandle` + `useImperativeHandle` em `MissionList.tsx`) — um
  evento, não uma prop observada por efeito, que o lint
  `react-hooks/set-state-in-effect` reprovaria.
- **`src/shared/api/`** *(existe)* — o cliente HTTP único (`client.ts`), com
  `requestJson` (GET), `postJson` (POST) e, desde o 1b-2, `postStream`
  (`fetch` + `ReadableStream` + `TextDecoder`, sem biblioteca de SSE, com
  `AbortSignal` para o painel cancelar ao desmontar) — as três com a mesma
  tradução de falha em `ApiError`, que carrega `status` e `code`. O cliente
  **não lê o `detail`**: a `message` do `ApiError` é escrita por ele, e quem
  decide o que mostrar decide pelo `code`.
- **`src/shared/lib/`** *(existe, desde o 1b-2)* — funções puras com mais de
  um usuário entre features (§5 regra 3). Nasceu com `deadline.ts`
  (`formatDeadline`, fuso `America/Sao_Paulo`, README §8), usado pelo cartão
  da missão e pelo cartão da proposta da Tifa. Os demais `shared/` (`ui/`,
  `hooks/`, `types/`) continuam contrato.
- **`src/styles/`** *(contrato)* — tokens e estilos globais. Hoje os estilos
  globais estão em `src/index.css`.
- **`src/assets/`** *(existe)* — imagens e SVGs importados pelo código, em
  oposição a `public/`, servido sem passar pelo bundler. Hoje nenhum dos três
  arquivos da pasta é importado (§1).
- **`src/test/`** *(existe)* — infraestrutura de teste: `setup.ts` (o modo
  de teste do React), `sse.ts` (quadros SSE falsos), `fetchRoutes.ts`
  (`routeFetch`, um `fetch` falso roteado) e `viewport.ts` (`stubViewport`,
  `matchMedia` falso, desde o 1b-2). Está **fora** do denominador da
  cobertura de propósito; ver `docs/QUALITY.md` §3.
- **`tests/e2e/`** *(existe)* — os cenários do Playwright, fora de `src/` e
  fora da coleta do Vitest. Desde o 1b-2, `servers.ts` também nomeia a porta
  do servidor falso (8150), e `falso.ts` é o cliente do controle HTTP dele.

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
| Componente específico de uma feature (cartão de missão, painel da Tifa) | `frontend/src/features/<feature>/<Componente>.tsx` | existe (`missions`, `tutoring`) |
| Chamada HTTP | `frontend/src/shared/api/` — **sempre**. Componente nenhum chama `fetch` direto. | existe |
| Tipo compartilhado por mais de uma feature | `frontend/src/shared/types/` | contrato |
| Tipo usado só por uma feature | junto da feature, em `frontend/src/features/<feature>/` | existe (`missions/types.ts`, `tutoring/types.ts`) |
| Hook genérico | `frontend/src/shared/hooks/` | contrato |
| Hook que só faz sentido dentro de uma feature | `frontend/src/features/<feature>/` | existe (`missions/useMissions.ts`, `tutoring/useTutorConversation.ts`) |
| Função pura usada por mais de uma feature | `frontend/src/shared/lib/` | existe (`deadline.ts`, desde o 1b-2) |
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
| Código de erro (`code`) do contrato HTTP | `src/focusquest/main.py`, enum `CodigoDeErro`, junto dos handlers — nunca nas exceções do domínio | existe |
| Contrato de entrada/saída da API | `src/focusquest/modules/<módulo>/schemas.py` | existe (`missions`) |
| Caso de uso | `src/focusquest/modules/<módulo>/service.py` | existe (`missions`) |
| Regra de domínio | `src/focusquest/modules/<módulo>/domain.py` | existe (`missions`) |
| Erro de domínio comum a mais de um módulo | `src/focusquest/core/errors.py` | existe |
| Modelo (tabela SQLAlchemy) | `src/focusquest/modules/<módulo>/models.py` | existe (`missions`) |
| Consulta ou gravação no banco | `src/focusquest/modules/<módulo>/repository.py` | contrato |
| Migração | `alembic/versions/` | existe |
| Configuração, conexão, infraestrutura comum | `src/focusquest/core/` | existe |
| Teste unitário (sem banco) / de integração (PostgreSQL real) | `tests/unit/` / `tests/integration/` | existe |
| Adaptador de um provedor externo (ex.: o SDK `anthropic`) | `src/focusquest/modules/<módulo>/<provedor>_provider.py`, atrás de um `Protocol` que o serviço consome | existe (`tutoring/anthropic_provider.py`) |
| Módulo `progress` ou outro do README §8 ainda não iniciado | `src/focusquest/modules/<módulo>/` | contrato |

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
   Foi por isso também que o ciclo diário (Incremento B) mora em
   `modules/missions/cycle_*.py`, e não num módulo `modules/cycle/` próprio
   (decisão P1, `docs/HANDOFF.md`): um módulo separado fecharia o ciclo —
   `missions/service.py` precisa das regras do ciclo dentro de
   `concluir_missao`, e o ciclo precisa de `Mission` e de `User`, que moram
   em `missions/models.py`.
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
   o que atravessa o sistema. O texto que a pessoa lê é pt-BR com acento, e
   é escrito pelo frontend: a prosa do `detail` de um erro é pt-BR **sem
   acento**, para quem depura, e a tela nunca a mostra — ela decide pelo
   `code`. Os valores de `code` estão em português pela mesma razão dos
   valores de estado: são dado, não chave. Nomes internos do código Python
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
