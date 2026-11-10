# AGENTS.md

Regras comuns a **todos** os agentes que trabalham neste repositório (Kimi,
Codex, Claude). Este arquivo é a fonte única; `CLAUDE.md` o importa e
acrescenta apenas o que é específico do Claude Code.

Interface do produto em **português do Brasil**; **contratos externos** — nomes
de coluna, chaves de payload JSON e rotas — em **inglês**, e identificadores
internos podem ficar em português (README §3).

## 1. Antes de escrever qualquer coisa

Leia, nesta ordem:

1. `README.md` — a especificação completa do produto. É a autoridade final.
2. `docs/ARCHITECTURE.md` — responsabilidades, convenções e onde cada tipo de
   arquivo mora.
3. `docs/HANDOFF.md` e `docs/handoff/` — estado corrente: decisões,
   alterações, pendências.
4. `docs/QUALITY.md` — o gate de qualidade, o que ele mede e o que ele
   deliberadamente não mede.

E instale os hooks. **Eles não vêm no clone.** Em cada clone novo e em cada
worktree novo:

```bash
make bootstrap
uv run pre-commit install --install-hooks
cp .env.example .env
make db-up
make migrate-test
make check
```

Sem o segundo comando, `git commit` e `git push` funcionam sem nenhuma
validação e sem nenhum aviso de que o gate não está ativo. Sem o `.env` e
sem o PostgreSQL de pé (`make db-up`), o `check-api` e o `check-e2e`
reprovam. O procedimento completo, com o motivo de a instalação dos hooks
ser separada do `make bootstrap` e o papel de cada passo, está em
`docs/QUALITY.md`, seção "Primeiro uso após clonar".

## 2. Fluxo de trabalho

- **A `main` é protegida.** O remoto recusa push direto: o status
  `quality-gate` é obrigatório e `enforce_admins` está ativo. Todo trabalho
  vai por **branch e pull request**, e o merge exige o `quality-gate` verde e
  a base atualizada. Force-push e deleção da `main` estão bloqueados.
- **Não mescle sem autorização.** Commit, push, merge e publicação exigem
  autorização explícita do responsável pelo projeto (README §1).
- **Trabalhe em incrementos.** Entregue uma fatia pequena e verificável, não o
  produto inteiro. Preserve o que já existe: não refaça o ambiente, não rode
  scaffold por cima, não mova arquivos por estética.
- **Um implementador por worktree.** Separe branches, diretórios, portas e
  bancos — `scripts/novo-worktree.sh <nome>` cria o worktree com banco de
  teste e portas do E2E próprios (`docs/QUALITY.md`, "Primeiro uso após
  clonar"). Não rode `make db-up` fora do worktree principal: o compose
  recriaria o container do PostgreSQL de todos. Revisar o trabalho de outro agente **não** autoriza editar a árvore
  dele.
- **Empurre uma ref por vez.** O framework `pre-commit` só expõe **uma** ref
  ao hook `pre-push`; um `git push origin branch-a branch-b` leva as demais
  sem passar pelo gate. A limitação está medida em `docs/QUALITY.md` §6 e o
  hábito que a contorna é empurrar uma ref por vez.

## 3. O gate de qualidade

- **Rode `make check` antes de propor commit ou merge.** É o gate completo,
  não interativo, e vale para qualquer branch — inclusive mudanças que só
  tocam documentação.
- **Nunca afirme "testado" sem ter executado.** Toda afirmação de resultado
  precisa vir de um comando que você rodou de fato, nesta sessão, e cuja
  saída você leu. Informe o estado real: aprovado, falhou, não executado ou
  pendente. Afirmação falsa em documentação ou em relatório é defeito grave,
  não imprecisão.
- **Proibido, sem exceção:** `--no-verify`, `SKIP`, desinstalar ou editar
  hooks para contorná-los, `|| true` em receita de Makefile ou script do
  gate, `continue-on-error` em job do CI, teste ignorado, limiar de cobertura
  reduzido e diretiva de ignorar cobertura. Se um hook bloquear, **corrija a
  causa**.
- **Não altere um teste para acomodar comportamento errado.** Se o teste
  reprova, ou o código está errado, ou o teste descreve a expectativa errada —
  e neste segundo caso a mudança do teste é a mudança principal do
  incremento, com justificativa, não um ajuste de passagem.
- **Escreva testes.** Todo comportamento novo entra com teste que verifica
  resultado, efeito e erro reais — não com asserção que apenas confirma que a
  função foi chamada.

## 4. Regras desta base que um agente novo quebraria sem saber

Cada item abaixo é uma decisão tomada com motivo registrado, não preferência
de estilo.

**Como arbitrar uma divergência.** Vários itens desta seção repetem um número
ou uma regra que também está em `docs/QUALITY.md`. A repetição é deliberada —
uma regra que obriga a abrir outro documento para descobrir o número é uma
regra menos executável. Para que a redundância seja *arbitrável*, cada item
declara sua **fonte de verdade**: o arquivo que de fato manda. Se este
documento e o `docs/QUALITY.md` discordarem, **nenhum dos dois decide** —
abra a fonte de verdade, ela decide, e corrija os dois.

- **Nenhum alvo do Makefile invoca `pre-commit`.** A invocação é estritamente
  descendente: `git hook -> pre-commit -> make -> ferramentas`. Um alvo que
  chamasse `pre-commit` de volta criaria recursão e tornaria impossível rodar
  o gate isoladamente (no CI, ou dentro do worktree do `pre-push`). Motivo
  completo em `docs/QUALITY.md` §2.
  **Fonte de verdade:** `Makefile` e `.pre-commit-config.yaml`. Arbitrável com
  `grep -rn "pre-commit" Makefile scripts/` — as ocorrências em `scripts/` são
  comentários, não invocações.
- **Paridade 1:1 entre job do CI e alvo do Makefile.** Cada job de verificação
  do `.github/workflows/quality.yml` executa **um** alvo e nada além dele; o
  que o job faz a mais é preparação de ambiente, não verificação. Quando
  faltar uma verificação, ela entra primeiro como alvo do Makefile e só
  depois ganha um job — nunca o contrário (`docs/QUALITY.md` §5, decisão D5).
  **Fonte de verdade:** `.github/workflows/quality.yml`, confrontado com o
  `Makefile`. A lista de jobs e a lista de alvos são os dois lados da
  paridade; nenhum documento define qualquer uma das duas.
- **Cobertura de 100% no frontend, em linhas, ramificações, funções e
  instruções.** Não exclua código difícil, não remova teste, não reduza limiar
  e não use diretiva de ignorar cobertura. O denominador — o que é medido e o
  que está fora, com a justificativa de cada exclusão — está explicado em
  `docs/QUALITY.md` §3.
  **Fonte de verdade:** `frontend/vite.config.ts`, bloco
  `test.coverage.thresholds` (e `include`/`exclude` para o denominador). Nem
  este documento nem o `docs/QUALITY.md` são donos desses números: os dois
  apenas descrevem o que a configuração impõe. O "100%" escrito aqui vale
  enquanto bater com o `vite.config.ts`; se não bater, o `vite.config.ts` está
  certo e os dois documentos estão errados.
- **Ruff, mypy e pytest estão no gate, pelo alvo `check-api`; Playwright e
  axe-core, pelo `check-e2e`.** Os dois alvos nasceram no Incremento 1a,
  junto com o primeiro código Python e o primeiro fluxo ponta a ponta — a
  regra que os exigia (nenhum ecossistema entra sem o seu alvo no mesmo
  incremento) foi cumprida, e continua valendo para o próximo que entrar. O
  `check-api` roda `uv lock --check`, Ruff lint, Ruff `format --check`, mypy
  estrito sobre `src tests alembic` e pytest com cobertura de 100%; ele e o
  `check-e2e` precisam de um PostgreSQL de pé e **não podem rodar ao mesmo
  tempo no mesmo worktree** — os dois usam o banco de teste dele, e a suíte
  pytest faz `DROP SCHEMA` nele. **Entre worktrees, podem**, desde que cada
  um tenha banco de teste (nome próprio terminado em `_test`) e
  `FOCUSQUEST_E2E_PORT_OFFSET` próprios — `scripts/novo-worktree.sh <nome>`
  cria o worktree já assim; o pre-push isola o próprio gate sozinho
  (`docs/QUALITY.md` §4 e §6).
  **Fonte de verdade:** o `Makefile`. Até o alvo existir, a fonte era o
  `docs/QUALITY.md` §4, porque um contrato sobre algo inexistente só podia
  morar num documento; com as receitas escritas, este item e aquela seção
  são descrição do alvo real, e se divergirem da receita, a receita está
  certa.
- **Justifique dependência, contrato e infraestrutura.** Nenhuma biblioteca,
  nenhum endpoint e nenhum serviço entram sem um motivo escrito no
  `docs/HANDOFF.md`. Adie Kubernetes, Redis, Celery, RabbitMQ, Kafka,
  Terraform e cloud até haver necessidade real (README §3).
- **Registre o handoff em `docs/handoff/`, um arquivo por PR** (regras em
  `docs/handoff/README.md`); só o PR de consolidação edita o
  `docs/HANDOFF.md`. Objetivo, revisão-base, decisões,
  alterações, comandos, resultados e pendências — sem segredos e sem caminhos
  pessoais. Um incremento que resolve uma pendência ou cria uma limitação diz
  isso no seu arquivo, e a consolidação aplica no `docs/HANDOFF.md`.

## 5. Descoberta de instruções por cada agente

O README §13 exige confirmar a descoberta de instruções por agente e **não
inventar capacidades**. O que segue distingue o que foi confirmado do que não
foi.

| Agente | Como descobre estas instruções | Estado |
|---|---|---|
| Claude Code | `CLAUDE.md` na raiz importa este arquivo com `@AGENTS.md` | **Confirmado** na documentação oficial: "Claude Code reads `CLAUDE.md`, not `AGENTS.md`. If your repository already uses `AGENTS.md` (…), create a `CLAUDE.md` that imports it". A sintaxe de import é `@caminho/do/arquivo`, com até quatro saltos de profundidade. |
| Codex CLI | Lê `AGENTS.md` diretamente | **Confirmado na documentação oficial**, não verificado por execução neste repositório. A documentação descreve uma cadeia: escopo global (`~/.codex/`), depois do raiz do Git descendo até o diretório atual, concatenando. |
| Kimi Code CLI | Lê `AGENTS.md` da raiz diretamente | **Confirmado** — com uma ressalva de configuração, abaixo. A descoberta caminha da raiz do work-tree do Git **descendo** até o diretório de trabalho e, em cada nível, recolhe `.kimi-code/AGENTS.md` e depois `AGENTS.md`/`agents.md`: o arquivo da raiz entra automaticamente. O conteúdo é injetado no prompt do agente principal padrão pela variável `${agents_md}`, numa seção "Project information". Verificado no binário instalado (kimi-code 2.0.0), não por execução neste repositório. |

**Ressalva do Kimi Code.** O `${agents_md}` vem do prompt padrão do agente
principal. Um `~/.kimi-code/SYSTEM.md`, um `--agent`/`--agent-file`, ou um
agente do projeto com `override: true` **substituem** esse prompt — e, se não
reproduzirem `${agents_md}`, este arquivo não é carregado. Nessas
configurações, confirme antes de depender da carga automática. Vale também o
teto recomendado de 32 KiB para o total de `AGENTS.md`: acima disso o Kimi
avisa e pede corte.

> Nota de nomenclatura, porque as duas grafias circulam: no `kimi-cli`
> (legado) a variável se chama `${KIMI_AGENTS_MD}`; no `kimi-code` — o que
> está instalado aqui — ela é `${agents_md}`. São a mesma coisa com nomes
> diferentes, e a documentação do legado é a que fala em "merged AGENTS.md
> content from project root".

Instruções aninhadas ou de nível de usuário **não enfraquecem** estas regras.
Uma preferência pessoal de estilo não autoriza pular o gate, reduzir
cobertura nem contornar a proteção da `main`.
