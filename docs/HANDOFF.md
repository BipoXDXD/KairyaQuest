# HANDOFF

Estado corrente para qualquer agente (Kimi, Codex, Claude) que assumir o trabalho.
Sem credenciais, sem caminhos pessoais.

## Objetivo

FocusQuest: plataforma de estudos gamificada com Tifa Lockhart como tutora
interativa. Especificação completa em `README.md`. Entrega por incrementos.

## Revisão-base

**Incremento 1a — fatia vertical: missões persistidas.** Branch
`feat/incremento-1a`, aberta a partir de `a869292` (a `main` naquele
momento). A implementação vai de `1ff982d` a `96eaeba` — 23 commits,
contados com `git log a869292..96eaeba` —, e este documento é atualizado no
commit que a registra, logo depois deles. Spec em
`docs/superpowers/specs/2026-09-17-incremento-1a-design.md`; plano em
`docs/superpowers/plans/2026-09-17-incremento-1a.md`.

**Estado de publicação: a branch não foi empurrada.** Ela não tem upstream,
nenhum pull request foi aberto e, portanto, os jobs `check-api` e
`check-e2e` **nunca rodaram no GitHub Actions**. Publicar exige autorização
do responsável pelo projeto (README §1, `AGENTS.md` §2).

O Incremento 1 original (fatia vertical **mais** a tutora) foi dividido em
dois, por decisão do usuário: **1a** (este) entrega API, PostgreSQL, Alembic,
missão persistida e o Quartel-General, e traz os alvos `check-api` e
`check-e2e`; **1b** traz a Tifa, o fluxo de propor e confirmar uma missão e o
chat (ver "Próximo incremento").

## Decisões tomadas

### Incremento 1a — decisões A1 a A8 (da spec)

Transcritas da tabela "Decisões deste incremento" da spec; o texto completo,
com o motivo por extenso, está lá.

| # | Decisão | Motivo |
|---|---|---|
| A1 | `[tool.uv] package = true`, com backend de build e instalação editável | **Corrige a decisão D2 do Incremento 2**, que fixou `package = false`. Com layout `src/`, aquilo tornava `import focusquest` impossível sem manipular `sys.path`, que o README §4 proíbe por nome. Instalação editável é como o Python torna o próprio projeto importável em pytest, uvicorn e Alembic ao mesmo tempo. |
| A2 | Usuário único local, **declarado** | O README §8 permite explicitamente o recorte local e de usuário único. Sem login, sem sessão, sem token; uma linha de usuário criada pela migração. É recorte, não omissão: autenticação e autorização por recurso entram antes de existirem contas reais. |
| A3 | Dificuldade é inteiro; prazo é instante com timezone | Decisão do usuário. O README §8 exige persistir instantes com timezone e apresentar em `America/Sao_Paulo`. |
| A4 | XP é **derivado** da dificuldade, não persistido | Decisão do usuário. Elimina o estado em que dificuldade e XP discordam. Consequência aceita: mudar a fórmula altera retroativamente o XP de missões antigas. |
| A5 | O estado `concluida` é **terminal** | "Reenvios não duplicam conclusões nem XP" (README §8) passa a vir da estrutura: a segunda tentativa não é uma transição legal. |
| A6 | Estado como `VARCHAR` + `CHECK`, não `ENUM` nativo do PostgreSQL | A garantia é idêntica; o custo de evoluir, não. Acrescentar valor a um `ENUM` nativo exige `ALTER TYPE ADD VALUE`, e o projeto vai ganhar estados. No Python o tipo continua `StrEnum`. |
| A7 | O PostgreSQL do container expõe uma porta do host **diferente de 5432** | Já existe na máquina de desenvolvimento um PostgreSQL local nessa porta, que não pertence ao projeto (README §10). A porta escolhida é 55432, configurável por `FOCUSQUEST_DB_PORT`. |
| A8 | 1a inclui um endpoint que **muda estado** (concluir missão) | Um incremento só de leitura não exercitaria nada do que o README §8 mais cobra: transições, idempotência, concorrência. |

### Incremento 1a — decisões tomadas durante a execução

Cada uma está no código, com o motivo no comentário do arquivo citado.

| Decisão | Motivo |
|---|---|
| Fórmula de XP: `20 + 10 * d * (d - 1)` (`XP_BASE` e `XP_INCREMENTO` em `domain.py`) | O piso impede que a missão fácil valha quase nada; o termo quadrático faz o difícil compensar sem explodir (dificuldade 1 vale 20, dificuldade 5 vale 220). Uma curva linear faria das missões fáceis a forma mais eficiente de ganhar XP por hora. |
| Teto de dificuldade `DIFICULDADE_MAXIMA = 5`, no schema e não no domínio | A curva de XP foi calibrada nessa faixa, e cinco é a granularidade que uma pessoa consegue julgar. O domínio responde quanto vale uma dificuldade; a borda responde qual aceita receber. |
| `deadline` exige fuso na entrada (422 para datetime sem fuso) | Aceitar datetime sem fuso fazia o mesmo prazo sair em duas serializações diferentes (sem `Z` no 201, com `Z` no GET), que o JavaScript lê como dois instantes. Normalizar em silêncio seria adivinhar o fuso do cliente. |
| Missão inexistente e missão de outro usuário respondem o **mesmo** 404, com o mesmo corpo | Desvio deliberado da spec, que previa respostas distintas: responder 403, ou um 404 com o motivo verdadeiro, revelaria que o recurso existe. A distinção vai para o log (`INFO` para inexistente, `WARNING` para acesso negado). |
| Um `operation_id` fica vinculado à primeira operação em que foi usado; reusá-lo em outra missão ou outro tipo de operação é 409 (`OperacaoReutilizadaError`), e não sucesso | Aceitar qualquer reuso como "já feito" faria concluir a missão B com a chave da missão A devolver a missão A como sucesso, com a B ainda pendente. |
| O `commit` é feito pela rota, não pela dependência de sessão | Um commit depois do `yield` rodaria com a resposta já montada, e uma falha nele não teria como mudar o status. |
| Corpo de erro `{"detail": ...}` com chave em inglês e prosa em pt-BR | A chave é contrato de payload e é a mesma que o FastAPI usa no 422; o texto é interface. |
| Valores do estado da missão em português (`pendente`, `em_andamento`, `concluida`) | A regra de idioma do README §3 enumera nomes de coluna, chaves de payload JSON e rotas; valor de enum não é nenhum dos três. |
| `Settings` sem `extra="ignore"` (o padrão do pydantic-settings, que recusa chave desconhecida) | Engolir configuração desconhecida faria um erro de digitação no `.env` aparecer como "variável obrigatória ausente", no lugar errado. |
| Frontend fala com a API por **proxy do Vite** (`/api`), sem `CORSMiddleware` | CORS introduziria superfície de segurança para um problema que só existe em desenvolvimento. O alvo do proxy vem de `API_PROXY_TARGET`, com a 8000 só como padrão, para o E2E apontar para a sua API dedicada. |
| O cliente HTTP do frontend lança no carregamento se `VITE_API_URL` faltar | Um padrão silencioso faria "esqueci de configurar" aparecer como "o servidor está fora" — dois problemas com ações opostas. |
| O E2E divide o banco `focusquest_test` com a suíte pytest, em vez de ter banco próprio | Um terceiro banco exigiria campo novo em `Settings`, um terceiro modo no `alembic/env.py` (o arquivo que carrega a guarda do comando destrutivo) e uma variável a mais no CI. Duas exigências estruturais tornam o compartilhamento seguro: o cenário semeia pela API, por HTTP, e afirma só sobre as linhas que ele mesmo criou. |
| E2E contra o `vite preview` do build de produção, não contra o servidor de desenvolvimento | O cenário visita o mesmo artefato que iria para o ar, e o build deixa de ser decoração. |
| Coleta do Vitest por **negação** (`exclude`), não por permissão (`include`) | Medido: com `include` estreito, um teste que reprovava fora de `src/` não era coletado e o gate aprovava. `docs/QUALITY.md` §3. |
| `uv lock --check` como primeira receita do `check-api`; **nenhum** equivalente npm no `check-web` | Cumpre a validação do lockfile Python que o `docs/QUALITY.md` prometia. Do lado npm não existe comando barato e confiável que compare sem instalar; a assimetria está declarada no `docs/QUALITY.md` §4. |
| O `pre-push` passa ao worktree as variáveis `FOCUSQUEST_*` do `.env`, por lista de permissão, nunca `source`, e recusa o push se faltarem | Sem isso, todo push seria recusado com `ValidationError`; degradar para "pular o `check-api`" seria gate cego. `docs/QUALITY.md` §6. |
| `timeout-minutes` em todos os jobs do CI | O padrão do runner é seis horas; um job travado deixaria o pull request sem veredito nesse tempo. |

### Incrementos anteriores

| Decisão | Motivo |
|---|---|
| Pasta do frontend permanece `frontend/`, não `web/` | README §3 manda adaptar a árvore à localização atual e não mover arquivos por estética. Divergência deliberada da árvore de exemplo. |
| Dois commits no saneamento | O primeiro congela o estado encontrado; o segundo isola as correções como diff auditável (README §3: comparar build antes/depois). |
| Tailwind como `devDependency` | O plugin roda no build do Vite; nada dele chega ao bundle do navegador. Na raiz estava como `dependency`. |
| `.run/` fora do `.gitignore` | README §4 manda versionar configuração de execução compartilhada. `.idea/` continua ignorado por ser estado pessoal. |
| D1 — O gate cobre apenas categorias com código real por trás; cada incremento futuro traz a sua | Rodar Ruff, mypy, pytest ou Playwright sobre conjunto vazio é o "sucesso com suíte vazia" proibido pelo §9. **Cumprida no 1a:** `check-api` e `check-e2e` entraram junto com o primeiro código Python e o primeiro fluxo ponta a ponta. |
| D2 — `pyproject.toml` + `uv.lock` criados no Incremento 2, só com dev-dependencies | Fonte única de verdade para versões das ferramentas Python. **Corrigida pela A1** (o `package = false` impedia importar o pacote) e pela validação do lock: quem valida é `--locked`/`--check`, não o `--frozen` que a D2 citava. |
| D3 — Hooks do pre-commit usam `language: system` e invocam `make check` | Impede a divergência clássica entre a versão que o hook instala e a que o lockfile fixa. |
| D4 — Gitleaks instalado por `scripts/install-gitleaks.sh` em `.tools/`, versão e checksums SHA-256 fixados | Binário Go, ausente do `uv.lock`. O hook gerenciado pelo pre-commit criaria recursão (pre-commit chamaria `make check`, que chamaria `pre-commit run`), proibida pelo §9. |
| D5 — Alvos granulares no Makefile, espelhados 1:1 nos jobs do CI | O §12 exige jobs distintos sob um agregador; um alvo por job mantém local e CI no mesmo caminho de execução. |
| D6 — Lógica com mais de duas linhas mora em `scripts/`, não no Makefile | GNU Make 3.81 (o disponível no macOS) executa cada linha de receita em sua própria shell; o §12 pede scripts compartilhados entre local e CI. |
| D7 — `main.tsx` é testado, não excluído da cobertura | O §9 proíbe excluir código difícil e proíbe diretivas de ignorar cobertura; testá-lo custa poucas linhas. |
| D8 — Prettier sem `eslint-config-prettier` | No flat config do ESLint 9+, os presets `recommended` não trazem regras de formatação; não há conflito a desarmar. |

### Dependências e infraestrutura que entraram no 1a

O `AGENTS.md` §4 exige motivo escrito para cada biblioteca, endpoint e
serviço.

- **Backend** (`pyproject.toml`): `fastapi`, `uvicorn`, `pydantic`,
  `pydantic-settings`, `sqlalchemy`, `psycopg[binary]` e `alembic` — a
  stack que o README §3 nomeia, uma a uma. `httpx` (dev) é o transporte do
  `TestClient` do FastAPI; `pytest` e `pytest-cov` são as ferramentas de
  teste e cobertura que o README §9 nomeia.
- **Frontend** (`frontend/package.json`, dev): `@playwright/test` e
  `@axe-core/playwright` — o Playwright/Chromium e o axe-core que o
  README §9 exige no E2E.
- **Serviço:** PostgreSQL `18.6-alpine` em container (`compose.yaml`),
  versão fixada e com healthcheck, conforme o README §3 e §10.
- **Endpoints:** os três de `/api/missions`, `/health` e `/ready` — ver
  "O contrato HTTP que existe" em `docs/ARCHITECTURE.md` §3. O de concluir
  existe pela decisão A8.

## Alterações do Incremento 1a

Commits `1ff982d`..`96eaeba`:

- **Pacote e configuração:** `pyproject.toml` com o pacote `focusquest`
  instalável (A1) e as dependências da aplicação;
  `src/focusquest/core/config.py` (`Settings`, prefixo `FOCUSQUEST_`, sem
  valor padrão para as URLs de banco); `.env.example` na raiz.
- **PostgreSQL local:** `compose.yaml` com `postgres:18.6-alpine` na porta
  `127.0.0.1:55432` do host, volume persistente, healthcheck com
  `pg_isready -h 127.0.0.1`, e `scripts/init-test-db.sql` criando o
  `focusquest_test` separado do banco de desenvolvimento.
- **Conexão e saúde:** `core/database.py` (engine e sessão por requisição),
  `/health` sem banco e `/ready` com consulta real.
- **Migração:** `alembic/versions/0001_esquema_inicial.py` cria `users`,
  `missions` e `mission_operations` (com `UNIQUE` em `operation_id`), semeia
  o usuário único e ajusta a sequence de `users`. Os testes aplicam a
  migração em banco vazio, fazem o downgrade e a aplicam de novo, atrás de
  uma guarda que recusa rodar o `DROP SCHEMA` fora do banco de teste.
- **Módulo `missions`:** domínio (estados, transições, XP, duração real),
  modelos, casos de uso (criar, listar, concluir com idempotência sob
  concorrência, via `SELECT ... FOR UPDATE` e a restrição única), schemas e
  as três rotas, com os erros traduzidos em `main.py`.
- **Frontend:** o Quartel-General (`pages/Headquarters.tsx`) listando as
  missões da API pela feature `missions` e pelo cliente único de
  `shared/api/`, com os quatro estados de tela (carregando, vazio, erro,
  carregado) e o "Tentar novamente" no estado de erro.
- **Gate:** alvos `check-api`, `check-e2e`, `db-up`, `db-down`, `migrate` e
  `migrate-test` no `Makefile`; `bootstrap` passou a instalar o Chromium do
  Playwright e a usar `uv sync --locked`; jobs `check-api` e `check-e2e` no
  CI, cada um com o próprio serviço PostgreSQL, os quatro jobs no `needs` e
  no laço do `quality-gate`; `timeout-minutes` em todos os jobs;
  `scripts/e2e-env.sh`; a passagem das variáveis `FOCUSQUEST_*` para o
  worktree do `pre-push`.
- **Documentação:** `docs/QUALITY.md`, `docs/ARCHITECTURE.md`, este arquivo
  e o `AGENTS.md` passaram a descrever o sistema como ele ficou.

## Comandos

Os alvos do Makefile estão descritos em `docs/QUALITY.md` §1. Os novos neste
incremento:

| Comando | O que faz |
|---|---|
| `make db-up` | Sobe o PostgreSQL e espera o healthcheck. |
| `make db-down` | Derruba o PostgreSQL, preservando o volume. |
| `make migrate` | Aplica as migrações no banco de desenvolvimento. |
| `make migrate-test` | Aplica as migrações no banco de teste. |
| `make check-api` | `uv lock --check`, Ruff, mypy estrito e pytest com cobertura de 100%. |
| `make check-e2e` | `migrate-test`, build do frontend e Playwright com axe-core. |

Para rodar a aplicação em desenvolvimento (não faz parte do gate):

```bash
make db-up
make migrate
uv run uvicorn focusquest.main:app --host 127.0.0.1 --port 8000
cd frontend && npm run dev            # com frontend/.env copiado do frontend/.env.example
```

O frontend de desenvolvimento encaminha `/api` para a porta 8000. Para outro
alvo, exporte `API_PROXY_TARGET` no ambiente do processo do Vite — escrita
no `.env`, ela é ignorada (`docs/ARCHITECTURE.md` §3).

## Resultados

Executados nesta sessão, na raiz, sobre `96eaeba` com a documentação deste
incremento aplicada:

| Comando | Resultado |
|---|---|
| `make check` | Aprovado, EXIT 0, cerca de 12 s de relógio com o PostgreSQL de pé. Frontend: 35 testes, cobertura de 100% nos quatro eixos (50/50 instruções, 22/22 ramificações, 18/18 funções, 48/48 linhas). `uv lock --check` aprovado. Ruff sem achados, 33 arquivos já formatados. mypy sem problemas em 29 arquivos. pytest: 91 testes, 2 avisos (as duas `DeprecationWarning` das pendências), cobertura total de 100%. E2E: 4 cenários aprovados em Chromium. Gitleaks sem achados. |
| `scripts/check-push.sh`, executado à mão pela entrada padrão, sem push | Aprovado, EXIT 0, cerca de 25 s: `make bootstrap` e `make check` inteiros no worktree temporário, sem `.env` nele, com as variáveis `FOCUSQUEST_*` vindas do repositório principal. O worktree foi removido ao fim. |
| Contagem de linhas do E2E no `focusquest_test` depois de um `make check` | 2 — as missões da última execução do E2E; as anteriores foram apagadas pelo `DROP SCHEMA` da suíte pytest. |
| Jobs `check-api` e `check-e2e` no GitHub Actions | **Não executados.** A branch não foi empurrada. |

## Ambiente verificado

Node 24.21.0 / npm 11.19.0; Python 3.14.7 (o do `.venv`); uv 0.12.13;
Docker 29.7.2 com daemon rodando; Compose v5.5.1; git 2.55.0; gh 2.100.0.

**Versões fixadas do gate:** Gitleaks 8.30.1 (checksums do tarball e do
binário extraído em `scripts/install-gitleaks.sh` — os dois valores ficam
só ali, não duplicados aqui; procedimento de atualização em
`docs/QUALITY.md` §7); Ruff, mypy, pytest e as dependências da aplicação
conforme `uv.lock`; Prettier 3.9.7, Vitest 5.0.1, `@playwright/test` 1.63.0
e `@axe-core/playwright` 4.13.0 conforme `frontend/package-lock.json`;
PostgreSQL `postgres:18.6-alpine` no `compose.yaml` e no workflow.

## Setup (clone ou worktree novo)

`make bootstrap` **não** instala hooks de git — só dependências. Em
qualquer clone ou worktree novo, rode os comandos abaixo, nesta ordem
(detalhado, com o porquê de cada passo, em `docs/QUALITY.md`, seção
"Primeiro uso após clonar"):

```bash
make bootstrap
uv run pre-commit install --install-hooks
cp .env.example .env
make db-up
make migrate-test
make check
```

Sem o comando dos hooks, commits e pushes não passam por nenhuma validação
local, sem aviso. Sem o `.env` e o `make db-up`, o `check-api` e o
`check-e2e` reprovam.

## Pendências

### Resolvidas por este incremento

1. ~~**Backend sem código de aplicação.**~~ Resolvida: o pacote
   `focusquest`, com o módulo `missions`, a migração e as duas suítes de
   teste, existe desde este incremento.
2. ~~**`check-api` e `check-e2e` ainda não existem.**~~ Resolvida: os dois
   alvos estão no `Makefile` e no `make check`, e os dois jobs estão no
   workflow e no `quality-gate`. A fonte de verdade deles passou do
   `docs/QUALITY.md` §4 para o `Makefile`.
3. ~~**Divergência conhecida da spec: o `uv.lock` não é validado em lugar
   nenhum.**~~ Resolvida: `uv lock --check` é a primeira receita do
   `check-api`, local e no CI, e `uv sync --locked` roda no `make bootstrap`
   e no preparo dos jobs. Do lado npm fica uma assimetria **declarada**, não
   uma pendência esquecida: ver `docs/QUALITY.md` §4.

As outras três entradas da lista anterior (integração remota, `AGENTS.md` e
`CLAUDE.md`, `docs/ARCHITECTURE.md`) eram registros de conclusão do
Incremento 2, não pendências abertas; estão resumidas em "Incrementos
anteriores", abaixo.

### Abertas

Cada item foi conferido no código ou medido nesta sessão. Nenhum é bug
esquecido: são recortes e limitações conhecidas, com a consequência de
ninguém mexer.

**Contrato e API**

1. **Os dois 409 não têm `code` legível por máquina.** Transição ilegal e
   `operation_id` gasto só se distinguem pela mensagem em português, e a
   ação correta do cliente é oposta nos dois (não há o que repetir, contra
   gerar um identificador novo e repetir o mesmo corpo). Não entrou agora
   porque a tela do 1a só lista missões e nenhum dos dois 409 é alcançável
   por ela. **Quem construir o fluxo de concluir missão no frontend precisa
   resolver isto antes**, ou vai ramificar em texto de interface.
2. **O `/openapi.json` não expressa a exigência de fuso em `deadline`.** O
   schema diz só `date-time`; a recusa do datetime sem fuso é verificada em
   runtime. Um cliente gerado do schema só a descobre ao receber o 422.
   Anotar `pattern` foi recusado porque boa parte dos geradores de cliente
   não o honra sobre `date-time`.
3. **Não existe endpoint de iniciar missão.** `em_andamento` e `started_at`
   existem no modelo e no domínio, mas as rotas não os alcançam, e
   `actual_duration_minutes` sai sempre `null` pela API.
4. **A trava da linha é adquirida antes da checagem de dono.**
   `concluir_missao` faz `SELECT ... FOR UPDATE` e só depois compara o
   `user_id`. Com usuário único é inofensivo; com autenticação, um pedido
   com o usuário errado seguraria a linha até o rollback. Resolver junto com
   a autenticação.
5. **Autenticação e autorização por recurso não existem** (decisão A2). Entram
   antes de existirem contas reais (README §8).

**Domínio e persistência**

6. **O prazo é exibido no fuso de quem lê, não em `America/Sao_Paulo`.** O
   `Intl.DateTimeFormat` de `MissionList.tsx` não fixa `timeZone`, e o
   README §8 manda apresentar em `America/Sao_Paulo`. O instante está certo
   (o atributo `dateTime` do `<time>` carrega a string ISO com fuso); o
   texto visível muda com o fuso da máquina.
7. **O relógio não é injetável.** `concluir_missao` usa `datetime.now(UTC)`
   direto, e o README §8 pede relógio injetado nos testes. Os testes
   compensam com asserção de janela de tempo.
8. **O modelo `User` mora em `modules/missions/models.py`**, como dívida
   consciente: criar um módulo `users` para uma tabela de uma linha seria a
   camada vazia que o README §3 proíbe. O módulo `users`, quando nascer,
   precisa remover a classe daqui, ou o SQLAlchemy recusará a tabela
   duplicada.
9. **Modelo e migração descrevem as mesmas restrições em dois lugares, e só
   os `CHECK` de `missions` têm teste de divergência** (compara o que o
   PostgreSQL descreve para a tabela real e para uma cópia criada a partir
   do modelo). Não existe teste de comparação geral entre modelo e migração
   (`compare_metadata` do Alembic, que de todo modo não compara `CHECK`); um
   `CHECK` novo em `mission_operations`, ou outra divergência fora dos
   `CHECK` de `missions`, não é detectado por teste dedicado.
10. **`run_migrations_offline()` do `alembic/env.py` não é exercitado** por
    nenhum teste. `alembic/` está fora do denominador de cobertura e o
    projeto não usa o modo offline.
11. **O valor 55432 está repetido** no padrão de `FOCUSQUEST_DB_PORT` do
    `Settings` (onde o campo existe só para o `.env` ser aceito), no
    `compose.yaml`, no `.env.example` e no workflow. Nada detecta se eles
    divergirem.

**Configuração e operação**

12. **O `Settings` só é estrito no `.env`.** Medido: qualquer chave do
    `.env` da raiz que não seja campo do `Settings` — com ou sem o prefixo
    `FOCUSQUEST_` — reprova com `extra_forbidden`; já uma variável
    `FOCUSQUEST_*` desconhecida vinda do ambiente do processo é descartada em
    silêncio. Um erro de digitação numa variável opcional exportada no shell
    ou no CI passaria despercebido (hoje só há um campo opcional,
    `db_port`).
13. **Não há configuração de logging.** Nenhum `basicConfig` ou `dictConfig`
    no código. Medido fora do uvicorn: sem handler na raiz, só o `WARNING`
    ou acima chega ao stderr, pelo `lastResort` do Python — o `INFO` de
    "missão não encontrada" não aparece; o `WARNING` de acesso negado,
    sim. Sob o uvicorn não foi medido.
14. **A engine é uma global de módulo em `core/database.py`**, não um recurso
    do `lifespan` do app: há uma corrida teórica na criação e nenhum
    `dispose()` no desligamento. Movê-la para o `lifespan` é mudança de
    contrato, não refatoração: a engine passaria a nascer na partida, e o
    `/health` deixaria de responder sem configuração de banco — que é o que
    um teste exige hoje.
15. **Duas `DeprecationWarning` de dependência** aparecem em toda execução do
    pytest: o `TestClient` do Starlette pedindo outro pacote no lugar do
    `httpx`, e o alias `anyio.abc.BlockingPortal`. Não são deste código;
    pedem uma decisão de `filterwarnings` em tarefa própria.
16. **O interpretador do projeto no PyCharm aponta para o Python do
    Homebrew, não para o `.venv`.** `.idea/` é ignorado pelo git e não foi
    alterado às cegas. Efeito: avisos de import não resolvido no editor; o
    gate e os testes não são afetados.
17. **Não existe `.run/`** com as configurações de execução compartilhadas
    que o README §4 pede (API, frontend, testes, gate).

**Gate e E2E**

18. **Os jobs `check-api` e `check-e2e` nunca rodaram no GitHub Actions**, e
    o caminho do `pre-push` pelas variáveis do framework `pre-commit`, com o
    `check-api` no gate, nunca foi exercitado por um `git push` real. O
    primeiro push desta branch é o momento de observar, não de assumir.
19. **`check-api` e `check-e2e` não podem rodar ao mesmo tempo na mesma
    máquina** — nem dois `make check`, nem um `make check` e um push. A
    fixture do pytest faz `DROP SCHEMA` no banco que a API do E2E usa, e o
    E2E usa portas fixas (8100, 5273). No CI não há corrida: cada job tem o
    seu PostgreSQL.
20. **Cada execução do E2E deixa linhas no `focusquest_test`**, que só somem
    no próximo `DROP SCHEMA` da suíte pytest. `make check-e2e` rodado
    repetidamente, sem o `check-api` no meio, acumula.
21. **O axe audita os estados carregado e de erro, não o de carregando.**
22. **Um `package-lock.json` defasado passa no `make check` local e reprova no
    CI** — assimetria declarada em `docs/QUALITY.md` §4.
23. **Na sessão de um agente, a tabela de cobertura por arquivo do Vitest sai
    vazia** (`docs/QUALITY.md` §3). Não é evidência de 100%; a evidência é o
    limiar e o resumo.
24. **Arquivos órfãos no frontend:** `frontend/src/App.css` e
    `frontend/src/assets/` (`hero.png`, `react.svg`, `vite.svg`) não são
    importados por nenhum módulo — restos do scaffold do Vite. Remover é
    mudança de código, fora do escopo da documentação.
25. **Dependência do proxy do Vite.** No dia em que o frontend for servido por
    outra coisa que não o Vite, falta CORS ou um proxy reverso.

## Próximo incremento

**Incremento 1b** — a Tifa, o fluxo de propor e confirmar uma missão, e o
chat. Não traz alvo de gate novo; estende os existentes. O que já está
decidido e registrado na spec do 1a, "para 1b, não usado aqui":

- **Provedor de IA: Anthropic**, com **`claude-opus-5`** como modelo padrão
  **configurável**. O README §6 manda manter chamadas e credenciais no
  backend, com limites, timeouts e modelo configuráveis, e testar a
  integração sem chamadas pagas nem segredos reais.
- **O módulo `tutoring` nasce no 1b** (`src/focusquest/modules/tutoring/` e
  `frontend/src/features/tutoring/`, hoje contrato em
  `docs/ARCHITECTURE.md`). Não existe nada dele neste incremento.

O que o 1b vai encontrar e precisa saber, porque morde:

- Uma variável nova do backend (a credencial e o modelo do provedor, por
  exemplo) precisa virar campo do `Settings` **e** linha do `.env.example`:
  o `Settings` recusa qualquer chave desconhecida no `.env` da raiz
  (pendência 12). E, pelo `AGENTS.md` §4, o SDK do provedor entra com
  motivo escrito aqui.
- Propor e confirmar uma missão toca a criação e, provavelmente, a
  conclusão — e a conclusão tem os dois 409 sem `code` (pendência 1).
- O E2E do chat divide o banco e as portas do E2E atual (pendências 19 e
  20).

## Incrementos anteriores

### Incremento 0 — saneamento

- `git init` na raiz, branch `main`; `.gitignore` cobrindo Python, Node,
  segredos e estado de IDE.
- Tailwind desduplicado: `@tailwindcss/vite` e `tailwindcss` movidos do
  `package.json` da raiz para `frontend/package.json` como devDependencies.
  `package.json`, `package-lock.json` e `node_modules/` da raiz removidos.
- `"strict": true` adicionado a `tsconfig.app.json` e `tsconfig.node.json`.
- Removidos restos do projeto `PythonProject`: `main.py` (sample do PyCharm),
  um `.venv/` de outro projeto e `.idea/PythonProject.iml`.
- Verificação da época: artefatos de build idênticos antes e depois do
  saneamento; sem as dependências declaradas em `frontend/`, o build falhava
  com `TS2307: Cannot find module '@tailwindcss/vite'`.

### Incremento 2 — fundação de qualidade

Spec em `docs/superpowers/specs/2026-09-17-fundacao-qualidade-design.md`.

- `Makefile` com `help`, `bootstrap`, `check`, `check-web`, `check-secrets` e
  `format`; Prettier, ESLint, `tsc -b` e Vitest com limiares de 100%; raiz
  Python gerenciada por `uv`; Gitleaks 8.30.1 fixado por dois checksums;
  `.pre-commit-config.yaml` com os três estágios de hook e
  `scripts/check-push.sh`; `docs/QUALITY.md`; o workflow
  `.github/workflows/quality.yml`, na época com os jobs `check-web`,
  `check-secrets` e o agregador `quality-gate`.
- **Primeiro commit validado pelo gate: `b237e47`** — os onze commits
  anteriores antecederam a instalação dos hooks.
- `AGENTS.md`, `CLAUDE.md` (que importa o `AGENTS.md`) e
  `docs/ARCHITECTURE.md`, entregues por pull request.
- **Integração remota:** remoto em `github.com/BipoXDXD/FocusQuest`
  (privado). A `main` é protegida: exige o status `quality-gate`, com base
  atualizada, `enforce_admins` ativo, sem force-push nem deleção —
  reconferido nesta sessão com `gh api` na proteção da branch. Um push
  direto na `main` foi recusado pelo servidor com
  `GH006: Required status check "quality-gate" is expected`, mesmo com o
  gate local aprovado. Pull requests mesclados até aqui: #1 (integração
  remota no HANDOFF), #2 (`AGENTS.md`, `CLAUDE.md` e
  `docs/ARCHITECTURE.md`) e #3 (spec do Incremento 1a) — conferido com
  `gh pr list --state all`.
- Os relatórios de execução daquelas tarefas ficam em `.superpowers/sdd/`,
  ignorado pelo git: não chegam a um clone.
