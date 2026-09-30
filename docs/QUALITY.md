# QUALITY

Este documento descreve o gate de qualidade do FocusQuest: os comandos que o
compõem, a regra que governa quem chama quem, o que a cobertura mede (e o que
deliberadamente não mede), o que os alvos `check-api` e `check-e2e` fazem, a
integração contínua, as limitações conhecidas sem eufemismo, e o
procedimento de atualização do Gitleaks.

## Primeiro uso após clonar

Em um clone novo (ou um worktree novo), rode os comandos abaixo, **nesta
ordem**:

```bash
make bootstrap                                    # dependencias, Chromium do Playwright e Gitleaks
uv run pre-commit install --install-hooks         # hooks de git (NAO vem do bootstrap)
cp .env.example .env                              # configuracao local; o .env e ignorado pelo git
make db-up                                        # PostgreSQL em container, porta 55432 do host
make migrate-test                                 # esquema no banco de teste
make check                                        # confirma que o gate passa
```

O `.env` é obrigatório para o gate, não para a aplicação apenas:
`src/focusquest/core/config.py` exige `FOCUSQUEST_DATABASE_URL` e
`FOCUSQUEST_TEST_DATABASE_URL` sem valor padrão, e sem elas o `check-api`
reprova na partida. O `make db-up` precisa vir antes do `make check` porque
a suíte de integração e o E2E falam com um PostgreSQL real. O
`make migrate-test` à parte não é estritamente necessário — a fixture do
pytest migra o banco de teste por conta própria —, mas rodá-lo sozinho
mostra uma falha de migração isolada, antes de ela aparecer misturada ao
resto do gate. **Desde o Incremento B**, o pré-requisito **do `check-e2e`**
deixou de ser `migrate-test` e passou a ser `reset-test-db` (seção 4;
Task 6, commit `50e2150`), mas `make migrate-test` continua útil como
comando isolado, para o mesmo diagnóstico rápido de migração.

O comando dos hooks é separado do `make bootstrap` **de propósito**, não por
esquecimento: `make bootstrap` não instala hooks de git, e não vai passar a
instalar. `scripts/check-push.sh` roda `make bootstrap` dentro de um
worktree temporário a cada ref validada no `pre-push`; como um worktree
compartilha o diretório `.git` do repositório principal, um
`pre-commit install` disparado a partir de dentro de `bootstrap` reescreveria
os hooks do repositório principal no meio da validação de um push — efeito
colateral inaceitável. Manter os dois comandos sempre separados também
mantém "nenhum alvo do Makefile invoca `pre-commit`" (seção 2 abaixo) como
regra absoluta, sem exceção a lembrar.

O mesmo compartilhamento de worktree tem um efeito colateral análogo sobre
`.tools/`, não só sobre hooks. `scripts/check-push.sh` exporta
`FQ_TOOLS_DIR` apontando para o `.tools/` do repositório **principal**,
para o worktree temporário do `pre-push` reaproveitar o Gitleaks já
baixado em vez de baixar de novo a cada ref. Se a ref sendo validada fixar
uma versão diferente de Gitleaks em `scripts/install-gitleaks.sh`, rodar
`make bootstrap`/`make check` nesse worktree baixa a nova versão e grava
por cima do binário do repositório principal — validar uma ref muta o
repositório principal como efeito colateral. Não é vetor de troca de
binário: `install-gitleaks.sh` sempre confere o binário contra o
`BIN_SHA256` fixado antes de reutilizá-lo ou sobrescrevê-lo, então o que
fica em `.tools/gitleaks` continua sendo exatamente o que aquele script
esperava, nunca algo não verificado.

Sem o comando dos hooks, `git commit` e `git push` funcionam normalmente —
sem nenhuma validação. Ver a limitação correspondente na seção 6.

**Worktree que vai rodar o gate ao mesmo tempo que outro** (desde a Frente 0,
pendência 19): em vez do roteiro acima, a partir de qualquer worktree já
configurado,

```bash
scripts/novo-worktree.sh <nome>                   # ou <nome> <deslocamento>, de 0 a 24
cd ../FocusQuest-<nome>
make check
```

O script cria `../FocusQuest-<nome>` na branch nova `wt/<nome>` (a partir da
`main`), escreve o `.env` a partir do do principal com um banco de teste
próprio (`focusquest_<nome>_test`) e um `FOCUSQUEST_E2E_PORT_OFFSET` livre, e
roda `make bootstrap`. O banco nasce sozinho no primeiro uso. Os hooks já
valem (moram no `.git` comum). **Não rode `make db-up` fora do principal**: o
PostgreSQL é um só, e o compose chamado de outro diretório **recria** o
container (seção 6). O nome `push` é **reservado** (o banco dele seria o
`focusquest_push_test`, o do gate do push do principal), e o script recusa um
nome cujo banco, ou banco do push, já seja usado por um worktree registrado
(`docs/HANDOFF.md`, decisão F12).

## 1. Comandos

> **Fonte de verdade:** o `Makefile`. A tabela abaixo descreve as receitas
> como estão; se as duas divergirem, a receita está certa.

| Comando | Descrição |
|---|---|
| `make help` | Lista os alvos disponíveis do Makefile, com a descrição de cada um. |
| `make bootstrap` | Instala as dependências: `npm ci` no frontend, o Chromium do Playwright (`npx playwright install chromium`, sem `--with-deps`), `uv sync --locked` na raiz Python e o Gitleaks fixado via `scripts/install-gitleaks.sh`. |
| `make check` | Gate completo. Agrega `check-web`, `check-api`, `check-e2e` e `check-secrets`, nesta ordem. É o que os hooks (`pre-commit`, `pre-merge-commit`) e o `pre-push` (via `scripts/check-push.sh`) executam. |
| `make check-web` | ESLint (`--max-warnings 0`), depois Prettier em modo verificação, depois TypeScript sem emissão (`tsc -b`), depois Vitest com cobertura exigida de 100%, nesta ordem. |
| `make check-api` | `uv lock --check`, depois Ruff lint, depois Ruff `format --check`, depois mypy estrito sobre `src tests alembic`, depois pytest com cobertura (relatórios no terminal, em `htmlcov/` e em `coverage.xml`). Detalhe na seção 4. |
| `make check-e2e` | **Desde o Incremento B**, pré-requisito `reset-test-db` (não mais `migrate-test`); depois o build de produção do frontend com `VITE_API_URL=/api` e o Playwright em Chromium, com axe-core. Detalhe na seção 4. |
| `make check-secrets` | Instala o Gitleaks (idempotente) e varre o repositório inteiro em busca de segredos, com `--config .gitleaks.toml`. |
| `make format` | **Modifica** arquivos: aplica o Prettier (`prettier --write`) no frontend. Nunca é chamado por `check` nem por qualquer hook — é a única forma de o gate alterar arquivos **versionados**, e é manual. |
| `make db-up` | `docker compose up -d --wait postgres`: sobe o PostgreSQL do `compose.yaml` e só devolve o controle com o healthcheck aprovado. |
| `make db-down` | `docker compose down`: derruba o container **preservando** o volume (não usa `-v`). |
| `make migrate` | `uv run alembic upgrade head` no banco de **desenvolvimento**. |
| `make migrate-test` | `uv run alembic -x test=true upgrade head` no banco de **teste** — só migra, não apaga. |
| `make reset-test-db` | **Novo no Incremento B.** DESTRUTIVO: `PYTHONPATH=tests uv run python -m integration.banco_de_teste` (**desde a Frente 0, cria o banco de teste se ele não existir**; depois apaga e recria o schema `public` dele, tudo atrás da mesma guarda de `tests/integration/conftest.py`) e em seguida `uv run alembic -x test=true upgrade head`. Pré-requisito do `check-e2e` (seção 4). |

Os alvos de verificação são os quatro `check-*`. `bootstrap`, `format`,
`db-up`, `db-down`, `migrate` e `migrate-test` são preparação de ambiente ou
ação manual — por isso nenhum deles tem job próprio no CI (seção 5).

O `make` para no primeiro alvo que falha: `check` não chega ao `check-api`
se o `check-web` reprovar, e dentro de cada alvo uma receita só roda se a
anterior passar.

Uma precisão sobre "só `make format` modifica": `make check` **escreve** em
disco — relatórios de cobertura (`frontend/coverage/`, `htmlcov/`,
`coverage.xml`, `.coverage`), o build (`frontend/dist/`), a saída do
Playwright (`frontend/test-results/`), os caches de `tsc -b`, pytest, mypy e
Ruff. Todos esses caminhos são ignorados pelo git, então `git status`
continua limpo depois de um `make check` e nenhum arquivo versionado muda. A
frase correta é "`make check` não modifica arquivos versionados", não "não
modifica nada". E há um estado fora do disco que ele muda de propósito: o
**banco de teste** (seção 4).

## 2. A regra da direção única

> **Fonte de verdade:** `Makefile` e `.pre-commit-config.yaml`. Esta seção
> explica a regra; quem a **impõe** são os dois arquivos. O `AGENTS.md` §4
> repete a regra de forma resumida — se os dois textos divergirem, arbitre
> pelos arquivos (`grep -rn "pre-commit" Makefile scripts/`; as ocorrências em
> `scripts/` são comentários), nunca por um dos documentos.

```
git hook -> pre-commit -> make -> ferramentas
```

O framework `pre-commit` instala os hooks (`pre-commit`, `pre-merge-commit`,
`pre-push`, via `.pre-commit-config.yaml`) e cada hook invoca um alvo do
Makefile (`make check` para os dois primeiros estágios;
`scripts/check-push.sh`, que por sua vez chama `make bootstrap` e
`make check`, no `pre-push`). O Makefile invoca as ferramentas de fato
(ESLint, Prettier, `tsc`, Vitest, `uv`, Ruff, mypy, pytest, Alembic, Vite,
Playwright, Gitleaks).

**Nenhum alvo do Makefile invoca `pre-commit`.** A dependência é estritamente
descendente: hook chama `make`, `make` chama ferramenta. Se um alvo do
Makefile chamasse `pre-commit` de volta, `make check` executado diretamente
no terminal (fora de um commit) dispararia os hooks novamente, e um commit
dispararia o hook, que chamaria `make check`, que chamaria o hook de novo —
uma recursão sem base de parada óbvia, e um acoplamento que tornaria
impossível rodar o gate isoladamente (por exemplo em CI, ou no
`scripts/check-push.sh`, que precisa rodar `make check` dentro de um
worktree onde não faz sentido reinstalar hooks). Ver README §9: `make check`
é definido como "gate completo, reproduzível e não interativo", que vale
"para qualquer branch" — uma definição que só se sustenta se o alvo puder
ser chamado sozinho, sem pressupor que está sendo executado a partir de um
hook.

## 3. Denominador da cobertura

Os dois ecossistemas exigem 100%, cada um com a sua fonte de verdade.

### Frontend

> **Fonte de verdade:** `frontend/vite.config.ts` — `test.coverage.thresholds`
> para os limiares, `test.coverage.include`/`exclude` para o denominador.
> Esta seção e o `AGENTS.md` §4 apenas **descrevem** o que aquela
> configuração impõe; nenhum dos dois é dono dos números. Se um documento
> disser um valor e o `vite.config.ts` disser outro, o `vite.config.ts` está
> certo e os dois documentos precisam ser corrigidos.

Cobertura de 100% (linhas, ramificações, funções e instruções) é exigida
apenas sobre o que está **dentro** do denominador. O que está **fora** é
excluído deliberadamente, nunca por dificuldade de testar.

**Dentro** (medido, com cobertura de 100% exigida):

- Todo o código-fonte da aplicação em `frontend/src/**/*.{ts,tsx}` que não
  seja teste nem configuração de teste.

**Fora** (excluído do denominador, com a justificativa de cada exclusão):

| Exclusão | Justificativa |
|---|---|
| `frontend/src/**/*.test.{ts,tsx}` | São os próprios testes; cobrança de cobertura sobre o teste que mede a cobertura é circular. |
| `frontend/src/test/**` | Infraestrutura de teste, não código de aplicação: nenhum destes quatro arquivos implementa comportamento do produto, só monta o ambiente ou fabrica dados falsos para outros testes consumirem. `setup.ts` liga o modo de teste do React (`IS_REACT_ACT_ENVIRONMENT`) e limpa o DOM entre testes. `sse.ts` monta quadros e corpos SSE falsos, usados pelo cliente HTTP e pelos hooks da tutoria (mais de um arquivo de teste). `fetchRoutes.ts` (`routeFetch`) é um `fetch` falso roteado por método e URL, que devolve um `Response` **novo** a cada chamada — existe porque o painel da Tifa busca três recursos na montagem e um `Response` só serve uma leitura (o corpo é consumido na primeira). `viewport.ts` (`stubViewport`) fabrica um `matchMedia` falso, porque o jsdom não implementa `window.matchMedia` e o painel decide entre lateral e folha por media query. |
| `frontend/src/**/*.d.ts` | Arquivos de declaração de tipos, sem instruções executáveis — não há linha para cobrir. |
| `frontend/tests/e2e/**` | Cenários do Playwright; nunca estiveram no denominador, que é `src/**`. |
| Dependências (`node_modules/`, `.venv/`, `uv.lock`, `package-lock.json`) | Código de terceiros; o projeto não pode garantir cobertura sobre o que não escreveu. |
| Artefatos gerados (`frontend/dist/`, `frontend/coverage/`, `.tools/`) | Saída de build/instalação, recriada a cada execução; não é código-fonte. |
| CSS e configuração de ferramentas (`vite.config.ts`, `playwright.config.ts`, `eslint.config.js`, `.prettierrc.json`, `tsconfig*.json`) | Configuração declarativa, não lógica de aplicação testável por unidade. |

**Quem é coletado como teste é outra lista, e ela é de negação.** O
denominador acima diz o que é *medido*; o `test.exclude` do
`vite.config.ts` diz o que *roda*:
`exclude: [...configDefaults.exclude, 'tests/e2e/**']` — o padrão do Vitest
(`**/*.{test,spec}.*`) menos a pasta do Playwright. Não é um `include`
estreito, de propósito: `include` é lista de permissão e falha **aberta**
(o teste que ninguém pensou em listar não é coletado e o gate aprova),
`exclude` é lista de negação e falha **fechada** (o que ninguém pensou em
excluir é coletado e, no pior caso, reprova alto). Já aconteceu neste
repositório: com `include: ['src/**/*.test.{ts,tsx}']`, um teste que
reprovava, colocado fora de `src/`, não era coletado e o gate aprovava com
exit 0. Corrigido antes do merge, com a medição registrada no comentário do
próprio `vite.config.ts`.

**Armadilha de leitura: dentro de uma sessão de agente, a tabela por arquivo
sai vazia.** O Vitest 5.0.1 consulta o `isAgent` do `std-env` (4.2.0), que
se liga por variável de ambiente (`AI_AGENT`, `CLAUDECODE`, `CODEX_SANDBOX`,
entre outras), e nesse caso força `skipFull: true` no reporter `text` e
acrescenta o `text-summary`. Medido nesta base: o mesmo
`npm run test:coverage` imprime a tabela com cabeçalho e **nenhuma linha**
quando roda dentro de uma sessão do Claude Code, e a tabela completa, arquivo
por arquivo, quando as variáveis são removidas do ambiente
(`env -u CLAUDECODE -u AI_AGENT npm run test:coverage`). Consequência:
**"tabela vazia" não é evidência de 100%** — ela não distingue "todo arquivo
está completo" de "nenhum arquivo foi medido". O que reprova o gate é o
limiar em `test.coverage.thresholds`, não a tabela; quem precisa afirmar
cobertura lê o resumo (`Coverage summary`, com os quatro eixos e as
contagens) e o código de saída.

### Backend

> **Fonte de verdade:** `pyproject.toml`, seções `[tool.coverage.run]` e
> `[tool.coverage.report]`.

- **Dentro:** `src/focusquest` (`source = ["src/focusquest"]`), com
  cobertura de ramificação ligada (`branch = true`).
- **Limiar:** `fail_under = 100`. O `coverage.py` calcula um único
  percentual total, que combina instruções e ramificações; 100% no total
  exige 100% em cada arquivo.
- **Fora:** `tests/` (os próprios testes) e `alembic/` (as migrações e o
  `env.py`). `alembic/` não fica sem verificação: o Ruff e o mypy estrito o
  cobrem, e os testes de integração aplicam a migração, fazem o downgrade e
  a aplicam de novo. O que fica sem exercício é o caminho
  `run_migrations_offline()` do `alembic/env.py`, que o projeto não usa
  (registrado em `docs/HANDOFF.md`).

Esta lista segue o README §9: "Declare o denominador: testes, dependências,
arquivos gerados, CSS e configuração de ferramentas não são código de
aplicação coberto por essas métricas." Cobertura de 100% sobre este
denominador não prova ausência de bugs nem testa todas as combinações de
estados possíveis — apenas garante que nenhuma linha, ramo, função ou
instrução do código de aplicação ficou sem exercício por pelo menos um
teste.

## 4. Os alvos `check-api` e `check-e2e`

> **Fonte de verdade:** o `Makefile`. Até o Incremento 2 esta seção era o
> contrato de dois alvos que não existiam — um contrato sobre algo ainda não
> escrito só podia morar num documento. Os dois alvos nasceram no Incremento
> 1a, e a fonte de verdade migrou para as receitas, como o próprio contrato
> previa. O que segue é **descrição** do que elas fazem; se divergir do
> `Makefile`, o `Makefile` está certo.

### `check-api`

Cinco receitas, nesta ordem:

1. `uv lock --check` — compara o `uv.lock` com o `pyproject.toml` e reprova
   se estiverem dessincronizados. Não sincroniza nem escreve nada. É a
   **primeira** receita, e não a última: um lock defasado significa que as
   linhas seguintes podem estar verificando versões diferentes das
   declaradas.
2. `uv run ruff check .` — lint, com as regras `E`, `F`, `I`, `UP`, `B` e
   `SIM` (`[tool.ruff.lint]` do `pyproject.toml`). `docs/` fica fora do Ruff
   (`extend-exclude`), porque a documentação mostra código deliberadamente
   errado.
3. `uv run ruff format --check .` — formatação, sem modificar arquivo.
4. `uv run mypy src tests alembic` — mypy com `strict = true` e o plugin do
   pydantic. `alembic/` entra junto porque as migrações escrevem DDL.
5. `uv run pytest --cov ...` — a suíte `tests/unit` e `tests/integration`,
   com o limiar da seção 3.

**O `check-api` precisa de banco.** Os testes de integração usam PostgreSQL
real, nunca SQLite (README §10), no banco apontado por
`FOCUSQUEST_TEST_DATABASE_URL` — `focusquest_test` por padrão, e um banco
próprio por worktree desde a Frente 0 (abaixo). **O banco nasce sob
demanda:** a fixture `engine` chama `criar_banco_se_ausente`
(`tests/integration/banco_de_teste.py`), que conecta ao banco de manutenção
`postgres` do mesmo servidor (derivado da própria URL) e cria o que falta —
só **depois** da mesma guarda dupla do `DROP SCHEMA` (alvo igual ao
configurado **e** nome terminado em `_test`) e de uma recusa a nomes acima de
63 bytes, que o PostgreSQL truncaria em silêncio. A criação mora na fixture, e
não só no `make reset-test-db`, porque no `make check` o `check-api` roda
**antes** do `check-e2e`, e o worktree do pre-push começa sempre com um banco
novo. Nenhum código do projeto apaga um banco (`DROP DATABASE`). A fixture `banco_migrado`
(`tests/integration/conftest.py`) faz `DROP SCHEMA public CASCADE` e migra
do zero uma vez por sessão do pytest — depois de uma guarda que recusa rodar
se o alvo não for exatamente o banco de teste configurado **e** se o nome
dele não terminar em `_test`. Quase todos os testes rodam dentro de uma
transação revertida no teardown; os poucos que precisam provar um `commit`
real ou concorrência escrevem de verdade e apagam, no `finally`, o que eles
mesmos criaram.

### `check-e2e`

- **Pré-requisito `reset-test-db`, desde o Incremento B** (Task 6, commit
  `50e2150`; a fonte de verdade continua sendo o `Makefile`). Antes do B, o
  pré-requisito era `migrate-test` (só migrava);
  agora o `check-e2e` **começa de esquema limpo** — o alvo recria o schema
  `public` do banco de teste do zero (`DROP SCHEMA public CASCADE` +
  `CREATE SCHEMA public`, atrás da guarda compartilhada de
  `tests/integration/banco_de_teste.py`) e reaplica as migrações, antes de
  qualquer cenário. **Motivo (spec do ciclo diário, C17):** o plano semanal
  é único por semana (`uq_weekly_plans_user_id_week_start`); sem esquema
  limpo, um `cycle.spec.ts` que semeia o mesmo plano numa segunda execução
  do `check-e2e` reprovaria com `409 plano_existente`, em vez de rodar de
  novo do zero. Isso **fecha** a pendência sobre linhas acumuladas entre
  execuções do E2E (`docs/HANDOFF.md`, pendência 20): com esquema limpo a
  cada `check-e2e`, não há mais o que acumular — a API do cenário contra um
  banco sem esquema (o cenário antigo que o `migrate-test` evitava)
  continua evitado, agora por um alvo que também apaga o que sobrou.
  **Medido na Task 6** (antes do `cycle.spec.ts` da Task 9): `make
  check-e2e` rodado duas vezes seguidas, sem `check-api` no meio — **11
  passed** nas duas, confirmando o critério de aceite da C17. **Remedido ao
  fim do B** (Task 10, árvore final com o `cycle.spec.ts` da Task 9): `make
  check-e2e` duas vezes seguidas — **13 passed** nas duas (os 11 antigos
  mais os 2 do ciclo), EXIT 0.
- **Build de produção** (`VITE_API_URL=/api npm run build`): a variável vai
  na própria linha porque é embutida no bundle em tempo de build, e o
  `frontend/.env` não existe num clone novo nem no CI.
- **`npx playwright test`**, com as regras de `frontend/playwright.config.ts`:
  `forbidOnly: true` em qualquer ambiente, `retries: 0`, `workers: 1`,
  projeto único em Chromium.
- **Servidores dedicados, subidos pelo próprio Playwright**, com
  `reuseExistingServer: false`: desde o 1b-2 são **três**. O servidor falso
  da Anthropic sobe primeiro, na porta **8150**
  (`PYTHONPATH=tests uv run python -m integration.falso_do_e2e --porta 8150`,
  `frontend/tests/e2e/servers.ts`); a API sobe na porta **8100**
  (`scripts/e2e-env.sh uv run uvicorn ...`, esperada pelo `/ready`, que
  consulta o banco) com `FOCUSQUEST_ANTHROPIC_BASE_URL` apontada para o
  falso; e o frontend na **5273** (`vite preview` do build). As portas de
  desenvolvimento são 8000 e 5173; nenhuma é reaproveitada (README §10).
- **Deslocamento das portas por worktree (Frente 0).**
  `FOCUSQUEST_E2E_PORT_OFFSET` (inteiro, padrão 0) soma o mesmo valor às três
  portas. `frontend/tests/e2e/servers.ts` é a fonte única: lê e valida a
  variável (só dígitos, de 0 a 49 — o vão entre a API e o falso, menos um,
  derivado das portas-base; com 0 a 49 as faixas ficam disjuntas: API
  8100–8149, falso 8150–8199, frontend 5273–5322), e o
  `playwright.config.ts` deriva **todas** as portas dele. O valor chega ao
  Playwright pelo `Makefile`, e só ele: o `Settings` (campo
  `e2e_port_offset`, mesma faixa, ambiente acima do `.env`) o resolve, e a
  receita repassa apenas essa chave. **Faixa por convenção:** 0 a 24 para
  worktrees (0 é o padrão, o do principal) e 25 a 49 reservada ao pre-push,
  que usa o deslocamento de quem empurra + 25 (seção 6). Dois testes conferem
  que os limites do Python, do TypeScript e do `push-env.sh` batem
  (`tests/unit/test_config.py`).
- **`scripts/e2e-env.sh`** aponta `FOCUSQUEST_DATABASE_URL` da API do E2E
  para o banco de **teste** (lido de `Settings().test_database_url`, sem
  repetir a URL) e recusa subir se o nome do banco não terminar em `_test`.
  Desde o 1b-2, o script ganhou duas guardas a mais (Task 6): recusa subir a
  API se o host de `anthropic_base_url` não for loopback (`127.0.0.1`,
  `localhost` ou `::1`) — medido: apontar para
  `'https://api.anthropic.com'` no `playwright.config.ts` faz o
  `make check-e2e` sair **antes de qualquer cenário**, com o texto exato
  `[WebServer] recusando subir a API do E2E com o provedor em
  'api.anthropic.com'; o E2E so fala com o servidor falso em loopback --
  confira FOCUSQUEST_ANTHROPIC_BASE_URL (o playwright.config.ts a define)`
  seguido de `Error: Process from config.webServer was not able to start.
  Exit code: 1` — e **impõe** `FOCUSQUEST_ANTHROPIC_API_KEY=e2e-chave-ficticia`
  por cima de qualquer chave do ambiente ou do `.env` (a chave real mora no
  Keychain, D-a; ver `docs/HANDOFF.md`).
- **O proxy do `vite preview` recebe `API_PROXY_TARGET`** apontando para a
  8100, pelo `env` do `webServer`. Sem isso o proxy cairia no padrão 8000 —
  a API de desenvolvimento — e o cenário poderia **passar** contra o
  servidor errado.
- **axe-core** com o conjunto de regras padrão (sem `withTags` nem
  `disableRules`), exigindo zero violações. No quadro de missões: a lista
  carregada; o erro de carregamento (forçado com `page.route(...).abort()`);
  a missão recém-concluída pelo botão; e o aviso de falha da conclusão (a
  resposta do POST descartada com `route.fetch()` e `route.abort()`, depois
  de o servidor concluir). **Desde o 1b-2** (Task 7), também na tutoria: o
  estado "escrevendo" (resposta presa no meio pelo falso, região viva em
  "Tifa está escrevendo…"), o cartão de proposta, o indisponível (campo e
  Enviar desabilitados) e a folha aberta no celular. **Desde o Incremento C**
  (Task 6), também em Campanhas, **no viewport padrão (desktop)**: a trilha
  da semana carregada, com o plano já semeado (7 dias, hoje concluído, dias
  futuros como baú, especial bloqueada); e o Quartel-General de novo,
  **depois de voltar** a ele pela navegação (o `main` recém-reexibido, não
  só o primeiro carregamento) — as duas auditorias do mesmo cenário (Review
  Focus 2 do plano do C: um só `main` visível por vez). **O celular
  (390×844) de Campanhas não é auditado pelo axe**: o `describe('celular')`
  da Task 6 confere só `side-nav` visível, ausência de rolagem horizontal
  (README §7) e ausência de sobreposição com "Falar com a Tifa" — ao
  contrário do `describe('(e) celular')` da tutoria (1b-2), que já chama
  `semViolacoes` dentro do viewport móvel. **Desde o Incremento D** (Task 9),
  também o painel de progresso no Quartel-General: o cenário que conclui a
  diária pela tela espera o painel e o anúncio da recompensa assentarem
  antes de chamar o axe — inclusive a **espera da opacidade** do anúncio
  chegar a 1 (`expect.poll` sobre `getComputedStyle(el).opacity`, Ruling
  R12), porque o axe pego no meio do `motion-safe:animate-[reward-in…]`
  relatava uma violação de contraste que só existia naquele instante do
  fade-in (a cor final mede 14,73:1, bem acima do exigido); e um cenário
  novo confere as sete conquistas do painel (destravadas e bloqueadas, cada
  uma com texto, nunca só ícone ou cor) sem violação. A barra de progresso
  (`role="progressbar"`) só ganhou o `aria-label` que o axe exige
  (`aria-progressbar-name`) depois que ela foi montada pela primeira vez
  dentro de um E2E de página inteira, na integração da Task 8 — o Vitest da
  Task 6, sob jsdom, nunca a tinha auditado com axe. **Continuam fora**,
  cobertos só no Vitest: o carregando do painel de progresso
  (`progress-loading`) e o estado dele em erro quando `GET /api/progress`
  falha sozinho (`progress-error`; o E2E só exercitou esse estado **junto**
  com outra falha da página — ver `docs/HANDOFF.md`, o diagnóstico da
  Task 8 sobre dois `role="alert"` simultâneos que a integração pegou); o
  carregando do painel da Tifa (esqueleto), o "Enviando…" antes do
  `user_message`, os estados do cartão depois da decisão (executada,
  recusada, falhou) e o aviso de falha do envio (herdados do 1b-2); e, novos
  do C, o celular de Campanhas (acima), o carregando (`trail-loading`), o
  erro (`trail-error`) e o "sem plano" (`trail-no-plan`) da trilha, o aviso
  `trail-stale` de atualização falha, e o botão "Ir ao Quartel-General" da
  trilha (`trail-go-headquarters`) — nenhum dos quatro últimos é alcançado
  pelo cenário semeado do E2E, que sempre tem um plano carregado com
  sucesso (pendência, `docs/HANDOFF.md`).

**Limitação registrada do Incremento D: a mutação `xp_awarded` ↔ `xp_total`
em `RewardAnnouncement` só é provada morta no teste de unidade, não no
E2E.** `RewardAnnouncement.test.tsx` (Task 7) usa uma fixture em que o saldo
anterior (220) e o total depois da conclusão (1340) divergem, e mata a
mutação de verdade. No E2E (`cycle.spec.ts`, Task 9), a mesma mutação foi
aplicada e **não** reprovou: esse arquivo roda primeiro entre os arquivos de
teste (ordem alfabética, `playwright.config.ts` com `workers: 1`), e a
conclusão do cenário é a primeira de toda a suíte E2E — o saldo do usuário
antes dela é 0, então `xp_awarded` e `xp_total` coincidem numericamente e a
asserção `+${xp} XP` passa com qualquer um dos dois campos. Não é uma
lacuna estrutural do E2E — é uma dependência da ordem dos arquivos, já
prevista no brief da Task 9 e registrada como pendência em
`docs/HANDOFF.md`. **Atualização da onda final de correções do D
(`9b7b4ac`):** o cenário do reenvio de `headquarters.spec.ts` passou a
conferir o `+XP` contra o XP da missão lido da API, e ali o saldo anterior
não é 0 — a mesma mutação, aplicada de novo sobre a suíte inteira, reprovou
("+120 XP" no lugar de "+40 XP"). A garantia principal continua sendo o
teste de unidade, que não depende de ordem nenhuma; a pendência 87 foi
riscada.

**O E2E divide o banco de teste do worktree com a suíte pytest** (o
`focusquest_test`, por padrão). É uma decisão deliberada, e duas exigências estruturais a tornam segura: o cenário semeia
**pela API, por HTTP** (nunca por SQL), e afirma **só sobre as linhas que ele
mesmo criou** — cada missão carrega um sufixo único da execução e é
localizada pelo `id` que a API devolveu; desde o 1b-2, todo texto que um
cenário da tutoria localiza — inclusive o que o falso devolve — carrega o
mesmo sufixo `EXECUCAO` (a conversa é uma só, e a tela mostra as últimas 50
mensagens). Dado remanescente não aprova nem reprova o cenário. Duas
consequências operacionais:

- **Rode gates ao mesmo tempo só em worktrees com banco e portas próprios**
  (Frente 0, pendência 19 **resolvida**, `docs/HANDOFF.md`). Dentro de um
  mesmo worktree continua valendo: não rode `check-api` e `check-e2e` ao
  mesmo tempo, nem dois `make check` — a fixture do pytest faz `DROP SCHEMA`
  no banco que a API do E2E está usando, e as portas são as mesmas; o
  resultado é falha alta (500, tabela inexistente, porta ocupada), não
  aprovação silenciosa. **Entre worktrees**, cada um aponta o seu `.env` para
  um banco de nome próprio terminado em `_test` e fixa um
  `FOCUSQUEST_E2E_PORT_OFFSET` distinto (`scripts/novo-worktree.sh` faz as
  duas coisas), e aí os gates rodam juntos. Quem não configura nada fica com
  `focusquest_test` e deslocamento 0 — exatamente o comportamento anterior, e
  portanto sem paralelismo com outro worktree **também** sem configuração.
  **Medido na Frente 0:** dois `make check` simultâneos, um com o padrão e
  outro num worktree criado pelo script (deslocamento 1), aprovaram os dois;
  dois `check-e2e` simultâneos mantiveram as seis portas escutando juntas; e
  dois `make check` junto com um `scripts/check-push.sh` também aprovaram os
  três (números em `docs/HANDOFF.md`, "Resultados"). No CI a corrida não
  existe: cada job tem o próprio serviço PostgreSQL.
- **Desde o Incremento B, cada execução do `check-e2e` começa e termina com
  o banco vazio da própria execução** — não acumula mais entre chamadas
  seguidas (pendência 20, `docs/HANDOFF.md`, **resolvida** na Task 6,
  commit `50e2150`). Antes do B, medido na Task 7 do 1b-2: um `make check` completo
  deixava **6 missões**, **7 mensagens** da tutoria e **2 ações**, e um
  `check-e2e` repetido sem `check-api` no meio acumulava por execução
  (+6/+7/+2, 12/14/4 depois da segunda) — essa medição fica registrada como
  o comportamento **anterior** ao `reset-test-db`, não o atual.

### Validação dos lockfiles — assimetria declarada

**Python: validado localmente e no CI.** `uv lock --check` é a primeira
receita do `check-api`, e `uv sync --locked` roda no `make bootstrap` e no
preparo dos jobs `check-api` e `check-e2e`. Os dois reprovam lock defasado.
O `--frozen`, que o Incremento 2 chegou a usar no `bootstrap`, **não**
serviria: ele usa o lockfile como está, sem compará-lo ao `pyproject.toml`
(medido no Incremento 2 com `uv 0.12.13`: com uma dependência acrescentada
ao `pyproject.toml` sem regravar o lock, `uv sync --frozen` passou, e
`uv sync --locked` e `uv lock --check` reprovaram com "The lockfile at
`uv.lock` needs to be updated").

**npm: validado só no CI.** `npm ci` também reprova um `package-lock.json`
defasado, mas ele roda apenas no `make bootstrap` e no preparo dos jobs
`check-web` e `check-e2e` — o `check-web` local **não** valida o lockfile do
npm. É deliberado: não existe comando barato e confiável que compare
`package.json` com `package-lock.json` sem instalar, e forçar `npm ci`
dentro do `check-web` faria o gate local reinstalar tudo a cada execução.
Consequência, sem eufemismo: **um `package-lock.json` defasado passa no
`make check` local e reprova no CI** — falha fechada, mas no lugar errado.
Quem mexer no `frontend/package.json` roda `npm install` (que regrava o
lock) antes de commitar.

## 5. Integração contínua

O workflow `.github/workflows/quality.yml` é o mesmo gate, executado no
GitHub Actions. Dispara em `push` e `pull_request` de qualquer branch, sem
filtro de caminho, mais `workflow_dispatch` e `merge_group`; permissão
mínima (`contents: read`), sem segredos, sem `continue-on-error`, e com
`cancel-in-progress: false` porque o README §12 proíbe cancelar
verificações anteriores.

> **Fonte de verdade:** `.github/workflows/quality.yml`, confrontado com o
> `Makefile`. A paridade é uma relação entre dois arquivos reais; a tabela
> abaixo e o `AGENTS.md` §4 só a descrevem. Uma divergência se arbitra lendo
> os dois arquivos, não os documentos.

**Paridade 1:1 entre job e alvo do Makefile (decisão D5).** Cada job de
verificação executa **um** alvo, e nada além dele:

| Job | Executa | Preparo de ambiente antes do alvo | `timeout-minutes` |
|---|---|---|---|
| `check-web` | `make check-web` | checkout, `setup-node` (Node 24, cache de npm), `npm ci` | 10 |
| `check-api` | `make check-api` | checkout, `setup-uv`, `uv sync --locked`, serviço PostgreSQL, criação do `focusquest_test` | 15 |
| `check-e2e` | `make check-e2e` | checkout, `setup-node`, `setup-uv`, `npm ci`, `uv sync --locked`, serviço PostgreSQL, criação do `focusquest_test`, `npx playwright install --with-deps chromium` | 25 |
| `check-secrets` | `make check-secrets` | checkout, `actions/cache` do `.tools/` (binário do Gitleaks) | 10 |
| `quality-gate` | nenhum alvo: agrega os quatro acima | — | 5 |

A regra é o que impede o CI e a máquina local de divergirem. Um passo que
existisse só no workflow (ou só no Makefile) criaria uma verificação que
ninguém consegue reproduzir do outro lado, e o primeiro efeito prático
seria um CI vermelho que passa localmente — exatamente o que faz alguém
procurar um jeito de pular o gate. Por isso, quando faltar uma verificação,
ela entra primeiro como alvo do Makefile e só depois ganha um job; nunca o
contrário.

Os passos que o job faz além do alvo são de **preparação de ambiente**, não
de verificação. Há uma exceção de efeito, e ela está declarada na seção 4:
`npm ci` reprova lockfile defasado, então o job verifica o
`package-lock.json` e o gate local não. Três detalhes do preparo que não
são óbvios:

- **Cada job com banco tem o próprio serviço PostgreSQL**, na mesma imagem
  fixada do `compose.yaml` (`postgres:18.6-alpine`), com healthcheck
  `pg_isready -h 127.0.0.1`. É isso que elimina, no CI, a corrida pelo
  `focusquest_test` descrita na seção 4.
- **O `focusquest_test` é criado pelo mesmo `scripts/init-test-db.sql`** que
  o `compose.yaml` monta em `/docker-entrypoint-initdb.d/`: o `services:` do
  Actions não monta esse volume, então o job executa o arquivo com `psql`.
  A DDL do banco de teste padrão tem um lugar só. Os bancos por worktree da
  Frente 0 nascem de `criar_banco_se_ausente` (seção 4); no CI ela encontra o
  `focusquest_test` já criado e não faz nada — o `env:` dos jobs não mudou.
- **As variáveis `FOCUSQUEST_DATABASE_URL` e `FOCUSQUEST_TEST_DATABASE_URL`
  vêm do `env:` do job**, com a credencial local do container de serviço —
  não há segredo do repositório envolvido.

O job `check-secrets` não precisa de preparo de Node, Python nem instalação
de nenhuma ferramenta: `make check-secrets` já baixa o próprio binário do
Gitleaks, fixado por checksum, e um checkout raso basta porque
`gitleaks dir .` varre a árvore de arquivos em disco, não o histórico.

**Cache do Gitleaks e nova tentativa no download.** Até aqui o job baixava
os 21 MB do Gitleaks do GitHub Releases a **cada** execução, sem cache e sem
nova tentativa. No PR #5 uma das duas execuções sobre o mesmo commit
reprovou só por isso — `curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL`
contra `release-assets.githubusercontent.com` —, e a reexecução passou. Era
falha fechada, que é o comportamento certo, mas um gate que reprova por
rede ensina a reexecutar sem ler. Duas mudanças, as duas de **preparo de
ambiente** (o job continua executando só `make check-secrets`):

- **`actions/cache` sobre o `.tools/`**, o diretório que o `Makefile` usa
  quando `FQ_TOOLS_DIR` não está definido. A chave é
  `gitleaks-<os>-<arch>-hashFiles('scripts/install-gitleaks.sh')`: trocar a
  versão ou qualquer hash esperado muda o script e, com ele, a chave, sem
  uma segunda cópia da versão no workflow que pudesse divergir. O cache
  **só é seguro por causa da guarda do script**: antes de aceitar um
  binário que já está no diretório — do cache do Actions, do `.tools/`
  local ou do `FQ_TOOLS_DIR` do pre-push —, `install-gitleaks.sh` confere o
  hash dele contra o `BIN_SHA256`; se não conferir, o binário **não é
  usado**, e só é **substituído** quando o download verificado termina — se
  o download falhar, o binário que não confere continua no disco e o script
  reprova do mesmo jeito. A guarda tem teste que a faz dizer não:
  `tests/integration/test_install_gitleaks.py` planta um binário forjado e
  exige que o script vá à rede em vez de aceitá-lo.
- **Nova tentativa no `curl`** do script, para quando o cache faltar:
  `--retry 5 --retry-delay 5 --retry-max-time 240 --retry-all-errors`, com
  `--connect-timeout 20 --max-time 120`. O `--retry-all-errors` é o que
  importa: `--retry` sozinho só repete timeout e HTTP 408, 429, 500, 502, 503
  ou 504 (`man curl`, seção `--retry`), e **não**
  repete o erro 35 de handshake TLS medido (conferido: com `--retry 2` o
  curl tentou uma vez; com `--retry-all-errors`, três). Existe desde o curl
  7.71.0; o runner `ubuntu-24.04` tem 8.5.0 e o macOS local, 8.7.1.
  Esgotadas as tentativas, o script **continua reprovando** com o código do
  curl — o mesmo teste confere isso.

**O Chromium do Playwright, no `check-e2e`, fica sem cache — de propósito.**
Medido no log do CI: o passo `npx playwright install --with-deps chromium`
faz `apt-get update` (12 MB) e instala pacotes de fonte por apt (21 MB), e
baixa Chrome for Testing (187 MiB), FFmpeg (2 MiB) e Chrome Headless Shell
(114 MiB) para `~/.cache/ms-playwright`. Um cache desse diretório não tira
o apt da rede — a metade de sistema continuaria baixando a cada execução —,
restauraria ~300 MB de outro serviço de rede, e o baixador do Playwright
já repete sozinho (5 tentativas, alternando espelhos; conferido no
`playwright-core` 1.63.0). A instabilidade residual desse passo está
registrada nas limitações (seção 6).

Os jobs rodam em `ubuntu-24.04`, fixado, e não em `ubuntu-latest`: o GitHub
migra o `latest` para o Ubuntu 26 em 2026-10-19, e o gate não deve trocar de
sistema sem que alguém decida (pendência 99 do `docs/HANDOFF.md`). Dependem
da imagem o apt do `playwright install --with-deps`, o curl 8.5.0 do
`scripts/install-gitleaks.sh` e o `psql` pré-instalado, usado nos passos
"Criar o banco de teste". O custo é
subir a versão à mão; a data de revisão está no comentário do workflow.

Os `timeout-minutes` existem porque o padrão do runner é seis horas: um job
travado (o caso óbvio é o Playwright esperando um servidor que não subiu)
deixaria o pull request sem veredito nesse tempo. Os números são uma a duas
ordens de grandeza acima do tempo esperado; o critério de cada um está no
comentário do próprio workflow.

**O agregador `quality-gate` e o `if: always()`.** É o job único que a
proteção da `main` exige como status obrigatório — a lista de `needs`
cresce junto com os jobs, mas a proteção do remoto continua apontando para
um nome só. Ele precisa de `if: always()` porque, sem isso, um `needs` que
falha faz o job dependente ser **pulado**, e um check pulado não reprova
nada: o status obrigatório simplesmente nunca reportaria, e um PR quebrado
apareceria como "sem verificação pendente" em vez de vermelho. Com
`always()`, o job roda sempre e exige o literal `success` de cada uma das
quatro dependências, num laço — `failure`, `cancelled` e `skipped`
reprovam do mesmo jeito. Aprovar por não ter conseguido olhar é o que o
gate proíbe em todas as camadas, e aqui não é diferente.

Limitação registrada e deliberadamente não corrigida: a lista de `needs`
do `quality-gate` e o laço que confere os resultados são estáticos, então
um job novo que alguém esqueça de acrescentar nos dois lugares passaria
despercebido pelo agregador. O conserto (gerar a lista, ou usar uma action
de agregação de terceiros) traz dependência ou metaprogramação de YAML que
não se paga com quatro jobs; revisar quando houver mais.

## 6. Limitações conhecidas

Sem eufemismo:

- **O `pre-push` valida o topo de cada ref enviada, não cada commit
  intermediário.** `scripts/check-push.sh` roda `make bootstrap` e
  `make check` uma vez por ref, no SHA que está no topo dela, em um
  worktree isolado. Se uma revisão no meio da pilha estiver quebrada mas o
  topo da ref corrigir o problema, o `pre-push` aprova o push inteiro sem
  jamais ter validado o commit intermediário isoladamente. Um
  `git bisect` futuro pode pousar em um commit que nunca passou pelo gate.
- **O worktree do `pre-push` recebe a configuração de banco do repositório
  principal.** O worktree criado por `mktemp -d` só tem o que é versionado,
  e o `.env` não é; sem configuração, o `check-api` morreria com
  `ValidationError` e **todo push seria recusado**. Por isso o
  `scripts/check-push.sh` lê o `.env` do repositório principal e exporta
  para o worktree **somente** as linhas que casam
  `^FOCUSQUEST_[A-Z0-9_]*=` — lista de permissão por regex, nunca `source`,
  porque `source` executaria o arquivo. A divisão é no primeiro `=` (uma URL
  com senha contém `=`), aspas envolventes são removidas, e uma variável já
  exportada no shell vence a linha do `.env`. Se
  `FOCUSQUEST_DATABASE_URL` ou `FOCUSQUEST_TEST_DATABASE_URL` continuar sem
  valor, o push é **recusado** com a lista do que falta e as duas formas de
  consertar — nunca degradado para "pular o `check-api`". Três
  consequências: o gate do worktree depende de um arquivo fora dele; um push
  que só **deleta** uma ref também é recusado sem essa configuração (aceito
  de propósito, para não manter um segundo caminho de código quase nunca
  exercitado); e o worktree usa o **mesmo** PostgreSQL da máquina local —
  mas, desde a Frente 0, **não** o mesmo banco de teste nem as mesmas portas
  (o item seguinte). **O que foi e o
  que não foi exercitado:** o `scripts/check-push.sh` executado à mão, pelo
  caminho da entrada padrão, sobre a revisão `96eaeba`, rodou
  `make bootstrap` e `make check` inteiros no worktree temporário, sem `.env`
  nele, e aprovou (cerca de 25 segundos; o worktree foi removido ao fim). O
  caminho das variáveis do framework `pre-commit`, disparado por um
  `git push` de verdade com o `check-api` no gate, ainda não aconteceu.
  O **mecanismo** — a lista de permissão e a recusa — mora em
  `scripts/push-env.sh`, que o `check-push.sh` carrega e chama, e tem teste
  automatizado em `tests/integration/test_push_env.py`, sem push nem
  worktree: a recusa nomeando a variável que falta, uma linha executável
  do `.env` que não executa, um valor com `=` no meio que atravessa inteiro,
  a precedência do ambiente, e uma cópia do `check-push.sh` rodada numa raiz
  sem `.env` (com um `git` falso no `PATH`) para provar que ele passa pela
  função. Cada um desses testes reprovou com a mutação correspondente.
- **O gate do `pre-push` roda em banco e portas próprios** (Frente 0,
  pendência 19). Depois de exportar a configuração, o `check-push.sh` chama
  `isolar_gate_do_push` (`scripts/push-env.sh`): o banco de teste de quem
  empurra ganha `_push` antes do `_test` (`focusquest_test` →
  `focusquest_push_test`; `focusquest_<nome>_test` →
  `focusquest_<nome>_push_test`), continuando sob a guarda do `DROP SCHEMA`
  e nascendo sozinho no gate; e o deslocamento das portas do E2E soma a
  reserva de **25** ao do worktree (0 → 25, 7 → 32). **Faixa:** 0 a 24 para
  worktrees, 25 a 49 para o push; o push de um worktree nunca cai no
  `make check` de nenhum worktree nem no push de outro. O push **recusa**,
  com a instrução, um banco de teste sem o sufixo `_test` e um deslocamento
  fora de 0 a 24. Limites que continuam: dois pushes **do mesmo worktree** ao
  mesmo tempo dividem banco e portas e colidem (empurre uma ref por vez, como
  já manda o `AGENTS.md` §2); e o banco `..._push_test` fica no servidor entre
  um push e outro (o gate recria o esquema dele a cada execução, então não
  acumula dados). Testado sem push nem worktree em
  `tests/integration/test_push_env.py`, com uma mutação reprovando cada
  guarda.
- **Duas execuções simultâneas do `scripts/novo-worktree.sh`.** O
  deslocamento automático é o menor livre entre os `.env` dos worktrees
  registrados; entre ler e escrever o `.env` novo há uma janela (TOCTOU), e
  duas execuções ao mesmo tempo escolheriam o mesmo deslocamento — o mesmo
  vale para a conferência de bancos. O script fecha a janela com uma
  **trava**: um diretório `novo-worktree.lock` no `.git` comum, criado com
  `mkdir` (atômico e portátil; o `flock` não vem no macOS) antes de ler os
  `.env` e removido depois de escrever o novo (ou em qualquer saída, por
  `trap`). A segunda execução **recusa**, sem criar nada, nomeando a trava;
  testado em `tests/integration/test_novo_worktree.py`. O que a trava **não**
  cobre: (1) uma execução morta por `SIGKILL` (ou queda da máquina) deixa o
  diretório para trás, e as seguintes recusam até alguém apagá-lo com
  `rmdir` — a mensagem diz isso; (2) um `.env` de worktree editado à mão, ou
  um worktree criado sem o script, fica fora da trava e pode escolher um
  deslocamento ou banco já em uso — a conferência só vale no momento da
  criação; (3) mudar depois o `.env` do principal (ou de qualquer worktree)
  não reconfere nada.
- **`make db-up` fora do worktree principal recria o container do
  PostgreSQL.** O `compose.yaml` monta `./scripts/init-test-db.sql` por
  caminho relativo; chamado de outro worktree, o bind aponta para outro
  caminho, e o compose trata isso como mudança de configuração. Medido na
  Frente 0 com `docker compose up -d --wait --dry-run postgres` a partir de
  um worktree: `Container focusquest-postgres-1 Recreate`. Recriar o
  container derruba as conexões de todo gate em andamento, em qualquer
  worktree. Por isso o `scripts/novo-worktree.sh` não roda `make db-up`, e o
  PostgreSQL se sobe pelo principal. Consertar exigiria mudar o `compose.yaml`
  (pendência aberta no `docs/HANDOFF.md`).
- **Sob o `pre-commit`, um push multi-ref valida só uma das refs.** O
  framework `pre-commit` consome toda a entrada padrão antes de chamar os
  hooks e repassa o que decidiu em variáveis de ambiente; em
  `_pre_push_ns()` ele percorre as linhas de refs e **retorna na primeira
  ref enviável**. Um `git push remoto main outra` expõe apenas uma das duas
  ao `scripts/check-push.sh`, e não há como recuperar as demais: o conjunto
  de refs de um push depende do refspec da linha de comando, que não chega
  ao hook por nenhum outro canal (as refs de rastreamento do remoto ainda
  refletem o estado *anterior* ao push). O script valida a ref que enxerga e
  não finge ter validado as outras. Pelo caminho da entrada padrão (o
  script instalado como hook nativo do git, ou executado à mão) a cobertura
  multi-ref continua completa. O hábito que fecha o buraco na prática é
  empurrar uma ref por vez.
- **O `pre-commit` não chama hook nenhum quando o push não leva conteúdo
  novo ao remoto.** Em `_pre_push_ns()` (`pre_commit/commands/hook_impl.py`),
  a linha de uma ref é simplesmente pulada (`continue`) quando o SHA local é
  zero (push só de deleção) ou quando `git rev-list` não encontra nenhum
  ancestral que já não esteja no remoto (push de uma tag para um commit já
  presente, ou de uma branch nova apontando para um commit que o remoto já
  tem). Se **todas** as linhas da entrada caem nesses casos, a função
  percorre o laço inteiro sem nunca retornar um namespace e devolve `None`;
  `hook_impl()` então devolve o código do hook legado sem chamar
  `scripts/check-push.sh` — o `pre-push` simplesmente não roda, nem para
  aprovar nem para reprovar. Não é falha de segurança, porque nenhum
  conteúdo novo entra no remoto por nenhum desses três caminhos: não há o
  que validar. Mas quem lê esta documentação precisa saber que, nesses
  casos específicos, o gate não é "aprovado silenciosamente" — ele
  simplesmente não é executado.
- **`git merge --ff-only` e `git rebase` não disparam hook nenhum.** O
  README §11 já avisa que `pre-merge-commit` "não cobre fast-forward nem
  todos os fluxos", e esta seção não listava a consequência: um merge
  fast-forward **não cria commit**, logo não há `pre-commit` nem
  `pre-merge-commit` para disparar; `git rebase` reescreve commits sem
  passar pelo `pre-commit` (o que existe é `pre-rebase`, que este projeto
  não instala, e que de todo modo roda *antes* da reescrita). Na prática
  quem fecha o buraco é o `pre-push`: por mais commits que tenham entrado
  na branch por fast-forward ou rebase, o topo da ref é validado em
  worktree isolado antes de o conteúdo sair da máquina. O que escapa
  continua sendo o commit intermediário (primeira limitação desta lista).
- **Mover o diretório do clone quebra o `.venv` e os hooks.** Os dois
  guardam o caminho **absoluto** de onde foram criados: cada script de
  `.venv/bin/` começa com um shebang para `<caminho antigo>/.venv/bin/python`,
  e cada hook de `.git/hooks/` fixa `INSTALL_PYTHON` no mesmo caminho. Medido
  na retomada de 2026-09-28, com o clone movido de pasta: `make check`
  aprovou o `check-web` e reprovou no `check-api` com
  `error: Failed to spawn: mypy` / `No such file or directory` (o arquivo
  existe; o interpretador do shebang, não). Os hooks falham **fechado**: sem o
  Python do `INSTALL_PYTHON` e sem `pre-commit` no `PATH`, o hook imprime
  `` `pre-commit` not found `` e sai com 1, bloqueando o commit — não o deixa
  passar sem gate. Conserto, da raiz nova: `rm -rf .venv`,
  `uv sync --locked` e `uv run pre-commit install --install-hooks` (o mesmo
  passo de "Primeiro uso após clonar"). O `frontend/node_modules/` não sofre
  disso: os links de `.bin/` são relativos.
- **O gate roda inteiro a cada commit, e fica mais lento conforme o
  projeto cresce.** Medido nesta máquina, com o PostgreSQL já de pé e os
  caches quentes: `make check` completo em cerca de 12 segundos de relógio
  (eram cerca de 2 segundos no Incremento 2, antes do backend e do E2E). É
  uma decisão deliberada do README §11 ("Antes de cada commit, valide o
  conteúdo do índice" sem filtro de arquivos alterados), não um descuido —
  mas o custo é real e vai aumentar. Quando o tempo por commit se tornar
  proibitivo, a solução não pode ser reduzir o que o gate verifica; é
  paralelizar, cachear ou segmentar por escopo, mantendo a garantia de que
  todo o projeto continua verificado antes de cada commit.
- **O CI ainda depende da rede em cada execução, fora o Gitleaks.** O
  `check-e2e` roda `apt-get` e baixa o Chromium a cada execução (seção 5,
  sem cache de propósito); os gerenciadores de pacote (npm, uv) e as
  imagens de serviço também vão à rede, com os caches das próprias actions
  de setup. Uma queda de rede ali reprova o gate — falha fechada, nunca
  aprovação vazia —, e o conserto é reexecutar o job depois de ler o log,
  não afrouxar o passo.
- **O gate local depende de Docker e de um PostgreSQL de pé.** Sem
  `make db-up`, o `check-api` e o `check-e2e` reprovam — alto, por falha de
  conexão, nunca por aprovação vazia. O `/ready` da API do E2E responde 503
  enquanto não consegue consultar o banco, e o Playwright espera até
  120 segundos por ele antes de desistir.
- **Hooks não vêm no clone.** `make bootstrap` **não** instala hooks de git
  — só dependências (npm, Chromium do Playwright, uv, Gitleaks).
  `uv run pre-commit install --install-hooks` precisa ser executado à parte,
  uma vez por clone e uma vez por cada worktree novo (inclusive no PyCharm),
  como descrito em "Primeiro uso após clonar" no início deste documento.
  Enquanto isso não for feito, `git commit` e `git push` funcionam sem
  nenhuma validação, sem aviso nenhum de que o gate não está ativo.
- **Hooks são contornáveis por quem controla o Git.** Mesmo instalados,
  quem tem acesso ao repositório local pode usar `--no-verify`, `SKIP`,
  editar ou apagar `.pre-commit-config.yaml`, ou desinstalar os hooks.
  Nada nesta camada impede isso: **a proteção real é a do remoto**. A `main`
  do GitHub é protegida e exige o status `quality-gate`, com base
  atualizada, `enforce_admins` ativo e sem force-push nem deleção
  (README §12; conferido com `gh api` na proteção da branch). Os hooks
  locais existem para dar feedback rápido e reduzir o volume de commits
  quebrados que chegam ao CI, não para substituir a proteção do remoto.
- **O `gitleaks dir .` do `check-secrets` varre também arquivos ignorados
  pelo git** (1b-2, decisão D-a) — `.env` incluído, mesmo com ele no
  `.gitignore`. Medido em 2026-09-22, num repositório descartável: com uma
  chave fictícia `sk-ant-api03-...` dentro de um `.env` ignorado, o Gitleaks
  8.30.1 com o `.gitleaks.toml` deste projeto deu `leaks found: 1`, EXIT 1.
  É por isso que a chave real da Anthropic **não** mora no `.env` — mora no
  Keychain do macOS, fora do repositório (ver `docs/HANDOFF.md`). O
  `.gitleaks.toml` **não** mudou para acomodar isso: nenhuma exceção nova
  foi aberta.

## 7. Como atualizar o Gitleaks

A versão do Gitleaks é fixada em `scripts/install-gitleaks.sh`
(`VERSION="8.30.1"` hoje) e verificada por **dois** checksums SHA-256
distintos, por plataforma — não apenas um:

1. `SHA256`: o checksum do **tarball** (`.tar.gz`) baixado do GitHub
   Releases, antes de extrair.
2. `BIN_SHA256`: o checksum do **binário `gitleaks` já extraído** do
   tarball. É esse segundo valor que permite o cache idempotente: em
   execuções seguintes, `install-gitleaks.sh` confere o binário que já
   está em `.tools/gitleaks` contra `BIN_SHA256` e, se bater, não baixa
   nada. Sem ele, o script teria que sempre baixar e reextrair para
   conferir o tarball, ou confiar cegamente no binário em cache sem
   verificação — as duas opções ruins que a checagem em dois níveis evita.
   É também o que torna seguro o `actions/cache` do job `check-secrets`
   (seção 5).

A chave desse cache no CI é o hash do próprio `scripts/install-gitleaks.sh`,
então atualizar a versão invalida o cache sozinho: não há nada a trocar no
workflow.

Para atualizar para uma nova versão `X.Y.Z`, os dois valores precisam ser
obtidos e trocados juntos, por plataforma (`darwin_arm64` e `linux_x64`
hoje). Esquecer o `BIN_SHA256` e atualizar só o `SHA256` do tarball quebra
a instalação na próxima execução, porque o binário em cache (da versão
antiga) vai falhar a checagem contra o novo `BIN_SHA256` que não foi
atualizado, forçando um download — o que ainda funciona, mas mascara o
esquecimento; o problema real aparece quando alguém tenta auditar os dois
valores e descobre que só um mudou.

Passo a passo:

```bash
# 1. Baixa a lista de checksums oficiais dos tarballs da nova versao.
curl -sL "https://github.com/gitleaks/gitleaks/releases/download/vX.Y.Z/gitleaks_X.Y.Z_checksums.txt" \
  | grep -E 'darwin_arm64|linux_x64'
# Isto da o SHA256 de cada tarball (gitleaks_X.Y.Z_darwin_arm64.tar.gz e
# gitleaks_X.Y.Z_linux_x64.tar.gz). Troque VERSION e os dois SHA256 em
# scripts/install-gitleaks.sh.

# 2. Para cada plataforma, baixe o tarball, extraia o binario e calcule o
# checksum do binario extraido -- este NAO vem publicado pelo projeto
# Gitleaks, precisa ser calculado localmente apos a extracao:
curl -sL -o /tmp/gitleaks.tar.gz \
  "https://github.com/gitleaks/gitleaks/releases/download/vX.Y.Z/gitleaks_X.Y.Z_darwin_arm64.tar.gz"
tar -xzf /tmp/gitleaks.tar.gz -C /tmp gitleaks
shasum -a 256 /tmp/gitleaks
# O valor impresso vai para BIN_SHA256 da plataforma correspondente em
# scripts/install-gitleaks.sh. Repita para cada plataforma suportada
# (trocando o nome do asset), rodando em uma maquina daquela arquitetura
# ou emulando-a -- o binario nunca deve ser confiado sem essa checagem
# calculada de forma independente do proprio download.
```

Depois de trocar `VERSION`, `SHA256` e `BIN_SHA256` (os dois, por
plataforma), apague `.tools/gitleaks` local e rode `make bootstrap` para
confirmar que o download, o checksum do tarball e o checksum do binário
extraído batem antes de commitar a mudança.

## 8. Por que `.superpowers/sdd/` está excluído do `.gitleaks.toml`

O `[allowlist]` em `.gitleaks.toml` exclui da varredura de segredos um único
caminho: `^\.superpowers/sdd/`. Esse é o diretório de scratch do processo de
execução dos agentes (planejamento, relatórios de tarefa). Relatórios ali
dentro documentam, por exigência de rastreabilidade, os blocos de segredo de
teste usados para validar a própria detecção do Gitleaks — `task-4-report.md`
e `task-6-report.md` contêm as chaves privadas plantadas e removidas nas
demonstrações. Sem a exclusão, `make check` reprovaria sempre que um desses
relatórios existisse no disco, mesmo sem nunca chegar a um commit, e
documentar as demonstrações do gate exigiria desligar a varredura por
completo.

**O que esta exclusão garante, e o que ela não garante.** A redação anterior
desta seção dizia que o diretório "está ignorado pelo git e nunca é
commitado, portanto nunca pode vazar". Eram duas afirmações falsas:

- **A isenção era mais larga que o `.gitignore` que a justificava.** O
  `allowlist` cobria `^\.superpowers/` inteiro, mas o único `.gitignore` que
  sustentava a premissa era `.superpowers/sdd/.gitignore`, que cobre apenas
  `sdd/`. Demonstrado: uma chave privada em `.superpowers/notas/segredo.md`
  aparecia como arquivo **não rastreado** em `git status` — isto é,
  commitável — e `make check-secrets` retornava 0. Era o único caminho
  conhecido em que algo entrava no repositório sem passar pelo gate. Corrigido
  em duas frentes: o path da allowlist foi estreitado para
  `^\.superpowers/sdd/`, e a raiz `.gitignore` passou a listar
  `.superpowers/`.
- **A proteção citada não vinha no clone.** `.superpowers/sdd/.gitignore`
  declara `*`, e esse `*` ignora o próprio arquivo: ele nunca foi versionado
  e portanto nunca chegou a um clone. A justificativa apoiava-se em um
  arquivo que só existia na máquina onde foi criado. Quem sustenta a regra
  hoje é a linha `.superpowers/` da raiz `.gitignore`, essa sim versionada.

Depois da correção, o que vale é: nenhum arquivo sob `.superpowers/` entra no
histórico pelo caminho normal, porque a raiz `.gitignore` o ignora; e o que
está fora de `.superpowers/sdd/` é varrido pelo Gitleaks como qualquer outro
caminho, de modo que as duas camadas se cobrem em vez de uma delas ser
imaginária. Isso ainda **não** é impossibilidade de vazamento: `git add -f`
continua podendo forçar a entrada de um arquivo ignorado, e a varredura não
tem como impedir isso em `.superpowers/sdd/`. A garantia é a do caminho
normal, não a de todos os caminhos possíveis.

A exclusão é estreita e específica: `.superpowers/notas/` ou qualquer outro
subdiretório de `.superpowers/`, `frontend/coverage/`, `frontend/dist/` e o
restante do projeto continuam sendo varridos de verdade. Uma ressalva
honesta à frase "todo o resto continua sendo varrido": `node_modules/` não é,
porque a **allowlist padrão do Gitleaks** já o exclui — não é decisão deste
projeto, mas o efeito prático é o mesmo e vale estar escrito.

## 9. O servidor falso da Anthropic (Incrementos 1b-1, 1b-2 e E)

> **Fonte de verdade:** `tests/integration/provedor_falso.py`,
> `tests/integration/conftest.py` (fixtures `falso`, `fabrica`, `tutoria`,
> `conversa`), `tests/conftest.py` (a guarda de sessão) e, desde o 1b-2,
> `tests/integration/falso_do_e2e.py` (o processo e o controle) e
> `scripts/e2e-env.sh` (a guarda de loopback e a chave imposta).

### Onde mora, e por que não existe "modo falso" em `src/`

O falso é um servidor HTTP de verdade (`ServidorAnthropicFalso`, em
`tests/integration/provedor_falso.py`) que fala o formato SSE da API de
Mensagens da Anthropic. Ele mora em `tests/`, nunca em `src/`: a decisão D8
da spec do 1b (`docs/superpowers/specs/2026-09-18-incremento-1b-design.md`)
aponta o `anthropic_base_url` do SDK **real** para ele nos testes
(`FOCUSQUEST_ANTHROPIC_BASE_URL`, via `dependency_overrides` de
`get_tutoria`) — em vez de existir um `if modo_de_teste:` em
`src/focusquest/modules/tutoring/anthropic_provider.py` que decidisse, em
produção, se fala com a Anthropic de verdade ou com um dublê. Um `if` desses
seria uma chave que alguém poderia deixar ligada em produção; sem ele, o
código de produção não tem ideia de que o falso existe, e o adaptador
inteiro — inclusive a leitura que o SDK oficial faz do stream — é o mesmo
código nos dois lados.

### Camadas 1 e 2: o que cada uma pega

O risco do desenho acima é o falso divergir do formato real sem que nada
acuse. Três camadas cobrem isso; as duas primeiras existem desde o 1b-1, a terceira desde o 1b-2:

1. **Construído com os tipos do SDK fixado.** Cada evento do roteiro
   (`eventos_do_roteiro`) é uma instância dos tipos do próprio `anthropic`
   (`RawMessageStartEvent`, `RawContentBlockStartEvent`,
   `RawContentBlockDeltaEvent`, `RawContentBlockStopEvent`,
   `RawMessageDeltaEvent`, `RawMessageStopEvent`), serializada pelo Pydantic
   deles — não há JSON escrito à mão. Isso pega um campo com nome ou tipo
   errado no momento em que o `mypy --strict` roda sobre `tests/`, antes de
   qualquer teste executar.
2. **Teste de contrato**
   (`tests/integration/test_provedor_falso.py`), rodando o SDK **real**
   (`anthropic==1.7.0`) contra o falso: confere que a `Message` que o SDK
   monta do stream tem o texto e o `tool_use` esperados. Isso pega o que a
   camada 1 não vê — um evento **estruturalmente válido**, mas fora da
   sequência que o parser interno do SDK espera (por exemplo, um
   `content_block_delta` sem o `content_block_start` correspondente antes).
   **Visto reprovando por mutação** antes de valer: removido o
   `content_block_start` do ramo de `ChamadaDeFerramenta`, o SDK real explode
   com `IndexError` dentro do próprio
   `anthropic/lib/streaming/_messages.py` — a guarda reprova o teste, não
   silencia o defeito. Se uma atualização futura do `anthropic` no
   `uv.lock` deixar de entender o falso, é esta camada que acusa no gate.

### Camada 3: a sequência da API real

A camada 3 existe desde a Task 8 do 1b-2. As camadas 1 e 2 provam que o falso
é válido **para o SDK**; esta prova que ele se parece com o que a API
**manda**.

- **Como a referência foi gravada.** Por um script próprio,
  `tests/integration/camada3.py`, numa segunda chamada real (a primeira é a do
  roteiro pela tela, pendência 42 do `docs/HANDOFF.md`), uma vez, pelo dono,
  com a chave vinda do Keychain só para o processo. A requisição usa as mesmas
  peças de produção (o sistema de `montar_turno`, a ferramenta, o modelo e o
  `max_tokens` do `Settings`), e o script lê as linhas **cruas** do stream
  (`with_streaming_response`), porque o SDK descarta o que não usa. O arquivo,
  `tests/integration/referencia_da_api_real.json`, guarda só nomes de evento e
  o tipo de cada bloco ou delta (repetições seguidas colapsadas), mais a data,
  a versão do SDK e o modelo — nunca texto, ids ou a chave; um teste
  (`test_a_referencia_gravada_nao_tem_conteudo`) confere a forma. O script
  recusa gravar se o `anthropic_base_url` não for `api.anthropic.com`
  (`test_a_captura_recusa_gravar_o_que_nao_e_a_api_real`).
- **O que a comparação retira.** Só `DESCARTADOS_PELO_SDK`, hoje `ping`; um
  teste (`test_o_sdk_fixado_ainda_descarta_ping`) lê a fonte do `anthropic`
  instalado e reprova se ele deixar de descartar.
- **O que ela achou.** A API real (`claude-opus-5`) manda um bloco de
  **thinking** antes do texto, sem a requisição pedir. O falso passou a
  emiti-lo por padrão (emenda E6 da spec, decisão do dono), e
  `test_o_thinking_da_api_nao_chega_ao_dominio` prova que o adaptador de
  produção o descarta. Consequência para quem escreve teste: as contagens de
  eventos do falso incluem os 4 eventos do thinking; "depois do primeiro
  pedaço de texto" é `APOS_O_PRIMEIRO_PEDACO` (7), e o E2E escreve o mesmo 7,
  amarrado por `test_o_e2e_segura_e_corta_no_mesmo_ponto_que_o_pytest`.
- **Visto reprovando:** trocar `message_delta` por `message_deltaX` na
  referência reprova `test_o_falso_emite_a_sequencia_da_api_real`; desligar o
  thinking do falso também.
- **O que ela não prova.** Que a API não mude amanhã: a referência é uma
  fotografia datada, de um modelo e de uma versão do SDK, e de **uma**
  resposta (texto e proposta). Regravar é só pelo dono, com o comando da
  seção "Comandos" do `docs/HANDOFF.md`, nunca no gate — o CI nunca chama a
  Anthropic.

### A avaliação nas camadas 1 e 2 (Incremento E)

O E acrescentou ao provedor um segundo método, `avaliar(turno, ferramenta)`, no
mesmo adaptador (decisão E12): `messages.stream` com **`tool_choice: {"type":
"auto", "disable_parallel_tool_use": true}`**, a ferramenta com **`strict:
true`** e o sistema da avaliação mandando chamá-la (a emenda **EM3** da spec,
que trocou o `tool_choice` forçado), `max_tokens` próprio (2048), sem pedir
thinking e consumindo o stream inteiro por dentro. Só o **`stop_reason`
`tool_use`** entrega a entrada da ferramenta; qualquer outra parada
(`max_tokens`, `end_turn`) devolve `None`, que o serviço grava como
`avaliacao_invalida`. **Nenhum servidor falso novo:** o `ServidorAnthropicFalso`
das camadas 1 e 2 serve a avaliação como serve a conversa.

- **O falso roteirizado com `tool_name`.** O `ChamadaDeFerramenta` do roteiro
  em Python (`provedor_falso.py`) **já** tinha o campo `nome`, com padrão
  `create_mission`, antes do E; o E **não** o alterou. O que o E acrescentou
  (Task 4) foi o `tool_name` no **JSON do controle do falso do E2E**
  (`falso_do_e2e._bloco`) e no tipo `Bloco` de `frontend/tests/e2e/falso.ts`:
  até então um cenário de E2E só conseguia roteirizar `create_mission`, e agora
  escolhe a ferramenta. O padrão continua `create_mission`, então nada do que
  existia muda. No JSON do
  roteiro (`roteiro_do_json`, chave `blocks`) o bloco é `{"tool_input": {...}}`
  (padrão) ou `{"tool_input": {...}, "tool_name": "record_evaluation"}`;
  `tool_name` precisa ser um texto **não vazio**, senão `roteiro_do_json`
  levanta `ValueError` ("tool_name precisa ser um texto nao vazio"), e
  qualquer outra forma de bloco continua sendo "bloco desconhecido". O tipo
  `Bloco` de `frontend/tests/e2e/falso.ts` acompanha. Provado do lado Python por
  `tests/integration/test_falso_do_e2e.py`
  (`test_tool_name_escolhe_a_ferramenta_e_o_padrao_e_create_mission` e dois
  casos de recusa: `tool_name` não texto e `tool_name` vazio); **visto
  reprovando** por mutação (o `_bloco` ignorando `tool_name`).
- **O falso roteiriza o `stop_reason`.** O `Roteiro` de `provedor_falso.py`
  ganhou o campo `stop_reason` (`end_turn`, `tool_use` ou `max_tokens`); sem ele
  vale o de antes (`tool_use` com ferramenta, `end_turn` sem). Provado por
  `test_o_roteiro_escolhe_o_motivo_de_parada`; **visto reprovando** por mutação
  (o `stop_reason` fixado em `None`). É o que permite testar a parada por
  `max_tokens`, que deixa uma entrada possivelmente parcial.
- **`avaliar` testado contra o falso** (`tests/integration/test_evaluation_provider.py`,
  10 testes), com o SDK real, camadas 1 e 2: devolve a entrada da ferramenta;
  **pede `tool_choice` `auto` com `disable_parallel_tool_use` e a ferramenta
  `strict`** (o teste lê a requisição recebida pelo falso, e confere o nome, o
  `input_schema` igual ao esquema publicado, o `system` e as `messages`, e que
  `thinking` não vai no corpo); manda o `max_tokens` próprio da avaliação (2048,
  e não o do chat); sem chamar a ferramenta devolve `None`; **ignora** uma
  chamada de outra ferramenta; um stream cortado sem `message_stop`, ou com a
  ferramenta completa mas **sem** `message_stop`, é `ProvedorIndisponivelError`;
  uma resposta parada por `max_tokens` devolve `None`; erro HTTP é
  `ProvedorIndisponivelError`; demora além do limite é `TempoEsgotadoError`.
  **Vistos reprovando** por mutação: sem `strict`, sem `disable_parallel_tool_use`,
  `max_tokens=self._max_tokens`, sem conferir o `name` do bloco, sem a checagem
  de `message_stop`, sem a guarda do `stop_reason`, e o corpo com o esquema da
  proposta, outro `system` ou outras `messages`.
- **`avaliar_missao` testado contra o mesmo falso**
  (`tests/integration/test_evaluation_service.py`, `test_evaluation_records.py`,
  `test_evaluation_api.py` e `test_evaluation_concorrencia.py`, com o servidor
  falso e o relógio injetável, **sem `sleep` para simular o tempo**: o relógio é
  injetado; a concorrência usa uma espera ativa curta, um `time.sleep(0.01)` num
  laço que espera a trava aparecer em `pg_stat_activity`, e um encontro com teto
  de 1,0 s): os três vereditos com e sem
  bônus; o pedido repetido **sem chamar o falso** (contador zero); `sem_evidencia`
  sem chamar o falso; provedor fora, tempo esgotado e saída inválida, cada um
  gravado como `falhou` **antes** do erro, e a nova tentativa funcionando
  depois; o limite total (na borda exata, `>`); o corte do órfão e a folga; a
  resposta atrasada de uma tentativa superada sem sobrescrever; a injeção na
  evidência (que chega dentro do JSON do turno, nunca no `system`, e não mexe no
  bônus); e, em conexões reais, dois pedidos simultâneos com um só avaliando e
  no máximo um bônus. **O teste de concorrência precisou de um segundo ponto
  de encontro:** com uma barreira só na largada, ele detectava 0 de 5 com a
  trava removida (medido); com o encontro depois da primeira leitura de
  `mission_evaluations`, 5 de 5. O teste verde leva cerca de 1,7 s.
- **O vocabulário de erro é um só.** `FalhaDaAvaliacao`
  (`provedor_indisponivel`, `tempo_esgotado`, `avaliacao_invalida`) é
  amarrada por teste a `CodigoDoStream`: os dois primeiros valores são
  subconjunto dele, e `avaliacao_invalida` **não** existe no stream (só a
  avaliação tem "o modelo não chamou a ferramenta ou mandou saída fora do
  esquema"). Um erro do provedor sai igual na conversa e na avaliação porque
  `_traduzir_erros` (`anthropic_provider.py`) é compartilhado. A lacuna que a
  mutação de **metade** de um ramo dele achou (Task 5a) foi fechada pela Task 5b:
  `tests/unit/test_traducao_de_erros.py` tem um caso por meia-cláusula, e cada
  mutação reprova o seu. O que segue aberto é a fusão dos 4xx de configuração em
  `provedor_indisponivel`, sem log da causa (pendência 100 do
  `docs/HANDOFF.md`).

### Camada 3 da avaliação: não existe, é pendência

A referência da camada 3 (`tests/integration/referencia_da_api_real.json`)
guarda **uma** resposta real, de **texto e proposta** da conversa. As camadas 1 e
2 provam que o adaptador de `avaliar` fala com o SDK fixado e que o serviço trata
cada saída; **nenhuma prova o que só a API real responde**, e o `strict` **nem é
validado pelo falso** (ele não simula a checagem do esquema). Não medido:
(a) que o `claude-opus-5`, que manda um bloco de thinking sem que a requisição o
peça (seção acima), **chama** `record_evaluation` com `tool_choice: auto` e a
instrução do sistema, em vez de responder em texto (que vira `avaliacao_invalida`);
(b) que a API aceita o esquema `strict` da rubrica (`additionalProperties: false`,
sem `minLength`/`maxLength`); (c) o formato real da sequência de eventos da
avaliação. A escolha do `auto` (EM3) vem da referência oficial da API, **não de
uma chamada real**. É a pendência 91 do `docs/HANDOFF.md`: uma chamada real de
avaliação, **pelo dono**, com a chave do Keychain só para o processo da API,
gravando a sequência de tipos de evento — o mesmo roteiro da pendência 42. Se a
API recusar o esquema, o erro sai como `502 provedor_indisponivel` **gravado**,
nunca como bônus. Como a camada 3 da conversa, **o CI nunca chama a Anthropic**.

### O falso como processo (E2E)

Desde o 1b-2 (Task 6), o E2E do Playwright precisa do falso **fora** do
processo do pytest — como um servidor de verdade, na porta 8150 (mais o
deslocamento do worktree, desde a Frente 0; seção 4), com o
tempo de vida da suíte inteira do `check-e2e`. `tests/integration/falso_do_e2e.py`
(`python -m integration.falso_do_e2e --porta N`, `PYTHONPATH=tests`) sobe o
**mesmo** `ServidorAnthropicFalso` das camadas 1 e 2, com um `TratadorComControle`
que estende `TratadorDoFalso` e acrescenta rotas sob `/_control/` (definir o
roteiro, liberar uma resposta presa, reiniciar, listar requisições recebidas)
— um contrato HTTP entre o cenário TypeScript (`frontend/tests/e2e/falso.ts`)
e o falso Python, com chaves de payload em inglês. Isso **não** é um "modo
falso" novo: o controle mora inteiramente em `tests/`, nunca em
`src/focusquest/`, e a API do E2E continua sendo a de produção
(`focusquest.main:app`), só apontada para o falso por
`FOCUSQUEST_ANTHROPIC_BASE_URL` — a mesma peça (`dependency_overrides` de
`get_tutoria`) que já existia desde o 1b-1 para o pytest. O contrato do
controle é provado do lado Python por `tests/integration/test_falso_do_e2e.py`
(18 testes, dois deles subindo o processo de verdade).

### O E2E da avaliação (Incremento E)

`frontend/tests/e2e/evaluation.spec.ts` roda o circuito inteiro contra o falso
como processo, com o bloco `{"tool_input": {...}, "tool_name":
"record_evaluation"}` no roteiro. Um cenário, que: conclui uma missão criada pela
API **com evidência** pela tela; pede "Pedir avaliação da Tifa"; vê o selo do
veredito ("Critério atendido", com `exact: true`, porque a região viva também diz
"Avaliação concluída: Critério atendido."), o **rótulo fixo** "Avaliação da Tifa —
interpretação do modelo, não verificação automática", o `+N XP de bônus` (com `N` =
metade do XP da missão lida da API) e o total do painel como delta do
`GET /api/progress` de antes. **As asserções sobre o pedido ao falso são as da
EM3:** o fluxo inteiro faz **uma** requisição ao modelo (`toHaveLength(1)`, para
pegar uma chamada extra sem a ferramenta); nela, `tool_choice` é exatamente
`{type: 'auto', disable_parallel_tool_use: true}`, `tools` é `[{name:
'record_evaluation', strict: true, ...}]` e o `system` cita `record_evaluation`.
Depois espera o fade-in do anúncio assentar (`expect.poll` na opacidade, R12 do D)
e roda o **axe** na página com o cartão avaliado (`violations == []`); recarrega e
confere o veredito, "Bônus de XP creditado ao seu saldo." (EM1) e o mesmo total,
lidos do servidor. **Vistas reprovando (`make check-e2e`):** o rótulo sem "—
interpretação do modelo…"; `// 1` no lugar de `// 2` no bônus; o `tool_choice`
forçado (M3a) e sem `strict` (M3b); `text-slate-700` no rótulo (o axe acusa
`color-contrast`); e, no lote ME, a frase do sistema sem `record_evaluation` e a
chamada extra ao modelo antes de `avaliar`. **O que ele não prova:** o `strict` e o
`auto` são afirmados no **pedido**, contra o falso; que a API real os aceita e
que o modelo chama a ferramenta é a pendência 91 (camada 3).

### A guarda de `tests/conftest.py`: nenhum teste alcança a Anthropic

`tests/conftest.py` declara uma fixture de sessão, `autouse=True`, que
aponta `FOCUSQUEST_ANTHROPIC_BASE_URL` para `http://127.0.0.1:9` — a porta
do serviço `discard`, fechada em qualquer máquina de desenvolvimento e no
runner do CI — **antes** do primeiro teste da suíte inteira. A chave de
verdade mora no Keychain do macOS (decisão D-a, 1b-2), nunca no `.env`; a
guarda protege contra o erro — uma chave posta por engano no ambiente ou no
`.env` local do dono, e contra o `pre-push`, que exporta toda variável
`FOCUSQUEST_*` do `.env` para o worktree do gate (`docs/QUALITY.md` §6).
Sem esta guarda, um teste que esquecesse de trocar o provedor pelo servidor
falso faria uma chamada **paga** — e passaria, o que é pior que reprovar.
Com a guarda, o esquecimento vira erro de conexão imediato. A variável de
ambiente vence o `.env` na ordem de fontes do pydantic-settings, e o escopo
de sessão a instala antes de qualquer teste, inclusive os que nunca tocam a
tutoria. **Provado com a chave exportada no ambiente** (Task 8 Step 1 do
1b-2, regressão): `tests/unit/test_config.py::test_a_guarda_vale_com_a_chave_exportada_no_ambiente`
põe `FOCUSQUEST_ANTHROPIC_API_KEY` no ambiente do processo e confere que o
`anthropic_base_url` continua `http://127.0.0.1:9` — a guarda não depende de
a chave estar ausente, só do endereço.

### Por que a desconexão precisa de um uvicorn real, e não do `TestClient`

O contrato do 1b exige que uma resposta abandonada no meio vire
`interrompida`, nunca fique presa em `gerando`. Medido (M9 do plano de
implementação): o `TestClient` do Starlette **bufferiza a resposta
inteira** — o gerador síncrono do `StreamingResponse` roda até o fim mesmo
que o teste pare de ler no meio, porque não existe conexão TCP de verdade
para cair. Testar a desconexão com `TestClient` teria passado sem exercitar
nada do mecanismo real.

Por isso `tests/integration/test_tutoring_desconexao.py` sobe um `uvicorn`
de verdade numa thread, conecta um cliente HTTP real
(`httpx.Client(...).stream(...)`) e fecha essa conexão no meio do stream. O
que esse teste **prova**: ponta a ponta, com um socket real caindo, a
resposta termina gravada como `interrompida`. O que ele **não prova**: qual
das duas guardas (`fechando_ao_cancelar` em `sse.py`, ou o
`finally: eventos.close()` de `router._em_sse`) fechou a cadeia — nesta
máquina, medido, a cadeia fecha mesmo com as duas removidas, só que 3 a 11
segundos depois, por um mecanismo diferente (a escrita do próximo evento no
socket já morto falha, e essa falha aciona a finalização automática de
generator do CPython). O detalhe completo dessa medição, e por que as duas
guardas continuam no código mesmo assim, está na emenda correspondente de
`docs/superpowers/specs/2026-09-18-incremento-1b-design.md` e em
`docs/HANDOFF.md`. A prova de que **cada guarda**, isolada, faz o gerador
fechar é determinística e não depende de rede nem de tempo:
`tests/unit/test_tutoring_sse.py::test_cancelar_o_consumo_fecha_o_gerador`
(o invólucro) e
`tests/unit/test_tutoring_router_sse.py::test_fechar_o_em_sse_fecha_o_gerador_de_eventos`
(o `finally`).
