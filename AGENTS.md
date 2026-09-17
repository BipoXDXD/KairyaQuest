# AGENTS.md

Regras comuns a **todos** os agentes que trabalham neste repositório (Kimi,
Codex, Claude). Este arquivo é a fonte única; `CLAUDE.md` o importa e
acrescenta apenas o que é específico do Claude Code.

Interface do produto em **português do Brasil**; identificadores de código em
**inglês** (README §3).

## 1. Antes de escrever qualquer coisa

Leia, nesta ordem:

1. `README.md` — a especificação completa do produto. É a autoridade final.
2. `docs/ARCHITECTURE.md` — responsabilidades, convenções e onde cada tipo de
   arquivo mora.
3. `docs/HANDOFF.md` — estado corrente: decisões, alterações, pendências.
4. `docs/QUALITY.md` — o gate de qualidade, o que ele mede e o que ele
   deliberadamente não mede.

E instale os hooks. **Eles não vêm no clone.** Em cada clone novo e em cada
worktree novo:

```bash
make bootstrap
uv run pre-commit install --install-hooks
make check
```

Sem o segundo comando, `git commit` e `git push` funcionam sem nenhuma
validação e sem nenhum aviso de que o gate não está ativo. O procedimento
completo, com o motivo de os três comandos serem separados, está em
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
  bancos. Revisar o trabalho de outro agente **não** autoriza editar a árvore
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

- **Nenhum alvo do Makefile invoca `pre-commit`.** A invocação é estritamente
  descendente: `git hook -> pre-commit -> make -> ferramentas`. Um alvo que
  chamasse `pre-commit` de volta criaria recursão e tornaria impossível rodar
  o gate isoladamente (no CI, ou dentro do worktree do `pre-push`). Motivo
  completo em `docs/QUALITY.md` §2.
- **Paridade 1:1 entre job do CI e alvo do Makefile.** Cada job de verificação
  do `.github/workflows/quality.yml` executa **um** alvo e nada além dele; o
  que o job faz a mais é preparação de ambiente, não verificação. Quando
  faltar uma verificação, ela entra primeiro como alvo do Makefile e só
  depois ganha um job — nunca o contrário (`docs/QUALITY.md` §5, decisão D5).
- **Cobertura de 100% no frontend, em linhas, ramificações, funções e
  instruções.** Os limiares estão em `frontend/vite.config.ts`. Não exclua
  código difícil, não remova teste, não reduza limiar e não use diretiva de
  ignorar cobertura. O denominador — o que é medido e o que está fora, com a
  justificativa de cada exclusão — está declarado em `docs/QUALITY.md` §3.
- **Ruff e mypy estão declarados mas fora do gate, de propósito.** O
  `pyproject.toml` configura os dois e o `uv.lock` os fixa, mas nenhum alvo do
  `make check` os executa: **não existe um único arquivo `.py` no
  repositório**, e uma etapa que sempre passa vazia é o "sucesso com suíte
  vazia" que o README §9 proíbe. Isto é um **contrato**: quem criar o primeiro
  módulo Python traz, no mesmo incremento, o alvo `check-api` (Ruff lint,
  Ruff `format --check`, mypy estrito, pytest com cobertura) e o job
  correspondente. O mesmo vale para `check-e2e` junto com o primeiro fluxo
  ponta a ponta real. Contrato completo em `docs/QUALITY.md` §4.
- **Justifique dependência, contrato e infraestrutura.** Nenhuma biblioteca,
  nenhum endpoint e nenhum serviço entram sem um motivo escrito no
  `docs/HANDOFF.md`. Adie Kubernetes, Redis, Celery, RabbitMQ, Kafka,
  Terraform e cloud até haver necessidade real (README §3).
- **Mantenha `docs/HANDOFF.md` atualizado.** Objetivo, revisão-base, decisões,
  alterações, comandos, resultados e pendências — sem segredos e sem caminhos
  pessoais. Um incremento que resolve uma pendência a risca de lá; um que cria
  uma limitação a escreve lá.

## 5. Descoberta de instruções por cada agente

O README §13 exige confirmar a descoberta de instruções por agente e **não
inventar capacidades**. O que segue distingue o que foi confirmado do que não
foi.

| Agente | Como descobre estas instruções | Estado |
|---|---|---|
| Claude Code | `CLAUDE.md` na raiz importa este arquivo com `@AGENTS.md` | **Confirmado** na documentação oficial: "Claude Code reads `CLAUDE.md`, not `AGENTS.md`. If your repository already uses `AGENTS.md` (…), create a `CLAUDE.md` that imports it". A sintaxe de import é `@caminho/do/arquivo`, com até quatro saltos de profundidade. |
| Codex CLI | Lê `AGENTS.md` diretamente | **Confirmado na documentação oficial**, não verificado por execução neste repositório. A documentação descreve uma cadeia: escopo global (`~/.codex/`), depois do raiz do Git descendo até o diretório atual, concatenando. |
| Kimi Code CLI | Presume-se que leia `AGENTS.md` diretamente | **NÃO CONFIRMADO.** A documentação oficial declara os arquivos globais (`~/.kimi-code/AGENTS.md`, `~/.agents/AGENTS.md`) e diz que instruções de projeto "ficam sob a árvore do projeto, por exemplo `.kimi-code/AGENTS.md` ou `AGENTS.md`" — o que **não** afirma inequivocamente que o `AGENTS.md` da raiz é descoberto automaticamente, nem qual das duas localizações tem precedência. Nada disso foi verificado por execução. **Confirme antes de depender disso**; se o Kimi não carregar este arquivo sozinho, aponte-o explicitamente no início da sessão. |

Instruções aninhadas ou de nível de usuário **não enfraquecem** estas regras.
Uma preferência pessoal de estilo não autoriza pular o gate, reduzir
cobertura nem contornar a proteção da `main`.
