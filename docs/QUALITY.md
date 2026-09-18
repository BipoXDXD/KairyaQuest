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
`make migrate-test` à parte não é estritamente necessário — o `check-e2e`
o declara como pré-requisito, e a fixture do pytest migra o banco de teste
por conta própria —, mas rodá-lo sozinho mostra uma falha de migração
isolada, antes de ela aparecer misturada ao resto do gate.

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
| `make check-e2e` | Pré-requisito `migrate-test`; depois o build de produção do frontend com `VITE_API_URL=/api` e o Playwright em Chromium, com axe-core. Detalhe na seção 4. |
| `make check-secrets` | Instala o Gitleaks (idempotente) e varre o repositório inteiro em busca de segredos, com `--config .gitleaks.toml`. |
| `make format` | **Modifica** arquivos: aplica o Prettier (`prettier --write`) no frontend. Nunca é chamado por `check` nem por qualquer hook — é a única forma de o gate alterar arquivos **versionados**, e é manual. |
| `make db-up` | `docker compose up -d --wait postgres`: sobe o PostgreSQL do `compose.yaml` e só devolve o controle com o healthcheck aprovado. |
| `make db-down` | `docker compose down`: derruba o container **preservando** o volume (não usa `-v`). |
| `make migrate` | `uv run alembic upgrade head` no banco de **desenvolvimento**. |
| `make migrate-test` | `uv run alembic -x test=true upgrade head` no banco de **teste**. |

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
| `frontend/src/test/**` | Infraestrutura de teste (setup do ambiente jsdom), não código de aplicação. |
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
real, nunca SQLite (README §10), no banco `focusquest_test` apontado por
`FOCUSQUEST_TEST_DATABASE_URL`. A fixture `banco_migrado`
(`tests/integration/conftest.py`) faz `DROP SCHEMA public CASCADE` e migra
do zero uma vez por sessão do pytest — depois de uma guarda que recusa rodar
se o alvo não for exatamente o banco de teste configurado **e** se o nome
dele não terminar em `_test`. Quase todos os testes rodam dentro de uma
transação revertida no teardown; os poucos que precisam provar um `commit`
real ou concorrência escrevem de verdade e apagam, no `finally`, o que eles
mesmos criaram.

### `check-e2e`

- **Pré-requisito `migrate-test`:** a API do cenário contra um banco sem
  esquema responderia 500, com o sintoma longe da causa.
- **Build de produção** (`VITE_API_URL=/api npm run build`): a variável vai
  na própria linha porque é embutida no bundle em tempo de build, e o
  `frontend/.env` não existe num clone novo nem no CI.
- **`npx playwright test`**, com as regras de `frontend/playwright.config.ts`:
  `forbidOnly: true` em qualquer ambiente, `retries: 0`, `workers: 1`,
  projeto único em Chromium.
- **Servidores dedicados, subidos pelo próprio Playwright**, com
  `reuseExistingServer: false`: a API na porta **8100**
  (`scripts/e2e-env.sh uv run uvicorn ...`, esperada pelo `/ready`, que
  consulta o banco) e o frontend na **5273** (`vite preview` do build). As
  portas de desenvolvimento são 8000 e 5173; nenhuma é reaproveitada
  (README §10).
- **`scripts/e2e-env.sh`** aponta `FOCUSQUEST_DATABASE_URL` da API do E2E
  para o banco de **teste** (lido de `Settings().test_database_url`, sem
  repetir a URL) e recusa subir se o nome do banco não terminar em `_test`.
- **O proxy do `vite preview` recebe `API_PROXY_TARGET`** apontando para a
  8100, pelo `env` do `webServer`. Sem isso o proxy cairia no padrão 8000 —
  a API de desenvolvimento — e o cenário poderia **passar** contra o
  servidor errado.
- **axe-core** com o conjunto de regras padrão (sem `withTags` nem
  `disableRules`), exigindo zero violações, em dois estados da tela: a lista
  carregada e o estado de erro (forçado com `page.route(...).abort()`). O
  estado de carregando **não** é auditado.

**O E2E divide o banco `focusquest_test` com a suíte pytest.** É uma decisão
deliberada, e duas exigências estruturais a tornam segura: o cenário semeia
**pela API, por HTTP** (nunca por SQL), e afirma **só sobre as linhas que ele
mesmo criou** — cada missão carrega um sufixo único da execução e é
localizada pelo `id` que a API devolveu. Dado remanescente não aprova nem
reprova o cenário. Duas consequências operacionais:

- **Não rode `check-api` e `check-e2e` ao mesmo tempo na mesma máquina** —
  nem dois `make check` simultâneos. A fixture do pytest faz `DROP SCHEMA`
  no banco que a API do E2E está usando, e o E2E usa portas fixas
  (8100, 5273). O resultado é falha alta (500, tabela inexistente, porta
  ocupada), não aprovação silenciosa — mas é falha. No CI a corrida não
  existe: cada job tem o próprio serviço PostgreSQL.
- **Cada execução do E2E deixa linhas no `focusquest_test`.** Elas só somem
  no próximo `DROP SCHEMA` da suíte pytest. Depois de um `make check`
  completo sobram as duas missões da última execução do E2E (medido: 2
  linhas); `make check-e2e` rodado repetidamente, sem o `check-api` no
  meio, acumula.

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
| `check-secrets` | `make check-secrets` | checkout | 10 |
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
  A DDL do banco de teste tem um lugar só.
- **As variáveis `FOCUSQUEST_DATABASE_URL` e `FOCUSQUEST_TEST_DATABASE_URL`
  vêm do `env:` do job**, com a credencial local do container de serviço —
  não há segredo do repositório envolvido.

O job `check-secrets` não precisa de preparo de Node, Python nem instalação
de nenhuma ferramenta: `make check-secrets` já baixa o próprio binário do
Gitleaks, fixado por checksum, e um checkout raso basta porque
`gitleaks dir .` varre a árvore de arquivos em disco, não o histórico.

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
  exercitado); e o worktree usa o **mesmo** PostgreSQL, o mesmo
  `focusquest_test` e as mesmas portas do E2E que a máquina local, então um
  push não pode correr em paralelo com outro gate (seção 4). **O que foi e o
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
