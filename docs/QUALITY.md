# QUALITY

Este documento descreve o gate de qualidade do FocusQuest: os comandos que o
compõem, a regra que governa quem chama quem, o que a cobertura mede (e o que
deliberadamente não mede), o roadmap dos alvos que ainda faltam, as
limitações conhecidas sem eufemismo, e o procedimento de atualização do
Gitleaks.

## Primeiro uso após clonar

Em um clone novo (ou um worktree novo), rode os três comandos abaixo, **nesta
ordem**:

```bash
make bootstrap                                    # dependencias dos dois ecossistemas
uv run pre-commit install --install-hooks         # hooks de git (NAO vem do bootstrap)
make check                                        # confirma que o gate passa
```

O segundo comando é separado do primeiro **de propósito**, não por
esquecimento: `make bootstrap` não instala hooks de git, e não vai passar a
instalar. `scripts/check-push.sh` roda `make bootstrap` dentro de um
worktree temporário a cada ref validada no `pre-push`; como um worktree
compartilha o diretório `.git` do repositório principal, um
`pre-commit install` disparado a partir de dentro de `bootstrap` reescreveria
os hooks do repositório principal no meio da validação de um push — efeito
colateral inaceitável. Manter os dois comandos sempre separados também
mantém "nenhum alvo do Makefile invoca `pre-commit`" (seção 2 abaixo) como
regra absoluta, sem exceção a lembrar.

Sem o segundo comando, `git commit` e `git push` funcionam normalmente —
sem nenhuma validação. Ver a limitação correspondente na seção 6.

## 1. Comandos

| Comando | Descrição |
|---|---|
| `make help` | Lista os alvos disponíveis do Makefile, com a descrição de cada um. |
| `make bootstrap` | Instala as dependências dos dois ecossistemas: `npm ci` no frontend, `uv sync --frozen` na raiz Python, e o Gitleaks fixado via `scripts/install-gitleaks.sh`. |
| `make check` | Gate completo. Agrega `check-web` e `check-secrets`, nesta ordem. É o que os hooks (`pre-commit`, `pre-merge-commit`) e o `pre-push` (via `scripts/check-push.sh`) executam. |
| `make check-web` | ESLint, depois Prettier em modo verificação, depois TypeScript sem emissão, depois Vitest com cobertura exigida de 100%, nesta ordem. Cada etapa só roda se a anterior passar. |
| `make check-secrets` | Instala o Gitleaks (idempotente) e varre o repositório inteiro em busca de segredos, com `--config .gitleaks.toml`. |
| `make format` | **Modifica** arquivos: aplica o Prettier (`prettier --write`) no frontend. Nunca é chamado por `check` nem por qualquer hook — é a única forma de o gate alterar arquivos **versionados**, e é manual. |

Uma precisão sobre "só `make format` modifica": `make check` **escreve** em
disco — `frontend/coverage/` (relatórios do Vitest) e
`frontend/node_modules/.tmp/*.tsbuildinfo` (cache incremental do `tsc -b`).
Os dois caminhos são ignorados pelo git, então `git status` continua limpo
depois de um `make check` e nenhum arquivo versionado muda. A frase correta
é "`make check` não modifica arquivos versionados", não "não modifica
arquivo nenhum".

## 2. A regra da direção única

```
git hook -> pre-commit -> make -> ferramentas
```

O framework `pre-commit` instala os hooks (`pre-commit`, `pre-merge-commit`,
`pre-push`, via `.pre-commit-config.yaml`) e cada hook invoca um alvo do
Makefile (`make check` para os dois primeiros estágios;
`scripts/check-push.sh`, que por sua vez chama `make bootstrap` e
`make check`, no `pre-push`). O Makefile invoca as ferramentas de fato
(ESLint, Prettier, `tsc`, Vitest, Gitleaks).

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
| Dependências (`node_modules/`, `.venv/`, `uv.lock`, `package-lock.json`) | Código de terceiros; o projeto não pode garantir cobertura sobre o que não escreveu. |
| Artefatos gerados (`frontend/dist/`, `frontend/coverage/`, `.tools/`) | Saída de build/instalação, recriada a cada execução; não é código-fonte. |
| CSS e configuração de ferramentas (`vite.config.ts`, `eslint.config.js`, `.prettierrc.json`, `tsconfig*.json`) | Configuração declarativa, não lógica de aplicação testável por unidade. |

Esta lista segue o README §9: "Declare o denominador: testes, dependências,
arquivos gerados, CSS e configuração de ferramentas não são código de
aplicação coberto por essas métricas." Cobertura de 100% sobre este
denominador não prova ausência de bugs nem testa todas as combinações de
estados possíveis — apenas garante que nenhuma linha, ramo, função ou
instrução do código de aplicação ficou sem exercício por pelo menos um
teste.

## 4. Roadmap dos alvos ausentes

Isto é um **contrato**, não uma lista de intenções: nenhum incremento que
traga código de um ecossistema ainda não coberto pelo gate pode ser aceito
sem trazer, no mesmo incremento, o alvo correspondente do Makefile.

| Alvo | Conteúdo | Entra junto com |
|---|---|---|
| `check-api` | Ruff lint, Ruff `format --check`, mypy estrito, pytest com cobertura | O primeiro módulo Python |
| `check-e2e` | Build, Playwright/Chromium, axe-core | O primeiro fluxo ponta a ponta real |

Hoje, Ruff, mypy e pre-commit já estão fixados no `uv.lock` (a raiz Python
existe desde o commit `28c74e4`), mas **fora** do `check` — de propósito,
porque não há nenhum arquivo `.py` no repositório ainda. Declarar uma
ferramenta sem ter o que ela verifique criaria uma etapa que sempre passa
vazia, o que o README §9 proíbe explicitamente ("sucesso com suíte vazia").
O mesmo vale para `check-e2e`: sem um fluxo real de ponta a ponta, um
`check-e2e` existiria apenas para navegar por uma tela estática, sem
nenhuma asserção de negócio significativa.

### Divergência conhecida da spec: o `uv.lock` não é validado

A spec de design previa `uv sync --frozen` no CI. O workflow só faz
`npm ci`; `uv sync --frozen` existe apenas no alvo `bootstrap`, que o CI
não chama. Consequência real, sem eufemismo: um `uv.lock` dessincronizado
do `pyproject.toml` **não é detectado por nada** — nem localmente, nem no
CI.

E há um detalhe pior, que a spec não previa: **`--frozen` não valida nada**.
No `uv`, `--frozen` significa "use o lockfile como está, sem atualizá-lo";
ele não compara o lockfile com o `pyproject.toml`. Medido com
`uv 0.12.13`, acrescentando uma dependência ao `pyproject.toml` sem
regravar o lock:

```
$ uv sync --frozen        # lockfile defasado
Checked 17 packages in 0.27ms          # passa, sem reclamar

$ uv sync --locked        # mesmo estado
error: The lockfile at `uv.lock` needs to be updated, but `--locked` was provided.

$ uv lock --check         # mesmo estado
error: The lockfile at `uv.lock` needs to be updated, but `--check` was provided.
```

Ou seja: mesmo que `uv sync --frozen` estivesse no CI exatamente como a
spec pedia, o `uv.lock` continuaria sem validação. A verificação que a spec
queria se escreve `uv sync --locked` (ou `uv lock --check`). O `--frozen`
do `bootstrap` está certo onde está — o papel dele é instalar sem mexer no
lock, e é isso que se quer dentro do worktree do `pre-push`.

A decisão é **não corrigir agora**, e o registro aqui é a correção. Um
passo de verificação do `uv.lock` no CI que não existisse no `make check`
quebraria a paridade 1:1 da seção 5 (decisão D5) logo no primeiro
incremento em que ela foi escrita; e criar um alvo de Makefile só para isso
significaria colocar uma etapa Python no gate quando nenhuma ferramenta
Python está no gate e não há um único arquivo `.py` no repositório — perto
demais do "sucesso com suíte vazia" que o README §9 proíbe.

A validação do `uv.lock` entra junto com o alvo `check-api` da tabela
acima, que vai precisar de `uv` de qualquer forma para instalar Ruff, mypy
e pytest de maneira reproduzível — e aí a checagem correta (`--locked`, não
`--frozen`) entra como parte do alvo, visível tanto localmente quanto no
job correspondente, sem quebrar a paridade. Até lá, o risco
aceito é: quem alterar o `pyproject.toml` sem rodar `uv lock` deixa o
lockfile defasado e ninguém avisa — nem o `make bootstrap`, que usa
`--frozen` e instala alegremente a partir do lock velho. O sintoma aparece
depois, como uma dependência declarada que simplesmente não está instalada,
possivelmente na máquina de outra pessoa.

## 5. Integração contínua

O workflow `.github/workflows/quality.yml` é o mesmo gate, executado no
GitHub Actions. Dispara em `push` e `pull_request` de qualquer branch, sem
filtro de caminho, mais `workflow_dispatch` e `merge_group`; permissão
mínima (`contents: read`), sem segredos, sem `continue-on-error`, e com
`cancel-in-progress: false` porque o README §12 proíbe cancelar
verificações anteriores.

**Paridade 1:1 entre job e alvo do Makefile (decisão D5).** Cada job de
verificação executa **um** alvo, e nada além dele:

| Job | Executa |
|---|---|
| `check-web` | `make check-web` |
| `check-secrets` | `make check-secrets` |
| `quality-gate` | nenhum alvo: agrega o resultado dos dois acima |

A regra é o que impede o CI e a máquina local de divergirem. Um passo que
existisse só no workflow (ou só no Makefile) criaria uma verificação que
ninguém consegue reproduzir do outro lado, e o primeiro efeito prático
seria um CI vermelho que passa localmente — exatamente o que faz alguém
procurar um jeito de pular o gate. Por isso, quando faltar uma verificação,
ela entra primeiro como alvo do Makefile e só depois ganha um job; nunca o
contrário. Ver a divergência conhecida sobre o `uv.lock` na seção 4.

Os passos que o job faz além do alvo são de **preparação de ambiente**, não
de verificação: `actions/checkout`, `actions/setup-node` (Node 24, cache de
npm apontado para `frontend/package-lock.json`) e `npm ci`. O job
`check-secrets` não precisa de preparo nenhum: `make check-secrets` já
instala o Gitleaks fixado por checksum, e um checkout raso basta porque
`gitleaks dir .` varre a árvore de arquivos em disco, não o histórico.

**O agregador `quality-gate` e o `if: always()`.** É o job único destinado a
virar o status obrigatório da proteção de branch — a lista de `needs`
cresce junto com os jobs, mas a proteção do remoto continua apontando para
um nome só. Ele precisa de `if: always()` porque, sem isso, um `needs` que
falha faz o job dependente ser **pulado**, e um check pulado não reprova
nada: o status obrigatório simplesmente nunca reportaria, e um PR quebrado
apareceria como "sem verificação pendente" em vez de vermelho. Com
`always()`, o job roda sempre e exige o literal `success` de cada
dependência — `failure`, `cancelled` e `skipped` reprovam do mesmo jeito.
Aprovar por não ter conseguido olhar é o que o gate proíbe em todas as
camadas, e aqui não é diferente.

Limitação registrada e deliberadamente não corrigida agora: a lista de
`needs` do `quality-gate` é estática, então um job novo que alguém esqueça
de acrescentar ali passaria despercebido pelo agregador. O conserto (gerar
a lista, ou usar uma action de agregação de terceiros) traz dependência ou
metaprogramação de YAML que não se paga com dois jobs; revisar quando
houver mais.

## 6. Limitações conhecidas

Sem eufemismo:

- **O `pre-push` valida o topo de cada ref enviada, não cada commit
  intermediário.** `scripts/check-push.sh` roda `make bootstrap` e
  `make check` uma vez por ref, no SHA que está no topo dela, em um
  worktree isolado. Se uma revisão no meio da pilha estiver quebrada mas o
  topo da ref corrigir o problema, o `pre-push` aprova o push inteiro sem
  jamais ter validado o commit intermediário isoladamente. Um
  `git bisect` futuro pode pousar em um commit que nunca passou pelo gate.
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
- **O gate roda inteiro a cada commit, e vai ficar lento conforme o
  projeto cresce.** Hoje `make check` leva cerca de 2 segundos porque o
  frontend é pequeno e não há backend. Isso é uma decisão deliberada do
  README §11 ("Antes de cada commit, valide o conteúdo do índice" sem
  filtro de arquivos alterados), não um descuido — mas o custo é real e
  vai aumentar. Quando o tempo por commit se tornar proibitivo, a solução
  não pode ser reduzir o que o gate verifica; é paralelizar, cachear ou
  segmentar por escopo, mantendo a garantia de que todo o projeto continua
  verificado antes de cada commit.
- **Hooks não vêm no clone.** `make bootstrap` **não** instala hooks de git
  — só dependências (npm, uv, Gitleaks). `uv run pre-commit install
  --install-hooks` precisa ser executado à parte, uma vez por clone e uma
  vez por cada worktree novo (inclusive no PyCharm), como descrito em
  "Primeiro uso após clonar" no início deste documento. Enquanto isso não
  for feito, `git commit` e `git push` funcionam sem nenhuma validação, sem
  aviso nenhum de que o gate não está ativo.
- **Hooks são contornáveis por quem controla o Git.** Mesmo instalados,
  quem tem acesso ao repositório local pode usar `--no-verify`, `SKIP`,
  editar ou apagar `.pre-commit-config.yaml`, ou desinstalar os hooks.
  Nada nesta camada impede isso: **a proteção real é a do remoto** (branch
  protection e o status `quality-gate` obrigatório em CI, README §12). O
  workflow que produz esse status já existe e está descrito na seção 5
  (`.github/workflows/quality.yml`); o que falta é o outro lado — o
  repositório ainda não tem remoto configurado, e sem remoto não há como
  aplicar a proteção de branch que torna o `quality-gate` obrigatório (ver
  `docs/HANDOFF.md`). Os hooks locais existem para dar feedback rápido e
  reduzir o volume de commits quebrados que chegam ao CI, não para
  substituir a proteção do remoto.

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
