# Início diário na virada civil — prova determinística parcial da 160

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar esta tarefa. Revisão independente antes de publicar.

**Goal:** Provar que o início diário decide a disponibilidade pelo dia civil de São Paulo lido depois de uma espera real pela missão.

**Architecture:** Um módulo próprio cria um plano commitado, retém a diária pré-carregada e observa os PIDs exatos em `pg_blocking_pids`. A sessão dona apenas segura a linha. O relógio injetado retorna imediatamente e muda de quarta 23:59:59 para quinta 00:00:00 somente após comprovar a espera, antes de liberar a linha. A diária de quarta é recusada como perdida; a de quinta é revelada e iniciada no instante correto.

**Tech Stack:** PostgreSQL real, SQLAlchemy 2.x, pytest e biblioteca padrão Python; nenhuma dependência nova.

**Spec:** README F1/F14/C13/C11 e pendência 160 de `docs/HANDOFF.md`.

## Global Constraints

- Branch `wt/inicio-virada-dia`, base `5ba81c3`, banco `focusquest_inicio-virada-dia_test`, offset 12; um implementador exclusivo.
- Não executar compose neste worktree nem pytest e E2E simultaneamente no mesmo banco.
- Nenhuma alteração permanente de produção, contrato, configuração, dependência ou teste antigo.
- Preservar PR10 e a fatia 167; a 160 continua parcialmente aberta.
- Commit assinado, push de uma ref e PR autorizados após revisão sem bloqueadores e gate final aprovado; nenhum merge.

## Review Focus

- Relógio sem espera; sincronização vem da observação dos PIDs distintos, não do escalonador ou de uma chamada simulada.
- Resultado negativo mede ausência de operação, alterações da missão e XP ainda na transação viva, antes do rollback.
- Resultado positivo mede estado retornado/persistido, `started_at` exato e uma única operação `start`.
- A referência pré-carregada permanece retida; não se pretende provar remoção de `populate_existing`, pois o dono não altera a missão.
- Rollback libera a linha antes do shutdown do executor; limpeza elimina somente as missões do plano próprio e seus efeitos por CASCADE, depois o plano.

### Task 1: Testar as duas permissões após a espera

**Files:**
- Create: `tests/integration/test_inicio_virada_dia_concorrencia.py`.
- Create: `docs/superpowers/plans/2026-10-05-inicio-virada-dia.md`.
- Modify: `docs/HANDOFF.md` e `docs/ARCHITECTURE.md`.

**Interfaces:**
- Consumes: `iniciar_missao(Session, int, int, str, *, clock) -> Mission`; `MissaoExpiradaError`; `criar_plano`.
- Produces: `test_inicio_da_diaria_revalida_o_dia_civil_apos_a_espera`, parametrizado por diária vencida/revelada.

- [x] **Step 1: Confirmar isolamento, hooks, migração e baseline completo.**

Run: script de worktree, `uv run pre-commit install --install-hooks`, `make reset-test-db`, `make migrate-test`, `make check`.
Expected: preparação do banco exclusivo; baseline EXIT 0, 1436 Python/990 frontend/59 E2E, cobertura 100%.

- [x] **Step 2: Criar os dois cenários e verificar o contrato existente.**

Run: `uv run pytest tests/integration/test_inicio_virada_dia_concorrencia.py`.
Expected: 2 passed. Quarta recusa com `MissaoExpiradaError` sem escrita, também antes do rollback; quinta inicia em `DEPOIS`, com uma operação e nenhum XP. Ambas aguardam uma trava comprovada antes da virada.

- [x] **Step 3: Provar a mutação válida e restaurar os bytes.**

Somente em `iniciar_missao`, mover `agora = clock()` para antes de `buscar_para_escrever(..., travar=True)`. Guardar bytes da produção, executar o módulo e restaurar em `finally`, conferindo SHA-256.
Expected: 2 failed em resultado/erro real: a diária de quarta é iniciada indevidamente e a de quinta continua oculta. Nenhuma falha por sintaxe ou timeout; após restauração, 2 passed e produção igual à base.

- [x] **Step 4: Validar suíte relacionada, documentar limites e revisar.**

Run: `uv run pytest tests/integration/test_inicio_virada_dia_concorrencia.py tests/integration/test_iniciar_missao.py tests/integration/test_acompanhamento_concorrencia.py`.
Expected: todos aprovados; registrar números reais no handoff; enviar diff e logs para revisão somente leitura.

- [ ] **Step 5: Executar gate completo e publicar a fatia.**

Run: `make check` e `git diff --check`.
Expected: EXIT 0, 1438 Python/990 frontend/59 E2E, cobertura 100%, fontes/HEAD/index congelados. Depois da revisão sem bloqueador, publicar somente os quatro arquivos próprios com commit `-S` e hooks, push de uma ref e PR. Registrar assinatura, HEAD, PR e CI no ledger ignorado; nenhum merge.

**Registro:** resultados finais de gate e revisão ficam no ledger ao terminarem. O baseline não aprova arquivos novos; etapa 5 permanece pendente no roteiro até a evidência final, sem reescrever fontes durante o gate. Esta prova não encerra as outras combinações concorrentes da 160 nem mede HTTP, Tifa, reagendamento ou conclusão.
