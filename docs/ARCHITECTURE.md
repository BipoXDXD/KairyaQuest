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

Referências a decisões e achados de incrementos anteriores usam os IDs
preservados no [HANDOFF](HANDOFF.md). Relatos completos de implementação e
resultados antigos estão no Git em `ca3b03c:docs/HANDOFF.md`; não são
instruções para repetir fases concluídas.

## Tutoria de produção: Anthropic (2026-11-10)

Cada falha traduzida pelo adaptador (HTTP, timeout, transporte, stream
inválido) deixa uma linha `WARNING` no log local: status HTTP com
`retry-after` e `x-ratelimit-*` saneados, ou o tipo da exceção; nunca corpo,
chave nem texto do usuário (pendência 100).
Isso descrevia o adaptador anterior. No adaptador Anthropic, só a falha
HTTP deixa a linha `WARNING`: status, tipo da exceção e `retry-after` e
`anthropic-ratelimit-*` saneados (até 64 caracteres); timeout e transporte
não são registrados (`test_diagnostico_do_provedor.py`).

`dependencies.get_tutoria` monta `ProvedorAnthropic` com a chave
`FOCUSQUEST_ANTHROPIC_API_KEY`; sem chave, retorna `None` e a tela mostra
indisponibilidade. O adaptador manda o esforço em `output_config.effort`
(`tutor_effort` na conversa, `evaluation_effort` na avaliação) e nunca envia
`temperature`, `top_p`, `top_k` nem `budget_tokens`, que os modelos 5.x
recusam. O prefixo estático vai em cache: `cache_control` na última
ferramenta e no bloco da persona; o contexto do turno e o histórico ficam
depois do ponto de cache. O contexto do turno (o `CABECALHO_DO_CONTEXTO`
seguido de uma linha JSON com `now_utc`, `pending_missions`,
`late_cycle_missions` e `progress`, pendência 184) é um bloco próprio de
`system`, sem `cache_control`, logo depois do bloco da persona. As regras
de autorização, confirmação, avaliação e XP continuam nos serviços. O navegador de testes usa
`tests/integration/e2e_app.py`, chave fictícia e host loopback; essa entrada
não é incluída no pacote da aplicação.

## 1. O que existe hoje

Mapa dos diretórios implementados, atualizado após o redesign desktop
(PR #30, `ca3b03c`). Para a lista exata de arquivos, consulte `git ls-files`;
a documentação descreve responsabilidades sem duplicar esse inventário.

```text
KairyaQuest/
├── src/focusquest/
│   ├── core/                  # configuração, banco e infraestrutura comum
│   └── modules/
│       ├── missions/          # ciclo, planos, missões, entregas e prazos
│       ├── tutoring/          # conversa, provedor e propostas confirmáveis
│       ├── progression/       # XP, níveis e conquistas
│       └── evaluation/        # avaliação das evidências pela tutora
├── alembic/                   # migrações; versões 0001 a 0007
├── tests/                     # testes Python unitários e de integração
├── frontend/
│   ├── public/art/            # cenários e retratos locais; docs/ART.md
│   ├── src/
│   │   ├── app/               # navegação entre áreas
│   │   ├── pages/             # composição de Quartel-General e Campanhas
│   │   ├── features/          # campaigns, missions, progression e tutoring
│   │   ├── shared/            # API, tipos, hooks e funções compartilhados
│   │   └── test/              # infraestrutura dos testes de componentes
│   └── tests/                 # E2E de navegador e testes de infraestrutura
├── scripts/                   # gate, worktrees e diagnósticos operacionais
├── docs/                      # arquitetura, qualidade, estado e arte
│   └── superpowers/specs/     # contratos e decisões dos incrementos
├── .github/workflows/         # CI: um job por alvo; publicação GHCR após o gate
└── .run/                      # configurações compartilhadas do PyCharm
```

Planos concluídos e relatos de execução antigos ficam no histórico Git.
A fotografia anterior à limpeza está em `ca3b03c`; por exemplo,
`git show ca3b03c:docs/HANDOFF.md` recupera decisões e alterações por incremento.
O estado corrente e as pendências estão em [HANDOFF.md](HANDOFF.md).

Dependências, caches, relatórios, configurações locais e worktrees são
ignorados pelo Git. Novas worktrees ficam em `.claude/worktrees/` dentro do
principal, com banco e portas próprios; criação e isolamento em
[QUALITY.md](QUALITY.md#primeiro-uso-após-clonar).

### O que a árvore acima **não** tem

Registrado explicitamente, para que ninguém leia ausência como descuido:

- **Imagens de aplicação:** `docker/api.Dockerfile` e `docker/web.Dockerfile`
  constroem API e frontend. O wrapper local escolhe a arquitetura do daemon;
  os jobs de publicação em `quality.yml` enviam as duas plataformas ao GHCR.
  `scripts/verify_image_platforms.py` confere o índice e os configs reais;
  `quality.yml` chama `scripts/promote_images.py` para promover as tags móveis
  somente após as duas imagens aprovadas e com o commit ainda na ponta da `main`.
- **Não existe `repository.py`.** O `service.py` de `missions` usa a `Session`
  do SQLAlchemy diretamente; a camada de repositório do §2 continua contrato,
  e nasce quando se justificar (README §3: "quando necessário").
- **Não existe o módulo `progress`, nem módulo `users`.** O modelo `User`
  mora em `modules/missions/models.py` como dívida consciente (ver
  `docs/HANDOFF.md`). O módulo `tutoring` **nasceu no 1b-1** (backend) e
  ganhou o lado do frontend (`frontend/src/features/tutoring/`) **no
  1b-2** — a feature existe hoje, não é mais contrato.
- **No frontend, `styles/` e `shared/ui/` nasceram na Fase 4, Tarefa 4.1.**
  `styles/tokens.css` é a fonte única dos tokens visuais; `shared/ui/` tem,
  por ora, só `tokens/` (contraste WCAG e pares) e o `tokens.test.ts`.
  `shared/lib/`
  **nasceu no 1b-2**, com `deadline.ts` (§5 regra 3), e ganhou `civilDate.ts`
  **no C**. `app/` (a navegação lateral), `shared/hooks/`
  (`useRefreshOnReturn.ts`) e `shared/types/` (`mission.ts`) **nasceram no
  Incremento C** — as três eram contrato até então. A feature `campaigns`
  **nasceu no C**, a trilha da semana; `rewards` continua contrato.
- **Não existe `frontend/src/assets/`.** Os restos do scaffold do Vite
  (`App.css`, `hero.png`, `react.svg`, `vite.svg`) eram versionados e não
  eram importados por nenhum módulo; foram removidos em 2026-09-29 (pendência
  24 do `docs/HANDOFF.md`), depois de `grep` em `frontend/` e nos docs sem
  achar referência. A pasta volta a existir quando o primeiro arquivo
  importado pelo código precisar dela.

## 2. Árvore-alvo — contrato, não descrição

A árvore abaixo é a do README §3, reproduzida aqui como contrato. **Cada
módulo nasce apenas quando houver implementação real**; criar a pasta vazia
antes disso é a "camada vazia" que o README §3 proíbe. O que dela já existe
está no §1; o restante continua contrato.

```text
KairyaQuest/
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

### Divergência deliberada: `progression/`, não `progress/`

Pela mesma razão: a árvore-alvo do README §3 chama o módulo de recompensa de
`progress/`; a spec do Incremento D (decisão D1) escolheu `progression/`,
nos dois lados (`src/focusquest/modules/progression/` e
`frontend/src/features/progression/`), porque o módulo é dono de mais do que
uma leitura de progresso — grava o livro-razão de XP e as conquistas. O
módulo **existe** hoje, com esse nome, nos dois lados (ver §1 e §3, abaixo);
onde o restante deste documento cita `progress/` na árvore-alvo, leia
`progression/`.

A árvore-alvo também previa `features/rewards/` no frontend; o anúncio da
recompensa acabou dentro de `features/missions/` (`RewardAnnouncement.tsx`),
porque é o cartão de missão concluída quem o mostra (decisão D16, "o anúncio
no cartão") — e não uma tela ou painel próprio. Não existe `features/rewards/`
neste repositório; o que existe é `features/progression/` (o painel de
saldo/nível/conquistas) e `shared/types/reward.ts` (o contrato do `reward`,
consumido por `missions`).

## 3. Responsabilidades por camada

### Backend — `missions`, `tutoring`, `progression` e `evaluation` existem; o resto é contrato

Conforme o README §3. A coluna **Estado** diz se a camada já tem um arquivo
real, e em qual módulo.

| Camada | Responsabilidade | O que **não** faz | Estado |
|---|---|---|---|
| `router.py` | Coordena HTTP: recebe a requisição validada, chama o serviço, torna a transação permanente e devolve o contrato de saída. | Não contém regra de negócio nem acesso direto ao banco. Não trata erro: os erros de domínio sobem e `main.py` os traduz. | existe (`missions`, `tutoring`, `progression`, `evaluation`) |
| `schemas.py` | Contratos de entrada e saída (Pydantic): a fronteira entre o mundo externo e o interno. | Não é o modelo de persistência. | existe (`missions`, `tutoring`, `progression`, `evaluation`) |
| `service.py` | Executa o caso de uso: orquestra domínio e persistência, decide o que é sucesso e o que é falha. | Não conhece `Request`, `Response` nem código HTTP. | existe (`missions`, `tutoring`, `progression`, `evaluation`) |
| `domain.py` | Concentra as regras, independentes de framework: transições de estado válidas, cálculo de XP, duração real (`missions`); enums e transição da ação (`tutoring`); a curva de nível e o catálogo de conquistas (`progression`, D). | Não importa SQLAlchemy, FastAPI nem nada de I/O. | existe (`missions`, `tutoring`, `progression`) |
| `repository.py` | Trata o banco: consultas e gravações, quando a camada se justificar. | Não decide regra; só busca e persiste. | contrato |
| `models.py` | Mapeamento SQLAlchemy das tabelas. | Não é o contrato da API. | existe (`missions`, `tutoring`, `progression`) |
| `provider.py` / `tool_definitions.py` / `anthropic_provider.py` / `persona.py` / `context.py` / `sse.py` / `dependencies.py` | Peças específicas da tutoria: o `Protocol` do provedor, o único adaptador que importa o SDK, o prompt de sistema, a montagem do turno (a persona sozinha é o `Turno.sistema`, o prefixo cacheado; o contexto vai em `Turno.contexto` como um cabeçalho fixo e uma linha JSON, que o adaptador manda no bloco de `system` NÃO cacheado, depois do bloco da persona; as ações antigas vão como "Ação registrada pelo sistema" + JSON: todo texto livre fica dentro de strings, como na avaliação), o formato SSE e a dependência que resolve "sem chave". | O adaptador é a **única** peça que importa `anthropic`; nenhuma outra camada da tutoria sabe que existe Anthropic. | existe (`tutoring`) |
| `core/` | Configuração, conexão e infraestrutura comum a todos os módulos. | Não é depósito de funções soltas. | existe |

**A dependência é `tutoring → missions`, nunca o contrário.**
`tutoring/service.py` importa `Mission` e `criar_missao` de
`modules/missions/service.py`, e `tutoring/domain.py` reusa
`TransicaoIlegalError` de `modules/missions/domain.py` (mesmo `code`, mesmo
sentido — confirmar ou recusar uma ação segue o desenho de concluir uma
missão). Nada em `modules/missions/` importa nada de `modules/tutoring/`; a
convenção de fronteira 2 (§5, "nada de dependência circular") proíbe o
sentido inverso.

**O módulo `progression` (Incremento D) e a direção das dependências.**
`missions.service` → `progression.service`: `concluir_missao`
(`missions/service.py`) chama `progression.registrar_conclusao` depois do
`try/flush` que grava a `MissionOperation` (decisão P1) e antes do `return`,
com a missão já travada. No sentido contrário, `progression.service` só
**lê** — nunca escreve em — `missions.models` (`Mission`, `User`),
`missions.cycle_service` (`carregar_historico`), `missions.cycle_domain`
(`sequencia_ate`), `missions.domain` (`xp_da_missao`) e o modelo de ação da
tutoria, `tutoring.models.TutorAction` (mais os enums `tutoring.domain.EstadoDaAcao`
e `tutoring.domain.TipoDeAcao`, para comparar `state`/`kind` sem literais
soltos — a spec previa "só o modelo"; a implementação real também usa os
dois enums, registrado como pendência 82 em `docs/HANDOFF.md`).
`progression.service` **não** importa `missions.service` nem nada de
`tutoring` além do que está listado — não há caminho do chat até o saldo
(D15, README §6: "pedir pontos no chat não altera saldo").
`tutoring.service` também chama `progression.ler_progresso` (só leitura,
direto, sem HTTP), e `tutoring.context` recebe o `Progresso` para montar a
linha de progresso do turno da Kairya (D15).

**O módulo `evaluation` (Incremento E) e a direção única das dependências
(E11).** As tabelas da entrega (`mission_evidence`, `mission_evaluations`) são
**dados da missão** e moram em `missions/models.py`; o **processo** de avaliar
mora em `modules/evaluation/` e **escreve por funções de serviço dos outros
módulos**, nunca pelos modelos deles diretamente. As arestas, conferidas nos
`import` do código (`grep` sobre `src/`):

- `evaluation → missions`: `missions.evaluation_records` (`abrir_tentativa`,
  `registrar_resultado`, `registrar_falha`, as funções de escrita da avaliação,
  que **moram em `missions`** para que quem escreve nas tabelas dela seja o
  módulo dono delas), `missions.domain` (`Veredito`, `FalhaDaAvaliacao`),
  `missions.models` (`Mission`, `MissionEvaluation`) e `missions.schemas`
  (`EvaluationSummaryRead`, o teto do feedback);
- `evaluation → progression`: `progression.service` (`registrar_bonus`,
  `recompensa_do_bonus`) e `progression.schemas` (`RewardRead`);
- `evaluation → tutoring`: `tutoring.provider` (o `Protocol`, `Ferramenta`,
  `Turno` e os erros do provedor), `tutoring.service` (`Tutoria`,
  `FOLGA_DO_ORFAO`) e `tutoring.dependencies` (`get_tutoria`);
- **ninguém importa `evaluation` além de `main.py`**, que registra o router e
  o handler de `AvaliacaoFalhouError`. Conferido: `grep -rn
  "modules.evaluation" src` fora do próprio módulo acha só `main.py:34` e
  `main.py:35`, e **nenhum arquivo de `missions/` importa `evaluation`**.

Foi para isso que as tabelas ficaram em `missions`: com elas num módulo que
importa `missions`, o `MissionRead` (que mostra a evidência e a avaliação na
listagem, no ciclo e na trilha) teria de importar esse módulo de volta, e
seria um terceiro par nos dois sentidos (pendência 88). Até esta integração
o E **não** acrescentou par novo ao grafo; os dois que já existiam continuam.

**`evaluation/errors.py`, e por que `core/` não tem módulos.**
`AvaliacaoFalhouError(falha)` é o erro da falha **já gravada** (E13). Nasceu em
`core/errors.py`, mas a assinatura dele usa `FalhaDaAvaliacao`, de
`missions/domain.py`: mantê-lo ali inverteria a direção (`core → modules`), e
só `evaluation` o levanta. Na revisão da Task 5 ele foi para
`modules/evaluation/errors.py` — como `TransicaoIlegalError` mora em
`missions/domain.py`. `SemEvidenciaError` e `AvaliacaoEmAndamentoError` ficaram
em `core/errors.py`, porque `missions` e `evaluation` os levantam. A regra é
verificada por `tests/unit/test_core_sem_modulos.py`, que percorre também
as subpastas de `core/` e examina com `ast` cada `*.py`. A prova cobre imports
estáticos diretos, `from focusquest import modules`, aliases e imports
relativos resolvidos contra o pacote do arquivo. Nos imports `from`, a base
e os candidatos `base.nome` contam: o nome pode ser um submódulo. Os testes
exigem o conjunto exato, incluindo casos mistos e prefixos semelhantes,
para também detectar achados espúrios (pendência 103). A prova não executa
código nem resolve chamadas dinâmicas a `importlib.import_module` ou
`__import__`; esse limite é explícito, não garantia de isolamento em runtime.

**Não há ciclo entre arquivos, mas há dependência nos dois sentidos entre
pacotes.** Nenhum arquivo importa, direta ou indiretamente, um arquivo que o
importa de volta — por isso a carga dos módulos funciona. No nível do
**pacote**, porém, `missions` e `progression` dependem um do outro:
`missions/service.py` chama `registrar_conclusao` (o crédito na mesma
transação, D3), `missions/router.py` chama `recompensa_da_missao` (D10) e
`missions/schemas.py` usa `RewardRead`; no outro sentido,
`progression/service.py` lê os fatos de `missions` (acima) e
`progression/domain.py` usa `cycle_domain.sequencia_ate` — e
`progression/domain.py` importa `Veredito` de `missions.domain` (o
`bonus_da_avaliacao` do E). O mesmo vale para `tutoring` e
`progression` (`tutoring.service` lê o progresso; `progression.service` lê
`TutorAction`). **Registro anterior, corrigido na retomada de 2026-09-28:**
este parágrafo afirmava que `missions` não importava nada de `progression`,
o que era falso desde a Task 3 do D. É uma tensão real com a convenção 2 do
§5, registrada como pendência 88 em `docs/HANDOFF.md`, com o motivo de não
ser desfeita agora. **Atualização do Incremento E:** `USUARIO_UNICO` **não**
está mais em `missions/router.py`. Mora em `core/usuario_unico.py` (decisão
E16, `docs/HANDOFF.md`, pendência 88), com `SessaoDaRequisicao` em
`core/database.py`; os quatro routers importam de `core/`, e o único
`import` de `missions.router` que sobrou é o de `main.py`. Isso desfaz só
a aresta `progression/router.py → missions/router.py`; os dois pares de
pacotes continuam.

Uma precisão sobre a transação, que a tabela resume demais: **quem faz o
`commit` é a rota**, não o serviço nem a dependência de sessão. O motivo
está em `core/database.py` — um commit feito depois do `yield` rodaria com
a resposta já montada, e uma falha ali não teria mais como mudar o status.
A dependência `get_session` abre uma sessão por requisição e a fecha ao
final, revertendo o que ficou pela metade.

A regra que dá sentido à tabela: o modelo **solicita**, o backend **autoriza e
executa** (README §6). Nenhuma camada acima do domínio pode conceder XP,
concluir missão ou confirmar recompensa por conta própria.

### Prova cruzada da confirmação da Kairya × conclusão (pendência 167)

`tests/integration/test_tutoring_conclusao_concorrencia.py` concentra os dois
vencedores possíveis, com conexões reais e dados commitados. A sessão que
espera mantém a missão no identity map; uma conexão observadora verifica
`pg_blocking_pids` antes de liberar a transação vencedora. O módulo verifica
os efeitos persistidos em ação, missão, histórico, operações e XP, e limpa
somente o cenário criado (mensagens antes da missão, efeitos por CASCADE).
Não importa helpers de outro módulo de teste nem acrescenta mecanismo ao
código de produção. A responsabilidade complementa os testes existentes de
`test_tutoring_reagendamento.py` e `test_acompanhamento_concorrencia.py`.

### Reagendamento direto durante espera (parte da pendência 160)

`tests/integration/test_reagendamento_espera_deterministica.py` mantém a
missão pré-carregada e retida na sessão perdedora e observa o PID vencedor em
`pg_blocking_pids`. Só então avança o relógio injetado, que retorna sem esperar,
e libera o primeiro commit. Verifica a recusa de um prazo que venceu sem
escrita perdedora ainda antes do rollback, e dois elos encadeados quando o
prazo continua futuro, com o instante posterior à espera. Lê prazo devolvido,
estado persistido, operações/histórico e ausência de XP. A limpeza apaga somente
a missão criada e seus efeitos por CASCADE; rollback libera a trava antes de
aguardar o executor. O módulo complementa os cenários e sondas antigos de
`test_acompanhamento_concorrencia.py`; não muda serviços nem fecha toda a 160.

### Logging (pendência 13)

Mínimo de propósito, sem dependência nova: `core/log.py` e o `lifespan` de
`main.py`. O que ele faz, e por quê:

- **Nível por `FOCUSQUEST_LOG_LEVEL`**, padrão `INFO`, aceito em qualquer
  caixa (`debug` = `DEBUG`); `DEBUG`, `INFO`, `WARNING`, `ERROR` ou
  `CRITICAL`. Um valor desconhecido derruba a **partida** com
  `ValidationError` (medido sob o uvicorn: `Application startup failed`).
  O campo mora em `ConfiguracaoDeLog`, que lê só ele (`extra="ignore"`) e
  por isso **não exige configuração de banco** — o `/health` continua
  respondendo sem banco. O `Settings` herda o campo, e continua recusando
  chave desconhecida do `.env`.
- **Configurado na partida (`lifespan`), não na importação.** O uvicorn
  aplica a configuração de log dele antes de importar o app; importar
  `focusquest.main` num teste não mexe no logging do processo. A saída do
  `lifespan` desfaz o que a partida fez (o nível do `focusquest` volta ao de
  antes, e sai o handler que ela pôs na raiz — só esse): um
  `with TestClient(app)` na suíte não deixa estado para o teste seguinte.
- **O handler vai na raiz, e só se a raiz não tiver nenhum**
  (`logging.basicConfig`). O uvicorn, na configuração padrão, põe handler
  nos loggers `uvicorn*` com `propagate: false` e nenhum na raiz: as linhas
  dele não passam pelo handler do app, e as do app saem uma vez. Um
  `--log-config` que configure a raiz, ou os handlers de captura do pytest,
  são respeitados: nada é empilhado por cima.
- **O nível vale só para o logger `focusquest`.** A raiz fica em `WARNING`.
  Pedir `DEBUG` não liga o DEBUG do `httpx`/`httpcore` nem do SDK
  `anthropic` (que registram as requisições) nem o INFO do
  `sqlalchemy.engine` (que registra cada SQL) — é por essas torneiras que a
  chave e a URL do banco vazariam. Os `WARNING` de terceiros continuam
  saindo, agora no formato do app, em vez do `lastResort` do Python.
- **Formato:** `%(asctime)s %(levelname)s %(name)s: %(message)s`, texto
  simples no stderr. Log estruturado (JSON) entra quando houver quem o
  consuma.

Medido sob o uvicorn real (`uv run uvicorn focusquest.main:app`), nos níveis
padrão, `DEBUG` e `WARNING`: a linha `INFO focusquest.main: log configurado
no nivel …` aparece uma vez na partida (e some em `WARNING`); o `INFO` de
"missão não encontrada" de um `POST /api/missions/999999/complete` aparece
uma vez; as linhas do uvicorn continuam no formato dele, uma vez cada; a
senha da URL do banco não aparece no stderr nem no stdout — nem no
traceback de um 500 com o banco inexistente. `--reload` e `--workers` não
foram medidos. O `tests/unit/test_log.py` repete as partes automatizáveis
num subprocesso (a configuração padrão do uvicorn aplicada por
`dictConfig`, e a partida em `DEBUG` com chave e senha conhecidas).

### Diretório de trabalho (pendência 29)

Os comandos do backend rodam **da raiz do repositório**, por decisão: o
`Settings` (e o `ConfiguracaoDeLog`) lê o `.env` do diretório **corrente**, e
o `alembic` acha o `alembic.ini` pelo diretório corrente. O caminho do
`.env` não é ancorado no pacote porque a suíte isola os testes do `.env`
real trocando de diretório (`monkeypatch.chdir`), e porque o caminho
derivado de `__file__` só é a raiz do clone na instalação editável. O
`Makefile`, o CI e o `scripts/e2e-env.sh` (que faz `cd` para a raiz) já
rodam dali. De outro diretório, a receita é
`uv run --project <raiz> --env-file <raiz>/.env …` e, no Alembic,
`-c <raiz>/alembic.ini` — o `script_location = %(here)s/alembic` do `.ini`
acha os scripts pelo caminho do arquivo, e
`tests/unit/test_comandos_fora_da_raiz.py` prende isso. Motivo completo e
medição em `docs/HANDOFF.md`, pendência 29.

### O contrato HTTP que existe

> **Fonte de verdade:** `src/focusquest/modules/missions/router.py`,
> `src/focusquest/modules/missions/schemas.py` e `src/focusquest/main.py`.

| Método e caminho | Sucesso | O que faz |
|---|---|---|
| `POST /api/missions` | `201` com a missão criada | Cria uma missão `pendente` para o usuário único. |
| `GET /api/missions` | `200` com a lista | Lista as missões **avulsas** do usuário único (desde o Incremento B; ver "O contrato HTTP do ciclo diário", abaixo), em ordem de prazo (`deadline`, com `id` como desempate). Coleção vazia é `[]` com 200, não 404. |
| `POST /api/missions/{mission_id}/complete` | `200` com a missão | Conclui a missão, de forma idempotente pelo `operation_id` do corpo: o reenvio do mesmo identificador devolve 200 de novo, com o mesmo corpo. |
| `POST /api/missions/{mission_id}/start` | `200` com a missão | **Desde o F.** Inicia a missão (`pendente → em_andamento`, `started_at` = o relógio lido depois da trava), de forma idempotente pelo `operation_id`. Contrato completo em "O contrato HTTP do acompanhamento", abaixo. |
| `POST /api/missions/{mission_id}/reschedule` | `200` com a missão | **Desde o F.** Reagenda o prazo de uma avulsa não concluída, com motivo, gravando o histórico de prazos; idempotente pelo `operation_id`. Contrato completo na mesma seção. |
| `GET /health` | `200 {"status": "ok"}` | Liveness. Não toca no banco. |
| `GET /ready` | `200` ou `503` | Readiness. Executa `SELECT 1`. Três casos: `200` quando o banco responde; `503` com `{"status": "unavailable", "database": "unavailable"}` quando o banco está configurado mas não responde; `503` com `{"status": "unavailable", "database": "not_configured"}` quando **falta a `database_url`** (sem `FOCUSQUEST_DATABASE_URL` no ambiente nem no `.env` do diretório corrente). Qualquer outro erro do `Settings` — um campo inválido como `FOCUSQUEST_TUTOR_MAX_TOKENS=0`, uma chave desconhecida, a `FOCUSQUEST_TEST_DATABASE_URL` ausente — continua respondendo `500`, com o traceback que nomeia o campo: não é "banco não configurado". Até a pendência 28 este terceiro caso era `500`: a rota dependia de `get_engine`, e o `ValidationError` do `Settings` estourava na resolução da dependência; agora ela depende de `get_engine_se_configurada` (`core/database.py`), que devolve `None` só quando os `errors()` do `ValidationError` trazem a `database_url` como `missing`. As rotas de negócio continuam em `get_engine` e respondem `500` sem configuração. |

- **Usuário único, declarado** (decisão A2): as rotas de missão usam a
  constante `USUARIO_UNICO = 1` de `core/usuario_unico.py` (desde o E; até
  o D morava em `missions/router.py`). Não há autenticação, sessão
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
- **Os identificadores gerados pelo cliente têm teto técnico de 200
  caracteres** (`TAMANHO_MAXIMO_DO_IDENTIFICADOR`, em `missions/schemas.py`):
  o `operation_id` de concluir uma missão e de confirmar uma ação da tutoria,
  e o `client_message_id` da pergunta. Vazio ou acima de 200 é `422`. O
  frontend manda `crypto.randomUUID()`, 36 caracteres; as colunas são
  `Text`, e sem o teto qualquer tamanho seria gravado.
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
  `user_id` nem `created_at`. **Desde o E** ganhou mais três, também
  derivados: `verification`, `evidence` e `evaluation` (ver "O contrato HTTP
  da entrega com evidência", abaixo). **Desde o F** ganhou `reschedules`, a
  lista do histórico de prazos (ver "O contrato HTTP do acompanhamento", abaixo),
  e `actual_duration_minutes` passou a sair preenchido quando há `started_at` e
  `completed_at`.
- **Estados**: `pendente`, `em_andamento` e `concluida`, com `concluida`
  terminal (decisão A5). Os valores ficam em português — são dados, não
  chave de payload. **Desde o F**, `POST /api/missions/{id}/start` leva uma
  missão a `em_andamento` (F1) e `started_at` deixa de ser sempre `null`; concluir
  direto de `pendente`, sem iniciar, continua permitido (F4), e nesse caso
  `actual_duration_minutes` continua `null` — "ninguém mediu", não "zero
  minuto". `em_andamento` só vai para `concluida`: não há pausa nem volta a
  `pendente` (F5, pendência 111).
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
| `tutor_messages` | Cada mensagem da conversa contínua (`role` `user`/`tutor`). | `ck_tutor_messages_role` (valor de `role`); `ck_tutor_messages_status` (valor de `status`); `ck_tutor_messages_forma` — um `CASE role WHEN 'user' THEN ... WHEN 'tutor' THEN ... ELSE true END`, não o `OR` que a spec original descrevia (ver "Emendas" da spec) — a forma exigida de cada papel, com a legalidade do próprio `role` delegada só a `ck_tutor_messages_role`; um índice único parcial por `reply_to_id WHERE status = 'completa'` (uma resposta viva por pergunta) e por `user_id WHERE status = 'gerando'` (uma geração por vez); `client_message_id` único entre as mensagens do usuário. `fallback_model` (0007, pendência 174): o modelo substituto que serviu a resposta depois de uma recusa, nulo quando foi o modelo pedido; `ck_tutor_messages_fallback_so_da_tutora` (`fallback_model IS NULL OR role = 'tutor'`). Coluna própria, e não o `error_code`: o fallback não é erro, e a resposta substituída **e** cortada precisa dos dois valores (pendência 170). |
| `tutor_actions` | Uma proposta de ação da Kairya (`create_mission` e, desde o F, `reschedule_mission`) e o seu ciclo de vida. | `ck_tutor_actions_kind`; `ck_tutor_actions_state`; `ck_tutor_actions_missao_so_quando_executada` (`(state = 'executada') = (mission_id IS NOT NULL)`); `ck_tutor_actions_decisao_datada` (`(state = 'proposta') = (decided_at IS NULL)`); `operation_id` único. `mission_id` **sem** `ondelete` (decisão registrada em `docs/HANDOFF.md`: nem `SET NULL` nem `CASCADE` servem, e não existe exclusão de missão no produto). |

**As cinco rotas de `/api/tutoring`:**

| Método e rota | Entrada | Saída |
|---|---|---|
| `GET /status` | — | `{"available": bool}` — `false` sem chave configurada (`get_tutoria()` devolve `None`) |
| `GET /messages` | — | as últimas 50 mensagens, cronológicas, cada resposta da Kairya com as ações embutidas |
| `POST /messages` | `{"client_message_id", "content"}` | `text/event-stream` (formato abaixo) |
| `POST /actions/{action_id}/confirm` | `{"operation_id"}` | `{"action", "mission"}` |
| `POST /actions/{action_id}/reject` | — | `{"action"}` |

**O stream do `POST /messages`**, eventos SSE nesta ordem: `user_message`
(a pergunta já gravada, com o `id` do banco) → `delta` zero ou mais vezes
(`{"text": "…"}`) → um final, só um: `done` (a resposta gravada e as ações
dela, emitido **depois do commit** — `status` `completa`, ou `interrompida`,
com o texto parcial, sem ação e com `error_code` `resposta_longa`, quando um
limite de tamanho cortou a resposta (`stop_reason` `max_tokens` ou
`model_context_window_exceeded`, pendências 45, 120 e 122 do
`docs/HANDOFF.md`) ou `error` (`{"code": "…"}`, emitido
**depois** de a falha estar gravada como `falhou`). A recusa (`stop_reason`
`refusal`) é `error` `resposta_recusada`, com a resposta gravada `falhou`,
**sem** o texto parcial e sem ação. O `error_code` de uma `interrompida` é
`resposta_longa` ou nulo — nulo nas outras (desconexão, órfã), de resultado
desconhecido. O contexto mandado ao modelo (`_historico`, em `service.py`)
leva só mensagens `completa` e deixa fora também a **pergunta** cuja tentativa
mais recente é a recusada (`resposta_recusada`): ela continua gravada e na
tela, e volta ao contexto quando é reenviada. Um stream sem `done` nem
`error` é resultado desconhecido (a desconexão do cliente, provada com
uvicorn real em `tests/integration/test_tutoring_desconexao.py`, M9 do
plano — o `TestClient` bufferiza a resposta inteira e não desconecta).

**Fallback histórico, desativado em produção** (pendência 174, beta da
Anthropic, preservado somente nos testes explícitos do adaptador legado): o adaptador chama
`client.beta.messages.stream` com `fallbacks="default"` e o beta
`server-side-fallback-2026-07-01` (`BETA_DO_FALLBACK`), e a API refaz a
requisição recusada no modelo que a Anthropic recomenda para a categoria da
recusa, dentro do mesmo stream. O adaptador lê quem serviu na entrada
`fallback_message` de `usage.iterations` (`Fim.substituto`), entrega a
proposta só no `message_stop` e descarta a que fechou **antes** do bloco
`fallback`. O parcial de uma recusa no meio **fica**: o substituto o
continua, e a resposta termina `completa` (ou `interrompida` cortada) com
`fallback_model` gravado e a chave `fallback_model` no `MessageRead` (nula
nas outras). A tela mostra uma nota discreta dentro da bolha. O descarte do
parcial vale só quando a parada **final** é `refusal` (cadeia esgotada,
categoria sem substituto, `tool_use` aberto). A avaliação (`avaliar`) não usa
o fallback: continua no endpoint estável.

**Erros antes do stream** (a pergunta não é gravada): `503
provedor_nao_configurado` (sem chave); `409 mensagem_em_andamento` (já há
uma resposta `gerando`); `409 operacao_reutilizada` (`client_message_id`
com outro `content`); `429 limite_diario_da_tutoria` (o teto diário de
turnos acabou; header `Retry-After` com os segundos até a meia-noite de
America/Sao_Paulo; nada é gravado e o modelo não é chamado; vale também para
o reenvio de pergunta interrompida ou falhada); `422` do Pydantic (corpo
inválido).

**Erros dentro do stream** (`event: error`, coluna `error_code`), do enum
`CodigoDoStream` de `tutoring/domain.py` — fora do `CodigoDeErro` de
`main.py` de propósito, porque não passam por handler HTTP:
`provedor_indisponivel`, `tempo_esgotado`, `proposta_invalida`,
`resposta_recusada`. O `resposta_longa` **não** é código do `error`: é a
constante `RESPOSTA_LONGA` de `tutoring/domain.py`, gravada no `error_code` da
`interrompida` cortada, que sai no `done`.

**Confirmar e recusar**, os mesmos `code` e sentido de concluir uma missão
(`missions`, decisão registrada acima): `200` ao confirmar uma `proposta`
(cria a missão e grava `executada` na mesma transação, com `SELECT ... FOR
UPDATE` na ação) ou ao reenviar a mesma confirmação; `409
operacao_reutilizada` com `operation_id` já usado em outra ação; `409
transicao_ilegal` fora dessas transições; `422 prazo_expirado` quando o
prazo proposto já passou — a ação vira `falhou` com esse código **antes**
de a rota levantar o 422 (o commit vem antes do `raise`, ou a gravação
morreria com a transação); `404 acao_nao_encontrada`. **Desde o F** a
confirmação despacha pelo `kind` da ação e há uma segunda ferramenta,
`reschedule_mission` (ver "O contrato HTTP do acompanhamento", abaixo): a
confirmação de um reagendamento pode gravar a ação `falhou` com
`reagendamento_invalido` e responder `409 reagendamento_invalido`.

### Consultas da trilha semanal (pendência 166)

`cycle_service._ler_plano` carrega `evidence`, `evaluation` e `reschedules`
com `selectinload` na consulta das oito missões do plano. A leitura da trilha
atual e sua serialização por `PlanRead` custam seis comandos: plano, missões,
histórico das diárias e três relações. A resposta continua ocultando o
conteúdo dos dias futuros e da especial bloqueada. Os loaders também leem
as relações das missões ocultas, custo fixo limitado a oito pais por plano.
`tests/integration/test_plans_leitura_consultas.py` mede o SQL real com a
sessão sem identidades do preparo e verifica conteúdo na segunda e domingo.
O ciclo usa outro caminho, snapshot de colunas em um comando, e não recebe
loaders ORM: sua consistência continua em `test_cycle_consistency.py`.

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
| `GET /api/cycle` | `200` com `CycleRead` | O ciclo derivado do relógio: a missão de hoje, a sequência, os dias até o próximo marco, `special` e `late_daily`. `special` é a especial do marco mais recente enquanto a janela está aberta (disponível ou já concluída) e, depois do fim da janela, só se foi iniciada dentro dela: em conclusão tardia até o fim do dia seguinte ao fim da janela, disponível ou concluída com atraso (F25); fora disso, `null`. `late_daily` é a diária de ontem iniciada no dia dela: disponível enquanto pode ser concluída (até o fim de hoje) e, depois de concluída com atraso, **continua presente, concluída, até o fim de hoje**; `null` para a de ontem pendente, a concluída no dia ou a inexistente (F25). |

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
lista missões soltas. Isso também é o motivo da pendência nova sobre a Kairya
não ver o ciclo no contexto (`docs/HANDOFF.md`, pendência 55): o contexto da
tutoria é montado com `listar_missoes`. Desde a pendência 117, o
`preparar_turno` também lê o ciclo (`ler_ciclo`), mas só para a conclusão
tardia (a diária de ontem e a especial vencidas que ainda se concluem); o
resto do ciclo continua fora do contexto (pendência 55).

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

A ordem das duas recusas de `criar_plano` **importa**: `semana_distante` é
checada **antes** de `semana_encerrada`, porque a checagem de encerramento
soma `DIAS_DA_SEMANA - 1` ao `week_start` — para uma semana no último ano
representável (`9999-12-27`, a última segunda-feira válida), essa soma
estoura o `datetime` (`OverflowError`) se a recusa por encerramento for
tentada primeiro. A de distância só soma dias à segunda-feira da semana
atual, que nunca estoura, e recusa a semana de 9999 antes de qualquer conta
sobre ela (`cycle_service.py`, `criar_plano`). Testado com
`test_semana_no_ano_9999_e_distante_e_nao_500`; invertida a ordem, o teste
reprova com o `OverflowError` da conta (em produção, um `500` no lugar do
`409`) — medido na onda de correções da revisão do repositório.

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

### O contrato HTTP da progressão que existe (Incremento D)

> **Fonte de verdade:** `src/focusquest/modules/progression/router.py`,
> `src/focusquest/modules/progression/schemas.py`,
> `src/focusquest/modules/missions/schemas.py` (`MissionCompletionRead`) e
> `src/focusquest/modules/missions/router.py`.

| Método e caminho | Sucesso | O que faz |
|---|---|---|
| `GET /api/progress` | `200` com o saldo, o nível e o catálogo | O único endpoint novo do D (decisão D14). Leitura, sem trava; usa `USUARIO_UNICO`, como as rotas de `missions`. |
| `POST /api/missions/{mission_id}/complete` | `200` com a missão, agora com `reward` | Sem mudança de rota: o corpo (`MissionCompletionRead`, que estende `MissionRead`) ganhou o campo `reward` (`RewardRead`), reconstruído do banco **depois** do `commit` (D10), no primeiro envio e no reenvio. |

**`GET /api/progress`** devolve `xp_total`, `level`, `level_floor_xp`,
`next_level_xp` e `achievements` — a lista **sempre** com os sete códigos do
catálogo, na ordem dele, cada um com `code`, `title`, `description` e
`unlocked_at` (instante ISO com `Z`, ou `null` para o que não foi
destravado). Sem nenhuma conclusão: `xp_total` 0, `level` 1,
`level_floor_xp` 0, `next_level_xp` 100, as sete conquistas com
`unlocked_at` nulo. Sem caminho de erro de negócio — só o tratamento
genérico de falha de banco.

**`reward` no corpo da conclusão** (`RewardRead`): `xp_awarded` (o XP desta
missão, congelado, D2), `xp_total` (o saldo do usuário **no momento daquela
conclusão**, não o atual — a semântica do reenvio, D10;
`docs/HANDOFF.md`, pendência 79), `level_before`, `level_after` e
`achievements_unlocked` (as conquistas que **esta** conclusão destravou,
`code`/`title`/`description`, sem `unlocked_at` — o instante já é o
`credited_at` do lançamento). O reenvio da mesma operação devolve
exatamente o mesmo corpo, `reward` incluído — um caminho só constrói os
dois casos (`recompensa_da_missao`), então o corpo do reenvio é idêntico ao
original **por construção**, não por comparação.

O `GET /api/missions`, o `GET /api/cycle` e o `GET /api/plans/current` **não**
mudam — nenhum dos três pode ganhar `reward` ou `achievements`, porque os
tipos que eles devolvem (`MissionRead`, `CycleRead`) são outros, nunca
`MissionCompletionRead`.

### O contrato HTTP da entrega com evidência que existe (Incremento E)

> **Fonte de verdade:** `src/focusquest/modules/missions/router.py`,
> `src/focusquest/modules/missions/schemas.py`,
> `src/focusquest/modules/missions/service.py` (`concluir_missao`) e
> `src/focusquest/modules/missions/domain.py` (`verificacao_da_missao`).

Esta seção descreve **o `POST /api/missions/{id}/complete` estendido**, os
campos novos do `MissionRead` e, ao fim, o **`POST
/api/missions/{id}/evaluation`**.

Não há rota nova de entrega (decisão E1): entregar e concluir são o mesmo
ato, com uma ordem de conclusão, uma idempotência (`operation_id`) e um
crédito.

**O corpo do `POST /api/missions/{mission_id}/complete`** ganhou o campo
opcional `evidence`:

```json
{
  "operation_id": "…",
  "evidence": { "text": "Resolvi os 10 exercícios do capítulo 3.", "link": "https://…" }
}
```

- **`evidence.text`**: obrigatório dentro de `evidence`, **sem espaço nas
  pontas** (o schema apara antes de validar) e de **1 a 4000 pontos de
  código** (`TAMANHO_MAXIMO_DA_EVIDENCIA`). Um texto só de espaços é vazio
  depois de aparado, e vira 422. **O que é "espaço" foi medido:** o
  `strip_whitespace` do pydantic é o `trim()` do Rust do `pydantic-core`
  (Unicode `White_Space`), **não** o `str.strip()` do Python. Removidos: U+0009
  a U+000D, U+0020, U+0085, U+00A0, U+1680, U+2000 a U+200A, U+2028, U+2029,
  U+202F, U+205F e U+3000 (25 pontos de código); **não** removidos: U+001C a
  U+001F e U+FEFF. O teto de 4000 vale **depois** do recorte. O frontend
  replica esse conjunto (`stripEnds`, `features/missions/evidenceLimit.ts`).
- **NUL (`\x00`) no texto ou no link é 422** apontando o campo (`_sem_nul`):
  o PostgreSQL não grava NUL em `TEXT`, e sem a guarda a conclusão saía 500.
- **`evidence.link`**: opcional (`null` ou ausente), aparado, de até **2000
  caracteres** (`TAMANHO_MAXIMO_DO_LINK`), casando `(?i)^https?://\S+$`: só
  `http`/`https` (sem diferenciar maiúsculas, decisão EM2) e sem espaço. **O
  backend nunca abre o link** (E3). O `CHECK` do banco repete a regra (`~*
  '^https?://\S+$'`, `ck_mission_evidence_link`).
- **`evidence` não aceita campo a mais** (`extra="forbid"`): um campo
  desconhecido é 422, e não ignorado em silêncio.
- **Sem `evidence`, a conclusão não muda** em relação ao D (a resposta só ganha os três campos derivados): a missão é concluída como
  `autodeclarada`.

**Os erros que a evidência acrescenta:**

| Situação | Status | `code` | Observação |
|---|---|---|---|
| `evidence` inválida: texto vazio, só de espaços, com NUL ou longo, link sem `http(s)`, longo, com espaço ou com NUL, campo a mais | `422` | — | Formato nativo do FastAPI; o `loc` termina em `text`, `link` ou `extra` (com `body` e `evidence` antes) |
| **Mesmo `operation_id` com outra evidência**: texto ou link diferentes, evidência onde antes não havia, ou sem evidência onde havia | `409` | `operacao_reutilizada` | "Mesmo id, outro conteúdo" — o desenho do `client_message_id` do 1b-1. Conferido **depois** da checagem de que a operação é da mesma missão. O cliente gera um `operation_id` novo e repete |
| Reenvio com a **mesma** evidência | `200` | — | O mesmo corpo do primeiro envio, `reward` incluído, como no D |

A evidência é gravada **na mesma transação** da conclusão: a linha de
`mission_evidence` entra no `flush` da transição, com `submitted_at` igual ao
`completed_at`, antes do crédito do XP. Uma por missão (a PK). **Garantido só
pelo serviço, e declarado:** a evidência só existe para missão `concluida` e só
é gravada na conclusão; o banco não impede uma linha de evidência para missão
pendente.

**O `MissionRead`** (e, portanto, o `MissionCompletionRead`, a listagem, o
ciclo e a trilha) ganhou três campos, **derivados na leitura, nunca gravados**
(decisão E4, o mesmo motivo do `xp`):

| Campo | Valor |
|---|---|
| `verification` | `"autodeclarada"` (concluída sem evidência), `"com_evidencia"` (concluída com evidência) ou `null` (missão ainda não concluída). É `verificacao_da_missao(estado, tem_evidencia)`; **não** vira "avaliada": a avaliação é o campo seguinte |
| `evidence` | `{"text": …, "link": …}` (`link` pode ser `null`) ou `null` |
| `evaluation` | `null` ou `{"state", "verdict", "feedback", "error_code", "model", "finished_at"}`: `state` é `avaliando`, `concluida` ou `falhou`; `verdict` (`atende`, `parcial`, `nao_atende`) e `feedback` só existem em `concluida`; `error_code` (`provedor_indisponivel`, `tempo_esgotado`, `avaliacao_invalida`) só em `falhou`; `model` é o modelo que interpretou (transparência do README §5) |

**O `MissionRead` não traz `bonus_xp`** (emenda EM1). O resumo da avaliação não
publica quanto o bônus valeu: ler `xp_entries` para montar o `MissionRead`
faria `missions` depender dos modelos de `progression` também na leitura, e
recalcular pela regra seria uma segunda fonte da verdade. Depois de recarregar,
o cartão diz "Bônus de XP creditado ao seu saldo" para o veredito `atende`, e o
painel de progresso mostra o saldo.

**A recompensa da conclusão não muda com um bônus gravado depois.**
`recompensa_da_missao` filtra `source = 'mission_completed'` (decisão E14): com
dois lançamentos por missão no livro-razão, sem o filtro o `.one()` quebraria.
O teste que grava o bônus e relê a conclusão prova o filtro; a mutação que o
tira reprova com `MultipleResultsFound`.

**Onde moram os dados** (E11, `docs/HANDOFF.md`): a evidência
e a avaliação são **dados da missão** — as tabelas ficam em
`modules/missions/models.py`, e o `MissionRead` as lê dali, sem importar
nenhum módulo novo.

**`POST /api/missions/{mission_id}/evaluation`** (o pedido da avaliação da
Kairya, decisão E5; `request_reward_evaluation` do README §6). Sem corpo (um `{}`
é aceito e ignorado). Só a pessoa o chama, pela tela, depois da conclusão com
evidência; o modelo nunca. Sem `operation_id`: a chave natural é a missão (E8).
`mission_id` é inteiro de `1` a `2**31 - 1`, como nas outras rotas de missão.

O caminho, em três passos (`evaluation/service.py`, E9):

1. **Sem chave, `503` antes de tocar no banco.** A avaliação já concluída
   continua visível pelo `MissionRead`.
2. **Transação 1** (`missions/evaluation_records.abrir_tentativa`): trava a
   missão (`FOR UPDATE`); lê o relógio **depois** da trava; aplica a ocultação
   (o mesmo 404 de sempre); sem evidência recusa; avaliação `concluida` →
   devolve ela, **sem chamar o modelo**; `avaliando` **não órfã** → recusa; nenhuma,
   `falhou` ou órfã → grava `avaliando` com a tentativa nova (`attempt + 1`,
   e a órfã passa por `falhou`/`tempo_esgotado` antes). Commit. Órfã é a
   `avaliando` pedida **antes** de `agora − (tutor_timeout_seconds +
   FOLGA_DO_ORFAO)`; no corte exato ainda está em andamento. **O corte não é uma
   fronteira segura:** com o SDK repetindo a chamada (`TENTATIVAS = 2`), uma
   tentativa viva pode passar dos 90 s do padrão, e um novo pedido a retoma como
   órfã, com uma segunda chamada paga e sem corromper nada (pendência 106).
3. **Fora de transação**, `tutoria.provedor.avaliar(turno, ferramenta)`; o
   turno é uma mensagem única, sem histórico da conversa. Depois, **transação 2**
   (`registrar_resultado`/`registrar_falha`): trava a missão de novo e confere
   que a tentativa ainda é a corrente (E10). Válida → `concluida` e o bônus na
   **mesma** transação; qualquer falha → `falhou` com o `error_code`. **Commit
   antes de a rota responder**, e só então o erro sobe (E13).

**A saída do modelo só vale se o `EvaluationOutput` a aceitar** (validado antes
de qualquer escrita): `verdict` ∈ `atende`/`parcial`/`nao_atende`, `feedback`
aparado, de 1 a 1500 caracteres e sem NUL, e nenhum campo a mais
(`extra="forbid"`). Saída fora disso, ou nenhuma chamada de
`record_evaluation`, é `avaliacao_invalida`. Um `verdict` `atende` credita o
bônus `xp_da_missao // 2` (E7, `progression.registrar_bonus`), uma vez;
`parcial` e `nao_atende` não creditam nada.

**Resposta `200`** (`EvaluationResultRead`):

```json
{
  "evaluation": {
    "state": "concluida", "verdict": "atende", "feedback": "…",
    "error_code": null, "model": "claude-opus-5", "finished_at": "2026-09-28T20:14:03Z"
  },
  "reward": {
    "xp_awarded": 110, "xp_total": 1450, "level_before": 5, "level_after": 5,
    "achievements_unlocked": []
  }
}
```

`reward` está **sempre** no corpo, e é `null` quando o veredito não credita
bônus. O bônus **não** avalia conquistas (E15): `achievements_unlocked` sai
vazio, e o nível pode subir. O pedido repetido sobre uma avaliação `concluida`
devolve o **mesmo** corpo, `reward` incluído, reconstruído do banco por um
caminho só (`_reconstruir`, o desenho da D10). O `model` é o modelo que
interpretou (transparência do README §5).

**Os erros** (`main.py`; `CodigoDeErro` ganhou `sem_evidencia`,
`avaliacao_em_andamento`, `provedor_indisponivel`, `tempo_esgotado` e
`avaliacao_invalida`):

| Situação | Status | `code` | O que aconteceu antes |
|---|---|---|---|
| Missão inexistente, alheia ou oculta (diária futura) | `404` | `missao_nao_encontrada` | Nada gravado; o **mesmo** corpo do 404 da conclusão |
| Missão sem evidência (inclui a não concluída) | `409` | `sem_evidencia` | Nada gravado |
| Avaliação em andamento, não órfã; ou tentativa **superada** (EM4) | `409` | `avaliacao_em_andamento` | Nada gravado por este pedido |
| Sem chave da Anthropic | `503` | `provedor_nao_configurado` | Nada gravado, o banco nem é tocado |
| O provedor falhou (erro HTTP, stream cortado sem `message_stop`, exceção inesperada) | `502` | `provedor_indisponivel` | `falhou` gravada |
| Passou do tempo (o do SDK, ou o limite total da avaliação) | `504` | `tempo_esgotado` | `falhou` gravada |
| O modelo não chamou `record_evaluation` (ou parou por outro motivo que não `tool_use`, como `max_tokens`) ou mandou saída fora do esquema | `502` | `avaliacao_invalida` | `falhou` gravada |
| `mission_id` fora de `1..2**31 - 1` | `422` | — | Lista de erros do FastAPI |

Os dois códigos que já existiam só no stream da conversa
(`provedor_indisponivel`, `tempo_esgotado`) têm o **mesmo valor** no HTTP; um
teste confere que não divergem, e outro que toda `FalhaDaAvaliacao` tem um
`CodigoDeErro` de mesmo valor. Nas três falhas gravadas, a linha `falhou` só
sai do estado por um novo pedido (`falhou → avaliando`, `attempt + 1`): é o
"Tentar de novo" da tela. **`tool_choice` da avaliação é `auto`, com a
ferramenta `strict` e o sistema mandando chamá-la** (emenda EM3 da spec).
Uma amostra real autorizada, registrada na pendência 91 de
[HANDOFF.md](HANDOFF.md), confirmou a chamada da ferramenta e a aceitação do
esquema `strict`. A referência histórica está em
`tests/integration/referencia_da_avaliacao_real.json`; esta composição não
repete a chamada. A amostra cobre uma entrega que atende ao critério, sem
aprovar os outros vereditos ou o circuito pela tela com bônus real.

**Concorrência e ordem de travas.** Missão → avaliação → usuário, sempre (desde
o F, a ordem global tem a ação da tutoria na frente: ação → missão → avaliação →
usuário, ver "O contrato HTTP do acompanhamento"): a
avaliação só é escrita com a missão travada, e o usuário só é travado pelo
`registrar_bonus`, por último. Dois pedidos simultâneos: um avalia, o outro
recebe `409 avaliacao_em_andamento`, e o livro-razão tem no máximo um
`evaluation_bonus` por missão (`uq_xp_entries_mission_id_source`).

`test_evaluation_concorrencia.py` prova um trecho dessa ordem em conexões
reais: outra transação retém somente a avaliação, `pg_blocking_pids` observa
a transação 2 esperando sua escrita, a missão recusa `FOR KEY SHARE NOWAIT`
e o usuário ainda aceita `FOR SHARE NOWAIT`. A avaliação hoje bloqueia no
`UPDATE`/flush, sem exigir um `SELECT FOR UPDATE` dela. Ao liberar a espera,
o cenário confere avaliação e evidência persistidas, operação única e os
créditos de conclusão e bônus da missão. Antecipar o bônus faz a sonda do
usuário reprovar por `LockNotAvailable`. Esta prova parcial da pendência 104
não cobre a matriz de conflitos cruzados nem a ordem global de todos os fluxos.


### O contrato HTTP do acompanhamento que existe (Incremento F)

> **Fonte de verdade:** `src/focusquest/modules/missions/router.py`,
> `schemas.py` e `service.py`, `alembic/versions/0006_acompanhamento.py`,
> `src/focusquest/modules/tutoring/service.py` e `schemas.py`, e o enum
> `CodigoDeErro` de `src/focusquest/main.py`. A spec é
> `docs/superpowers/specs/2026-09-29-incremento-f-acompanhamento-design.md`
> (decisões F1–F25); o texto abaixo só descreve o que o código faz.

**Iniciar — `POST /api/missions/{mission_id}/start`** (F1 a F5). Corpo
`{"operation_id": "<1 a 200 caracteres>"}`; resposta `200` com o `MissionRead`,
`state: "em_andamento"` e `started_at` preenchido. Só `pendente →
em_andamento`. Vale para os três tipos, pela disponibilidade derivada (F3). A
ordem é a da conclusão: trava (`SELECT ... FOR UPDATE`) → relógio (lido
**depois** da trava) → ocultação (`ler_missao`) → reenvio → regra do dia →
transição. A chave fica em `mission_operations` com `kind = 'start'`, na mesma
`UNIQUE` da conclusão: reenvio com a mesma chave devolve o mesmo `200`; chave
nova numa missão já iniciada ou concluída é `409 transicao_ilegal`; a chave de
outra missão ou de outra operação é `409 operacao_reutilizada`.

**Reagendar — `POST /api/missions/{mission_id}/reschedule`** (F6 a F13). Corpo
`{"operation_id", "new_deadline", "reason"}`, com `extra="forbid"` (um campo a
mais é `422`); `new_deadline` exige fuso (`AwareDatetime`) e `reason` é um de
`dificuldade`, `falta_de_tempo`, `mudanca_de_prioridade` (obrigatório e fechado,
F10). Resposta `200` com o `MissionRead` já com o prazo novo e `reschedules`. Só
a **avulsa** se reagenda (F7); vale em `pendente` e `em_andamento` e **não muda
o estado nem o `started_at`** (F8). O novo prazo tem de ser estritamente futuro
pelo relógio lido depois da trava e diferente do atual; antecipar é permitido e
não há teto de horizonte (F9). O serviço normaliza o instante para UTC na
entrada (o reenvio, lido do banco, tem de sair igual ao primeiro corpo). Reenvio
com a mesma chave e o mesmo `(new_deadline, reason)` é o mesmo `200`; a mesma
chave com outro conteúdo é `409 operacao_reutilizada` (F13). **Todas as
recusas vêm antes da primeira escrita** — é o contrato que a confirmação da
Kairya usa.

| Situação | Rota | Resposta |
|---|---|---|
| Missão inexistente, alheia ou oculta (diária futura, especial bloqueada) | start, reschedule | `404 missao_nao_encontrada` |
| Iniciar missão já `em_andamento` ou `concluida` (chave nova) | start | `409 transicao_ilegal` |
| Iniciar diária perdida ou fora do plano, ou especial expirada | start | `409 missao_expirada` |
| Reagendar missão `concluida` | reschedule | `409 transicao_ilegal` |
| Reagendar diária ou especial (o prazo delas vem do ciclo) | reschedule | `409 prazo_derivado` (**novo**) |
| Novo prazo igual ao atual | reschedule | `409 prazo_inalterado` (**novo**) |
| Novo prazo no passado ou agora | reschedule | `422 prazo_expirado` (o mesmo `code` da proposta cujo prazo passou) |
| Chave gasta em outra missão ou operação, ou a mesma chave com outro conteúdo | start, reschedule | `409 operacao_reutilizada` |
| Corpo inválido (sem fuso, motivo fora do enum, campo a mais, chave vazia) | start, reschedule | `422` do Pydantic |
| Confirmar um reagendamento cuja missão mudou | `POST /api/tutoring/actions/{id}/confirm` | ação gravada `falhou`, `409 reagendamento_invalido` (**novo**) |
| Confirmar um reagendamento cujo prazo proposto já passou | `POST /api/tutoring/actions/{id}/confirm` | ação gravada `falhou`, `422 prazo_expirado` |

Os três `code` novos entram no `CodigoDeErro` de `main.py`
(`prazo_derivado`, `prazo_inalterado`, `reagendamento_invalido`), com um erro de
domínio cada em `core/errors.py`; `PrazoExpiradoError` é reaproveitado. O
frontend espelha os `code` à mão (pendência 32).

**`MissionRead.reschedules`.** Em toda leitura (listagem, ciclo, trilha,
conclusão, confirmação), a lista do histórico em ordem de gravação: cada item
tem `previous_deadline`, `new_deadline`, `reason`, `origin` (`usuario` ou
`kairya`) e `rescheduled_at`. Lista vazia se nunca houve reagendamento (e sempre
vazia em diária e especial). O prazo **corrente** continua em
`missions.deadline`; a listagem carrega o histórico com um `selectinload`, e o
teste de contagem de consultas (`test_missions_listagem_consultas.py`) o prende.

**O modelo de dados (migração `0006_acompanhamento.py`).** A tabela
`mission_reschedules` é **só de inserção** (o serviço não faz `UPDATE` nem
`DELETE`): `mission_id` (FK `ON DELETE CASCADE`, índice
`ix_mission_reschedules_mission_id`), `operation_id` (FK para
`mission_operations.operation_id`, `UNIQUE` em `uq_mission_reschedules_operation_id`),
`previous_deadline`, `new_deadline`, `reason`, `origin` e `rescheduled_at`, todas
`NOT NULL`. Restrições nomeadas: `ck_mission_reschedules_prazo_mudou`
(`new_deadline <> previous_deadline`), `ck_mission_reschedules_reason` e
`ck_mission_reschedules_origin`. A `0006` também cria
`ck_mission_operations_kind` (`kind IN ('complete', 'start', 'reschedule')` — é o
valor de `mission_operations.kind`, que antes não tinha `CHECK`),
`ck_missions_em_andamento_iniciada` e `ck_missions_inicio_antes_da_conclusao`, e
estende `ck_tutor_actions_kind` com `'reschedule_mission'`. **Só o serviço
garante** (o banco não expressa): o reagendamento existe só para avulsa não
concluída; `previous_deadline` é o prazo corrente no instante da gravação;
`new_deadline > rescheduled_at`. O `downgrade` **falha alto** se houver linha em
`mission_reschedules` ou ação `reschedule_mission`; as operações `start` e
`reschedule` que ficarem em `mission_operations` são inofensivas no esquema
`0005`. **Ordem de implantação:** parar a API, migrar, subir a API de novo.

**A ferramenta `reschedule_mission` e a ação (tutoria).** O modelo recebe **duas**
ferramentas de proposta, `create_mission` e `reschedule_mission`, ainda com uma
chamada por resposta (`disable_parallel_tool_use`) e sem `strict` (F18). O
provedor emite `Proposta(nome, entrada)`, e o serviço valida a entrada **pelo
nome**: `MissionCreate` para `create_mission`, `RescheduleProposal`
(`mission_id`, `new_deadline`, `reason`; `extra="forbid"`, `mission_id` estrito
e `new_deadline` só em texto ISO 8601 com fuso) para `reschedule_mission`, e um
nome desconhecido é `proposta_invalida`. Uma proposta de reagendamento vira uma
`tutor_actions` de `kind = 'reschedule_mission'`, `state = 'proposta'`; **nada
muda** até a confirmação (F15). Na hora de gravar a resposta, o backend confere a
pré-condição (`missao_reagendavel`: a missão existe, é do usuário, é avulsa e
não está concluída); se falhar, a resposta é gravada `falhou` com
`proposta_invalida`, como a proposta fora do esquema. O `payload` guarda a entrada
do modelo **mais um retrato escrito pelo backend** (`instructions` e
`previous_deadline`), que o cartão mostra sem importar `missions` (F16); o
`mission_id` **da ação** continua nulo até `executada`
(`ck_tutor_actions_missao_so_quando_executada`). O contexto da conversa traz, por
pendente, o estado, o início e "reagendada N vez(es); último motivo", e as ações
antigas entram como texto por tipo (F19).

**A confirmação de um reagendamento** executa pelo **mesmo** `reagendar_missao`,
com `origin = 'kairya'` e o `operation_id` da confirmação, e revalida tudo (F17):
prazo passado → ação `falhou`/`prazo_expirado` e `422`; missão que mudou (não
existe mais, concluída, prazo já igual, tipo derivado) → ação
`falhou`/`reagendamento_invalido` e `409`; chave reutilizada →
`409 operacao_reutilizada`, sem gravar. A rota commita e **só então** levanta o
erro. A chave que a tela gastou num reagendamento idêntico não serve à
confirmação da Kairya (`_exigir_elo_da_kairya`): ela é `operacao_reutilizada`.
O `ConfirmRead` devolve `mission` = a missão reagendada.

**Preservação do XP na 0005 (T-M4).**
`test_evaluation_migration.py` acrescenta um roundtrip populado SQL em 0004↔0005:
compara todas as colunas das entradas, IDs/FKs brutos das conquistas, vínculos
lógicos e somatórios por dois usuários próprios. Conteúdo e vínculos são
conferidos antes do oráculo de identidade; uma renumeração que mantém valores e
FKs reprova no ID. Finally restaura head e limpa somente os usuários próprios por
CASCADE. Complementa os testes da 0004 que já atravessam a 0005 e medem valores,
fonte, datas e conquistas; não mede sequences, índices ou todo o schema, nem muda
migração/produção permanentemente.

**Ordem das travas (F14).** **Ação → missão → avaliação → usuário**, sempre.
Iniciar e reagendar travam a missão **antes** de ler relógio, estado e prazo;
`buscar_para_escrever(travar=True)` relê a linha com `populate_existing`, para a
decisão não sair de um objeto velho da sessão. A confirmação trava a ação e, por
dentro do `reagendar_missao`, a missão; nenhum caminho trava na ordem inversa.
Dois reagendamentos simultâneos, com chaves diferentes, viram **dois elos
encadeados** (o `previous_deadline` do segundo é o `new_deadline` do primeiro),
nunca uma atualização perdida. Provado por conexões reais em
`test_acompanhamento_concorrencia.py` e `test_tutoring_reagendamento.py`. A
ordem "ação antes da missão", declarada no docstring de `confirmar_acao`, é
observada em `test_ordem_global_das_travas.py` (pendência 104): com a missão
retida pela escrita da avaliação, a confirmação espera nela já segurando a
ação, e uma sonda `NOWAIT` confirma a ação travada; o mesmo módulo prova
missão e avaliação antes do usuário, sem depender do escalonador. Os testes de
detecção de corrida de `test_acompanhamento_concorrencia.py` e
`test_tutoring_reagendamento.py` dependem dele (pendência 160). A confirmação
da Kairya × conclusão (pendência 167) tem prova das duas ordens em
`test_tutoring_conclusao_concorrencia.py`.

**Início diário na virada civil (160 parcial).**
`test_inicio_virada_dia_concorrencia.py` retém a pré-carga, observa os PIDs exatos
em `pg_blocking_pids` e muda um relógio não bloqueante somente após comprovar a
espera. O dono apenas segura a linha. À meia-noite de São Paulo, a diária pendente
de ontem é recusada sem operação, alteração da missão ou XP, também conferidos
antes do rollback; a diária de hoje é revelada e iniciada com `started_at` exato,
retornado e persistido, e uma operação `start`. O `finally` libera a trava antes
do shutdown do executor; limpeza remove somente o plano próprio e seus efeitos.
A mutação de relógio anterior à trava reprova ambos, com restauração byte a byte.
Este módulo não prova refresh de estado alterado, HTTP ou todas as corridas; as
sondas existentes e os outros limites da 160 permanecem.

**A missão iniciada dentro do prazo pode ser concluída depois dele (F25).** Só
para `em_andamento` com `started_at` antes do prazo, até o fim do dia seguinte ao
prazo; a pendente depois do prazo continua `409 missao_expirada`. O contrato do
ciclo (`late_daily`) está em "O contrato HTTP do ciclo diário", acima.

### Frontend — parte descrição, parte contrato

- **`src/app/`** *(existe, desde o Incremento C)* — inicialização e
  navegação. `src/main.tsx` continua montando `App` em `#root` dentro de
  `StrictMode`. `App.tsx` é, desde o C, o **roteador de duas áreas** (C15,
  decisão K1, §5 regra 6): um `useState<Area>` local, sem biblioteca de
  rotas e sem mudar a URL (a URL entra quando houver uma terceira área).
  `app/areas.ts` declara `type Area = 'headquarters' | 'campaigns'` e
  `AREAS` (os rótulos "Quartel-General"/"Campanhas"); `app/SideNav.tsx` é a
  barra — `<nav aria-label="Áreas">` com um `<button>` por área (sem `<a>`:
  sem URL não há `href` real, e `<a>` sem `href` não recebe foco), o ativo
  marcado por `aria-current="page"` **e** por um marcador visível `▸`
  (`aria-hidden`, decisão K4 — aviso além da cor, README §7). No celular
  (< `lg`) é uma barra no topo, no fluxo da página; no desktop, coluna
  `sticky` — a mesma marcação nas duas larguras, só CSS (decisão K6). Depois
  de navegar, o foco vai ao `h1` da área aberta (`tabIndex={-1}`, decisão
  K5) — os `id` moram em `src/pages/headings.ts`, não em `app/`, porque são
  das páginas.
- **`src/pages/`** *(existe)* — **composição**: uma página junta features e
  componentes reutilizáveis e decide o layout da tela. Não contém regra.
  Hoje há duas: `Headquarters.tsx`, o Quartel-General, e `Campaigns.tsx`,
  Campanhas (nasceu no C). O Quartel-General fica **montado e oculto**
  (`hidden` na raiz e no `<main>`, HTML só tolera um `main` sem `hidden`)
  enquanto Campanhas está aberta — desmontá-lo abortaria um stream da Kairya
  em curso (decisão K2); Campanhas, ao contrário, desmonta ao sair, e cada
  abertura busca a trilha de novo. `Campaigns.tsx` tem o `<main>`, o `h1`
  "Campanhas — planos de estudo" e compõe `<CampaignTrail />` — o
  componente começa no `h2` e não tem `<main>` próprio. A única prop,
  `onOpenHeadquarters`, é opcional e só atravessa a página até a trilha
  (decisão K11, "Campanhas sem props", relaxada pela Ruling R5; ver
  `CampaignTrail.tsx`, abaixo).
- **`src/features/<feature>/`** *(existe para `missions`, `tutoring` e,
  desde o C, `campaigns`; contrato para `rewards`)* — a feature é a unidade
  real de organização:
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
  botão fica desabilitado em "Aguardando o pedido em andamento…" (o texto diz
  "pedido" porque, desde o F, um Iniciar ou um Reagendar em voo também contam)
  e o quadro recarrega uma vez, sozinho, quando o último termina. Tudo é estado local do
  React; nada disso sai da feature.

  **Desde o Incremento F** o cartão também **inicia** e **reagenda** (Tasks 8
  e 10): `useStartMission.ts` e `useRescheduleMission.ts` mandam `POST /start`
  e `POST /reschedule` por `postJson`, com uma chave de operação **por missão e
  por tipo** no mesmo registro (`actionKeyFor`/`releaseActionKey`; a chave do
  Concluir gasta num Iniciar faria o Concluir falhar com `operacao_reutilizada`),
  e `startFailure.ts` e `rescheduleFailure.ts` traduzem cada `code` em mensagem
  e saída, no padrão de `completionFailure.ts`. O disclosure "Reagendar prazo"
  (`RescheduleForm.tsx`, só na avulsa não concluída) usa a hora civil de
  Brasília: `saoPauloCivilToIso` e `isoToSaoPauloCivil`, em
  `shared/lib/deadline.ts`, convertem com o `Intl`, sem deslocamento fixo (F21).
  O formulário guarda o ISO original em `RescheduleDraft.originalDeadline`
  (campo interno opcional). `deadlineForDraft`, em `rescheduleDraft.ts`, envia
  esse literal quando o civil em minutos não mudou, preservando segundos,
  fração e offset; hora editada usa o conversor existente. `sameDraft` compara
  civil, motivo e prazo efetivo para decidir a reutilização da chave de retry
  (163(d)). O POST continua com somente `operation_id`, `new_deadline` e
  `reason`. Não há editor de segundos nem política nova de horário repetido:
  original intacto mantém seu instante; edição conserva a escolha do conversor.
  O rascunho do reagendamento mora no formulário do cartão e **não** sobrevive
  à recarga do quadro (pendência 112). O cartão mostra "Iniciada em…", o "Reagendada N vezes"
  e o `<details>` "Histórico de prazos" (`RescheduleHistory.tsx`), e fica num
  envio de cada vez: Iniciar, Reagendar e Concluir se desabilitam entre si
  enquanto um deles está em voo.

  **Iniciar após remontagem (163(e)):** o leitor interno
  `CompletionRegistry.hasActionKey(missionId, action)` consulta somente a
  existência do slot; não cria UUID nem modifica o registro no render.
  `MissionCard` consulta `start` e passa um boolean privado ao controle:
  “Iniciando…” tem prioridade em voo; falha local ou chave retida mostra
  “Tentar de novo”; sem ambos, “Iniciar”. Mensagens antigas não sobrevivem à
  remontagem. Geração, envio, liberação e reconciliação continuam nos mesmos
  lugares; uma chave de Reagendar não afeta esse nome.

  **Desde o Incremento B** (Tasks 7–8, commits `242d677` e `08b3dcc`),
  `missions` ganhou o ciclo diário: `useCycle.ts` busca
  `GET /api/cycle` e expõe um `refresh` que **não** passa por "carregando"
  (decisão P9 — recarregar assim desmontaria o cartão e apagaria o anúncio
  "Missão concluída."); `civilDate.ts` (nasceu aqui, em `features/missions/`;
  **desde o C mora em `src/shared/lib/civilDate.ts`**, ver `src/shared/lib/`
  abaixo) formata a data civil `"YYYY-MM-DD"` que a API devolve **sem**
  conversão de fuso — `new Date(civil)` sozinho
  levaria a tela num fuso a oeste de UTC a mostrar o dia anterior (Risco 3
  do plano); `CycleSection.tsx` desenha a "Missão de hoje", a sequência
  ("Sequência: N dia(s) seguido(s)") e o progresso até o marco ("N de 7"),
  ou o cartão da especial vigente no lugar dele. `MissionCard.tsx` foi
  extraído de `MissionList.tsx` para ser reaproveitado pelo cartão da
  missão de hoje, com o `onCompleted` opcional de `useCompleteMission.ts`
  acionando o `refresh` do ciclo depois de concluir; cada cartão do ciclo
  leva `key={mission.id}` (sem ela, um `refresh` que troca de missão
  reaproveitaria a instância presa no estado "concluída" da anterior). O
  quadro de avulsas (`MissionList.tsx`) passou a se chamar "Outras missões
  — tarefas com prazo" (decisão P8), e `Headquarters.tsx` compõe
  `<CycleSection />` **acima** dele.

  **Conserto final da revisão da branch** (commit `71a2001`):
  `MissionCard.tsx` ganhou duas props opcionais, com padrão igual ao
  comportamento anterior (nenhum outro consumidor precisou mudar).
  `titleLevel?: 3 | 4` (padrão `3`) escolhe a tag do título do cartão
  (`<h3>`/`<h4>`) — `CycleSection.tsx` passa `4` só no cartão de **dentro**
  da especial, porque a seção da especial já usa `<h3>` para o próprio
  título, e um `<h3>` aninhado quebraria a hierarquia de cabeçalhos.
  `reloadLabel?: string` (padrão `"Atualizar o quadro"`, repassado a
  `CompletionControls`) troca o rótulo do botão de recuperação — os
  cartões do ciclo usam `"Atualizar a missão de hoje"` (a diária de hoje),
  `"Atualizar a diária de ontem"` e `"Atualizar a missão especial"`, cada um
  com o rótulo do próprio cartão. O parágrafo da
  sequência (`data-testid="cycle-streak"`) ganhou `role="status"`: é uma
  região viva **desde o primeiro render** (o mesmo padrão do painel da
  Kairya, acima), para que uma mudança de sequência ao concluir uma missão
  seja anunciada por leitor de tela.

  **Nome acessível da recarga por missão (163(b)):** `CompletionControls`,
  o `RefreshNotice` privado de Iniciar/Reagendar e `EvidenceAndEvaluation`
  acrescentam "a missão: <instructions>" em `span.sr-only`, após o rótulo
  visível contextual. `RefreshNotice` recebe somente `instructions: string`
  dos dois consumidores, usando a missão atual do cartão. O sufixo permanece
  no estado de espera; disabled, callbacks e regiões vivas não mudam.
  `CampaignTrail` recarrega o plano inteiro e não usa `MissionCard`; seu
  botão global não recebe identificação de uma missão.

  **Foco após reagendar sem deslocar a leitura (163(c)):**
  `RescheduleForm` mantém a guarda de sucesso com foco no body e devolve-o ao
  disclosure com `focus({ preventScroll: true })`. O efeito não toma foco de
  outro controle. O teste Chromium `reschedule-focus-scroll.spec.ts` segura o
  POST, estabelece scroll real com o disclosure fora da viewport e verifica
  payload, estado, prazo, histórico e foco antes da posição. Um controle de
  sucesso com foco já na Kairya comprova que não há transferência de foco nem
  perda do rascunho enquanto o prazo/histórico mudam. O erro 422 mantém
  rascunho, alerta, prazo e foco da Kairya; Routes pendentes são abortadas no
  finally. HTTPs são fixtures de apresentação, sem prova de persistência;
  geometria controlada separa scroll por foco de scroll anchoring/colapso.
  Iniciar, Concluir e recuperação do ciclo não mudam. A prova não generaliza
  viewports ou leitor de tela real; jsdom não mede rolagem.

  Em **`tutoring`** (nasceu no 1b-2), o painel da Kairya: `TutorPanel.tsx`
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
  cartões). **Desde o F** a ação é uma união discriminada por `kind`
  (`CreateMissionAction | RescheduleMissionAction`) e o `ProposalCard` escolhe o
  cartão por ele: o da criação (`MissionProposalCard`) ou o
  `RescheduleProposalCard.tsx`, que mostra o prazo atual e o proposto do
  retrato gravado pelo backend; os dois compartilham `DecisionControls.tsx`
  (Confirmar, Recusar e o link para o quadro). Um `kind` fora do tipo — uma API
  mais nova que a tela — cai num texto neutro, sem botão, e o resto da conversa
  continua (pendência 161). A confirmação chama o backend direto por `useDecideAction.ts`
  (`postJson`, reusando `CodigoDeErro`), sem passar pelo hook da conversa
  (decisão D2 da spec). A recarga do quadro de missões é pedida pela
  **página** (`Headquarters.tsx`), por um `ref`
  (`MissionListHandle` + `useImperativeHandle` em `MissionList.tsx`) — um
  evento, não uma prop observada por efeito, que o lint
  `react-hooks/set-state-in-effect` reprovaria.

  Em **`campaigns`** (nasceu no C), a trilha da semana: `useCurrentPlan.ts`
  busca `GET /api/plans/current` e expõe `{ state, reload, refresh }` — o
  mesmo desenho do `useCycle` (P9), com `refreshFailed` no estado `loaded` e
  um estado próprio `no-plan` (`{"plan": null}` não é erro). Nos dois hooks,
  um `refresh` que falha com a tela ainda em "carregando" leva ao estado de
  **erro**, com o "Tentar novamente" — ele invalidou a carga inicial, e nada
  mais tiraria a tela de "carregando" (achado I1 da revisão final do C,
  Ruling R12).
  `CampaignTrail.tsx` desenha os 7 dias (`<ol>`, `data-testid="trail-day"`)
  e a especial: um dia/especial `bloqueada` chega com `mission: null` e vira
  baú fechado, sem instrução, dificuldade nem XP (C11 — o que não foi
  revelado não existe para a tela); o marcador "Hoje" é o **último dia não
  `bloqueada`** (decisão K9, sem segunda requisição); a disponibilidade
  sempre em texto **e** ícone (`availability.ts`, `AVAILABILITY_DISPLAY`,
  exaustivo sobre `Availability`, ícones SVG inline com `aria-hidden` —
  decisão K8 relaxa a restrição de "só glifo Unicode" do plano, Ruling R8).
  A trilha **só mostra**: nenhum botão Concluir — o dia de hoje disponível
  aponta para o Quartel-General (decisão K8); com a prop opcional
  `onOpenHeadquarters`, isso vira um botão (`trail-go-headquarters`,
  Ruling R5), sem ela um texto. Quando `refreshFailed`, o
  `data-testid="trail-stale"` avisa, com "Atualizar" chamando `reload`.
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
  da missão e pelo cartão da proposta da Kairya. **Ganhou `civilDate.ts` no
  C** (`git mv` de `features/missions/`, decisão K10, Ruling R3):
  `formatCivilDate` (já existia) e `civilWeekday` (novo — "quinta-feira" a
  partir de `"2026-09-24"`, sem conversão de fuso). Duas mutações mortas:
  `new Date(civil)` cru (a meia-noite UTC), que só um fuso a **oeste** de UTC
  pega (`TZ=America/Sao_Paulo`, Ruling R7); e tirar o `timeZone: 'UTC'` do
  formatador, que qualquer fuso **a partir de +12h** pega — o meio-dia UTC de
  `civilNoon` já é o dia seguinte em `Pacific/Auckland`, `Pacific/Fiji`,
  `Pacific/Tongatapu` e `Pacific/Kiritimati` (UTC+12 a +14), o caso
  que os testes usam (achado m1 da revisão final do C; a afirmação anterior,
  de que nenhum fuso IANA cruzava a virada a partir do meio-dia, estava
  errada). Dois
  usuários reais: `missions` (o cartão de hoje) e `campaigns` (os 7 dias da
  trilha).
- **`src/shared/hooks/`** *(existe, desde o C)* — hooks genéricos com mais
  de um usuário entre features (§5 regra 3). Nasceu com
  `useRefreshOnReturn.ts` (Task 5, decisão K7): ouve `visibilitychange` (só
  quando `document.visibilityState === 'visible'`) e `focus` da janela, e
  chama o `refresh` mais recente (guardado numa `ref`, não como dependência
  do efeito) — fecha a pendência 57 do B (a virada do dia com a aba aberta).
  Dois usuários: `useCycle` e `useCurrentPlan`. **Custo declarado (K7):**
  trocar de área **dentro** do app depois da meia-noite não dispara nenhum
  dos dois eventos — o Quartel-General oculto continua no dia anterior até
  a aba sair e voltar, ou até recarregar (pendência, `docs/HANDOFF.md`).
- **`src/shared/types/`** *(existe, desde o C)* — tipos compartilhados por
  mais de uma feature (§5 regra 3). Nasceu com `mission.ts` (decisão K10,
  Ruling R3): `Mission`, `MissionState`, `MissionType`, `Availability`,
  `MISSION_STATE_LABELS`, `DAYS_PER_MILESTONE` e `MAX_DIFFICULTY`, movidos
  de `features/missions/types.ts` **sem reexport** — "um lugar só para o
  contrato". `features/missions/types.ts` ficou só com `Cycle` (que importa
  `Mission` de `shared/`) e `MissionErrorCode`.
- **`src/shared/ui/`** *(existe, desde a F4 4.1)* — o design system. Por ora
  só `tokens/` (`contrast.ts`, `contrastPairs.ts`) e o `tokens.test.ts`, que
  mede o contraste WCAG de cada par de cor sobre o CSS real; os componentes
  chegam nas tarefas seguintes da Fase 4.
- **`src/styles/`** *(existe, desde a F4 4.1)* — `tokens.css` é a fonte
  única dos tokens (primitivos em `:root`, semânticos e de componente no
  `@theme` do Tailwind). O `src/index.css` importa o Tailwind e o
  `tokens.css` e mantém as regras `.rpg-*` legadas até a Tarefa 4.9.
- **`src/assets/`** *(contrato)* — imagens e SVGs importados pelo código, em
  oposição a `public/`, servido sem passar pelo bundler. A pasta não existe
  hoje: os arquivos do scaffold foram removidos por órfãos (§1).
- **`src/test/`** *(existe)* — infraestrutura de teste: `setup.ts` (o modo
  de teste do React), `sse.ts` (quadros SSE falsos), `fetchRoutes.ts`
  (`routeFetch`, um `fetch` falso roteado) e `viewport.ts` (`stubViewport`,
  `matchMedia` falso, desde o 1b-2) e `readSource.ts` (`readSource` e
  `listSources`, leitura real de arquivos-fonte com `node:fs`, desde a F4
  4.1). Está **fora** do denominador da
  cobertura de propósito; ver `docs/QUALITY.md` §3.
- **`tests/e2e/`** *(existe)* — os cenários do Playwright, fora de `src/` e
  fora da coleta do Vitest. Desde o 1b-2, `servers.ts` também nomeia a porta
  do servidor falso (8150), e `falso.ts` é o cliente do controle HTTP dele.
  **Desde a Frente 0**, `servers.ts` é a fonte única das três portas (o
  `playwright.config.ts` deriva todas dele) e as desloca por
  `FOCUSQUEST_E2E_PORT_OFFSET`; a validação da variável tem teste Vitest em
  `tests/unit/servers.test.ts`, fora de `tests/e2e/` para o Playwright não o
  coletar como cenário.
  **Desde o C** (Task 6), `cycle.spec.ts` ganhou três cenários em série
  depois dos dois do B (o plano é único por semana, semeado uma vez no
  `beforeAll`): abrir Campanhas pela navegação com a trilha do plano
  semeado e o axe sem violações nas duas áreas; abrir Campanhas pelo
  teclado (Tab, Tab, Enter, foco no título); e um `describe('celular')` a
  390×844 (navegação visível, sem rolagem horizontal, sem sobreposição
  entre "Falar com a Kairya" e os botões da navegação).

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
| Componente específico de uma feature (cartão de missão, painel da Kairya, trilha da semana, painel de progresso) | `frontend/src/features/<feature>/<Componente>.tsx` | existe (`missions`, `tutoring`, `campaigns` desde o C; `progression` desde o D) |
| Chamada HTTP | `frontend/src/shared/api/` — **sempre**. Componente nenhum chama `fetch` direto. | existe |
| Tipo compartilhado por mais de uma feature | `frontend/src/shared/types/` | existe (`mission.ts`, desde o C; `reward.ts`, desde o D — o contrato do `reward` da conclusão, consumido por `missions`) |
| Tipo usado só por uma feature | junto da feature, em `frontend/src/features/<feature>/` | existe (`missions/types.ts`, `tutoring/types.ts`, `campaigns/types.ts`) |
| Hook genérico | `frontend/src/shared/hooks/` | existe (`useRefreshOnReturn.ts`, desde o C) |
| Hook que só faz sentido dentro de uma feature | `frontend/src/features/<feature>/` | existe (`missions/useMissions.ts`, `tutoring/useTutorConversation.ts`, `campaigns/useCurrentPlan.ts`) |
| Função pura usada por mais de uma feature | `frontend/src/shared/lib/` | existe (`deadline.ts` desde o 1b-2; `civilDate.ts` desde o C) |
| Página nova da navegação lateral (uma área) | `frontend/src/pages/`, com o `id` do `h1` em `frontend/src/pages/headings.ts` e a entrada em `frontend/src/app/areas.ts` | existe (`Headquarters`, `Campaigns`, desde o C) |
| Token visual (cor, espaçamento, tipografia, foco, movimento) | `frontend/src/styles/tokens.css` | existe (desde a F4 4.1) |
| Estilo global | `frontend/src/index.css` (importa `styles/tokens.css`; regras `.rpg-*` legadas até a F4 4.9) | existe |
| Teste de componente | **ao lado do arquivo testado**, com o mesmo nome e sufixo `.test.tsx` (`App.tsx` → `App.test.tsx`) | existe |
| Página (composição de features) | `frontend/src/pages/` | existe |
| Teste ponta a ponta | `frontend/tests/e2e/` | existe |
| Imagem ou SVG importado pelo código | `frontend/src/assets/` | contrato (a pasta nasce com o primeiro arquivo) |
| Arquivo servido cru, sem bundler (favicon) | `frontend/public/` | existe |

### Backend

| Vou criar… | Vai em | Estado |
|---|---|---|
| Rota HTTP | `src/focusquest/modules/<módulo>/router.py`, registrada em `src/focusquest/main.py` com `include_router` | existe (`missions`, `progression`) |
| Tradução de erro de domínio em status HTTP | `src/focusquest/main.py`, com `exception_handler` — em um lugar só, não por rota | existe |
| Código de erro (`code`) do contrato HTTP | `src/focusquest/main.py`, enum `CodigoDeErro`, junto dos handlers — nunca nas exceções do domínio | existe |
| Contrato de entrada/saída da API | `src/focusquest/modules/<módulo>/schemas.py` | existe (`missions`, `progression`) |
| Caso de uso | `src/focusquest/modules/<módulo>/service.py` | existe (`missions`, `progression`) |
| Regra de domínio | `src/focusquest/modules/<módulo>/domain.py` | existe (`missions`, `progression`) |
| Erro de domínio comum a mais de um módulo | `src/focusquest/core/errors.py` | existe |
| Modelo (tabela SQLAlchemy) | `src/focusquest/modules/<módulo>/models.py` | existe (`missions`, `progression`) |
| Consulta ou gravação no banco | `src/focusquest/modules/<módulo>/repository.py` | contrato |
| Migração | `alembic/versions/` | existe |
| Configuração, conexão, infraestrutura comum | `src/focusquest/core/` | existe |
| Teste unitário (sem banco) / de integração (PostgreSQL real) | `tests/unit/` / `tests/integration/` | existe |
| Adaptador de um provedor externo (ex.: o SDK `anthropic`) | `src/focusquest/modules/<módulo>/<provedor>_provider.py`, atrás de um `Protocol` que o serviço consome | existe (`tutoring/anthropic_provider.py`) |
| Módulo do README §8 ainda não iniciado | `src/focusquest/modules/<módulo>/` | contrato |
| Processo que chama o provedor **fora da conversa** (avaliar uma entrega, e o que vier parecido) | um módulo **próprio** (`modules/evaluation/`), que consome o `Protocol` de `tutoring/provider.py` — nunca um método a mais no `tutoring/service.py`, nem uma chamada ao SDK. As tabelas ficam com o módulo dono dos dados (`missions`), e o módulo novo escreve por funções de serviço, para a direção ficar única (E11) | existe (`evaluation`) |
| Erro de domínio de **um** módulo só | `src/focusquest/modules/<módulo>/errors.py` (ou o `domain.py` do módulo) — **não** `core/errors.py`, que não pode importar módulo (`tests/unit/test_core_sem_modulos.py`) | existe (`evaluation/errors.py`) |

### Fora da aplicação

| Vou criar… | Vai em |
|---|---|
| Lógica de shell com mais de duas linhas usada pelo gate | `scripts/` (decisão D6: o Make do macOS roda cada linha em sua própria shell) |
| Job do CI | `.github/workflows/quality.yml`, **só depois** de existir o alvo do Makefile que ele executa |
| Serviço de infraestrutura local (banco) | `compose.yaml` |
| Variável de configuração do backend | um campo em `src/focusquest/core/config.py` **e** uma linha no `.env.example`. O `Settings` recusa **qualquer** chave do `.env` da raiz que não seja campo dele — com ou sem o prefixo `FOCUSQUEST_` —, então o `.env` da raiz não pode guardar variável de outro consumidor sem declará-la ali |
| Documentação de arquitetura | este arquivo |
| Configuração de execução compartilhada do PyCharm | `.run/*.run.xml` (existe; versionado de propósito — ver abaixo) |

### Configurações de execução do PyCharm (`.run/`)

O README §4 manda versionar `.run/` sem segredos. Existem cinco arquivos,
um por coisa que a pessoa executa ou depura pela IDE:

| Configuração | O que executa | Tipo no PyCharm |
|---|---|---|
| **API** | `python -m uvicorn focusquest.main:app --host 127.0.0.1 --port 8000`, o mesmo comando do roteiro de desenvolvimento do `docs/HANDOFF.md`; sem `--reload`, que atrapalha a depuração | Python (modo módulo) |
| **Frontend** | `npm run dev` em `frontend/` (o proxy `/api` do Vite aponta para a porta 8000) | npm |
| **Testes backend** | `pytest` sobre `tests/` | pytest |
| **Testes frontend** | `npm run test` em `frontend/` (Vitest, sem cobertura) | npm |
| **Gate** | `make check`, o mesmo alvo que os hooks e o CI executam | Shell Script, no terminal da IDE |

Decisões, com o motivo de cada uma:

- **O interpretador é o `.venv` do projeto**, por `$PROJECT_DIR$/.venv/bin/python`
  (`IS_MODULE_SDK` desligado), e não o SDK do módulo. O SDK do módulo é
  configuração pessoal da IDE e já apontou para o Python do Homebrew
  (pendência 16); o caminho relativo à raiz vale em qualquer clone e em
  qualquer worktree, sem caminho absoluto de usuário.
- **Nada de `sys.path` remendado** (README §4): `ADD_SOURCE_ROOTS` e
  `ADD_CONTENT_ROOTS` ficam desligados nas duas configurações Python. O pacote
  `focusquest` é importável porque o `uv sync` o instala em modo editável no
  `.venv`.
- **O diretório de trabalho é a raiz** (`$PROJECT_DIR$`): o `Settings` lê o
  `.env` relativo ao diretório atual (`env_file=".env"`), então a API e os
  testes precisam partir da raiz para achar o banco.
- **Sem segredo e sem variável de ambiente própria.** A configuração vem do
  `.env` (ignorado pelo git) que o `Settings` lê sozinho. A chave da Kairya
  **não** entra aqui: continua no Keychain, como no roteiro do
  `docs/HANDOFF.md`; para a API com a Kairya, use o terminal.
- **O gate é o `make check` sem intermediário**, no terminal da IDE: assim
  herda o `PATH` do shell da pessoa (`uv`, `node`), que um processo lançado
  pela interface gráfica do macOS não tem. Não há configuração para
  `pre-commit`: o hook é do git, não do Makefile (`AGENTS.md` §4).
- O nome do arquivo é o nome da configuração com espaços trocados por `_`,
  que é como o PyCharm grava; nomes de uma palavra evitam a conversão.

`tests/unit/test_run_configs.py` guarda o que é verificável sem a IDE: os
arquivos existem e são XML bem formado, não trazem caminho pessoal nem
segredo, `.run/` não está no `.gitignore`, e cada script do npm, alvo do
Makefile, módulo da API e pasta de testes que eles apontam existe. **Não
prova que o PyCharm os abre e executa** — os arquivos foram escritos no
formato que o PyCharm grava, mas nunca foram abertos numa IDE (estado "não
executado", pendência 17 do `docs/HANDOFF.md`). Requisitos: as duas
configurações de npm exigem o plugin de JavaScript e um Node configurado na
IDE (Settings > Languages & Frameworks > Node.js); sem eles, use o terminal
(`cd frontend && npm run dev`).

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
   - **Nada de `App.tsx` gigante.** Hoje `App.tsx` é o **roteador de duas
     áreas**, por estado local (C15, decisão K1, Incremento C): um
     `useState<Area>`, a barra `<SideNav />` de `app/`, e as duas páginas
     (`Headquarters`, oculta ou visível; `Campaigns`, montada só enquanto
     ativa). O que entra nele continua sendo o roteador, nunca o conteúdo de
     uma área — isso mora em `pages/`.
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

## 7. Estabilização conciliada com E/F/G — 2026-10-04

A conciliação do PR #6 parte de `469e149` e conserva os módulos, rotas e
migrações dos incrementos E/F/G. `core/validation.py` fornece
`TextoPersistivel`, usado nos contratos textuais persistidos, inclusive os
identificadores de iniciar/reagendar. Rejeita U+0000 sem sanitizar identificadores
ou alterar trim e limites. Texto recebido do provedor também é validado antes
de acrescentar ou emitir um delta: NUL e Unicode não representável não chegam
ao PostgreSQL nem ao SSE; o prefixo válido e o encerramento de erro permanecem.
`main.py` serializa somente `RequestValidationError` como JSON ASCII com 422,
preservando os diagnósticos de entrada sem converter erros internos em 422.

`ler_progresso` agrega o livro-razão antes do LEFT JOIN das conquistas em um
SELECT, evitando multiplicação de XP e combinações de snapshots. `ler_ciclo`
lê o relógio uma vez e projeta missões, planos, evidência e avaliação em um
SELECT. Histórico, missão de hoje, diária tardia e especial são derivados
desse conjunto. As cópias são transientes: a identity map não substitui valores
do snapshot por objetos antigos nem muda a resposta após refresh/expire.
O autoflush normal preserva alterações próprias ainda não commitadas. Não há
novo isolamento, trava, cache, commit interno nem garantia entre endpoints.

Na interface, a guarda de voo por instância complementa a idempotência do
backend; respostas de GET anteriores não substituem a leitura mais recente.
O histórico reconcilia decisões tomadas enquanto aquele GET estava em curso,
e um GET posterior volta a ser autoritativo. Quadro e ciclo comunicam somente
IDs explicitamente concluídas ao registro de chaves, incluindo `late_daily`;
a poda espera todos os voos e conserva rascunhos e chaves de iniciar/reagendar.
Foco e `inert` respeitam visibilidade e mudanças de breakpoint. Textos longos
quebram dentro dos cartões, inclusive a proposta de reagendamento do F.

Arquivos adicionais da estabilização, além da árvore histórica da seção 1:

```text
src/focusquest/core/validation.py
tests/unit/test_textos_persistiveis.py
tests/integration/test_cycle_consistency.py
tests/integration/test_migracoes_offline.py
tests/integration/test_mission_operations_schema_parity.py
tests/integration/test_paridade_geral_do_esquema.py
tests/integration/test_progression_consistency.py
tests/integration/test_progression_schema_parity.py
tests/integration/test_request_validation.py
tests/integration/test_textos_persistiveis.py
tests/integration/test_tutoring_delta_nul.py
tests/integration/test_tutoring_delta_unicode.py
tests/integration/test_tutoring_max_tokens.py
frontend/tests/e2e/cycle-focus.spec.ts
frontend/tests/e2e/layout.spec.ts
frontend/tests/e2e/navigation.spec.ts
frontend/tests/e2e/tutor-focus.spec.ts
```

Os testes de paridade de `xp_entries` comparam FKs, UNIQUE e índices ao modelo
atual, incluindo unicidade por `(mission_id, source)` do E; os de
`mission_operations` comparam FKs e UNIQUE nomeadas. A paridade geral fica em
`test_paridade_geral_do_esquema.py` (autogenerate + nomes dos CHECKs); os
testes delimitados continuam fixando nomes de UNIQUE e a ausência de predicado
em `ix_xp_entries_user_id_id`. O caso explícito
`test_ida_e_volta_0004_populada_preserva_legado_e_reconstroi_progressao` exige
legado/XP/conquistas não vazios, preserva o legado em 0003↔head e compara a
progressão reconstruída, excluindo missões pendentes (83 já resolvida na base).
As nove colunas legadas de `tutor_messages` são comparadas explicitamente:
`fallback_model`, criada na `0007`, é removida pelo downgrade e não pertence
ao contrato de preservação da `0004`. Os IDs do legado são preservados; os IDs
das entradas de XP e suas FKs nas conquistas são normalizados na comparação
da progressão reconstruída. Esse caso não mede identidade bruta da progressão,
sequences, índices ou todo o schema. Nenhum teste ou migração foi alterado
pela correção documental da 83.


### Prova da janela tardia depois da trava

A fatia `wt/conclusao-tardia-espera` (base `5ba81c3`, ainda não integrada à
`main`) acrescenta `tests/integration/test_conclusao_tardia_espera.py`.
O holder apenas trava a diária já iniciada. O controlador observa a
espera pelo PID exato, avança um relógio que não bloqueia e só então libera.
Os casos cobrem o fim da janela tardia e o último segundo ainda disponível,
com conclusão, evidência e XP no instante posterior à espera.

Na recusa, consultas SQL com autoflush verificam a ausência de escritas
antes do rollback; uma sessão nova confere a persistência. No sucesso,
verificam estado, início preservado, timestamps, evidência, operações e o
único crédito de 40 XP da diária. O cleanup usa o plano criado como escopo,
e libera a trava antes de aguardar o executor em qualquer saída.
Não altera produção nem comprova releitura após mudança da linha: o holder
não muda os dados. É uma prova parcial da F25/160, não uma matriz geral.


### Retentativas HTTP e geração nos testes de encerramento

Na fatia `wt/sdk-retries-oraculo` (base `5ba81c3`, ainda não integrada à
`main`), `test_tutoring_max_tokens.py` distingue uma geração lógica das
retentativas HTTP que o SDK já permite. Um tratador local devolve 500 imediato
na tentativa zero; as seguintes usam o mesmo servidor falso e stream real.
Não muda o roteiro global nem depende de atraso artificial para obter retry.

O oráculo exige entre uma e `1 + TENTATIVAS` requisições, sequência exata
`x-stainless-retry-count` de zero em diante e o mesmo JSON em todas as
tentativas da geração. No cenário 500, exige pelo menos duas requisições.
O reenvio explícito delimita duas gerações, cada uma com seu próprio grupo,
e continua exigindo dois geradores fechados. Status, SSE, proposta,
persistência e efeitos anteriores permanecem verificados. O teste com
`max_retries=0` continua exigindo uma única requisição física.

O header é observabilidade do SDK instalado, confirmado no seu código e no
HTTP real dos testes, não um contrato público do KairyaQuest. Uma atualização
do SDK pode exigir rever este oráculo. Nenhuma política de retentativa,
timeout, adaptador de produção ou contrato do produto foi alterado.

## Prova sequencial de reuso com evidência — 2026-10-05

`test_iniciar_missao.py` fortalece o caso existente de chave de início usada
para concluir a mesma missão; `test_missions_service.py` fortalece o caso de
chave de conclusão usada noutra missão. `NovaEvidencia` acompanha a tentativa
recusada. Consultas SQL com autoflush antes do rollback verificam evidência,
XP, operações, estado e timestamps; o segundo preserva também a entrega e
progressão da origem. Não há cenário duplicado nem alteração de produção.

O controle de mutação mantém o erro real e apenas escreve evidência no
caminho de reuso: os três módulos antigos (71 casos) passam; as duas
verificações fortalecidas detectam a escrita indevida. O serviço é restaurado
no `finally` e confirmado por SHA antes da execução relacionada aprovada.
Esta é parte de 97(j)/T-M1: não mede rollback numa sessão nova, comparação de
evidência no reenvio, disputa da UNIQUE, HTTP ou todas as recusas. Os gates e
PR desta branch não aprovam uma combinação com outros incrementos.
