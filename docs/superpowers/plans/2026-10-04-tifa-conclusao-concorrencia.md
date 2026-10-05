# Pendência 167 — confirmação da Tifa × conclusão

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar esta fatia na sessão atual. Revisão independente ao final.

**Goal:** Provar por conexões reais os dois desfechos da confirmação de reagendamento concorrendo com a conclusão da mesma missão.

**Architecture:** Um novo módulo de integração concentra o cenário commitado, a limpeza e a sincronização. A sessão perdedora carrega a missão antes da primeira escrita; `pg_blocking_pids` comprova a espera antes do commit vencedor. Os serviços de produção já implementam o contrato e serão preservados, salvo uma falha real demonstrada pelo teste.

**Tech Stack:** PostgreSQL 18.6, SQLAlchemy 2.x, pytest e biblioteca padrão Python; sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-09-29-incremento-f-acompanhamento-design.md`, F14 e F17; `docs/HANDOFF.md`, pendência 167; roteiro da pausa em `docs/RETOMADA-2026-10-04.md`.

## Global Constraints

- Um implementador no worktree `wt/tifa-conclusao`, base `5ba81c3`, banco `focusquest_tifa-conclusao_test`, offset 6.
- Não executar compose fora do principal; não executar pytest e E2E juntos no mesmo banco.
- PostgreSQL real, relógios injetados e espera por condição com prazo; nenhum teste ignorado ou limiar reduzido.
- Commit, push, merge e publicação dependem de autorização explícita para esta fatia.
- Preservar os outros worktrees, checkpoints e as três alterações documentais anteriores.

## Review Focus

- Conclusão vence: ação persiste `falhou/reagendamento_invalido`; prazo antigo, sem elo nem operação de reagendamento.
- Tifa vence: conclusão devolve prazo novo; um elo de origem Tifa precede `completed_at`.
- Cache da sessão: reter a missão pré-carregada até a escrita, sem expire/refresh que esconda a falta de `populate_existing`.
- Sincronização: backends distintos; o perdedor espera pelo PID vencedor antes da liberação.
- Falha do teste: rollback libera a trava antes da espera do executor; cleanup remove só mensagens/missão do cenário e seus efeitos por CASCADE.

### Task 1: Provar os dois desfechos e atualizar a retomada

**Files:**
- Create: `tests/integration/test_tutoring_conclusao_concorrencia.py`.
- Modify: `docs/HANDOFF.md`, `docs/RETOMADA-2026-10-04.md`, `docs/ARCHITECTURE.md`.
- Preserve: alterações anteriores de `docs/superpowers/plans/2026-10-04-estabilizacao.md`.

**Interfaces:**
- Consumes: `confirmar_acao(Session, int, int, str, *, clock) -> ResultadoDaConfirmacao`; `concluir_missao(Session, int, int, str, *, clock) -> Mission`.
- Produces: `test_confirmacao_da_tifa_e_conclusao_releem_a_missao_apos_a_espera`, parametrizado por `conclusao` e `tifa`.

- [x] **Step 1: Conferir checkpoint, isolamento, PostgreSQL e baseline inteiro.**

Run: `make check` no worktree.
Expected: EXIT 0; 1436 Python, 990 frontend, 59 E2E, 100% de cobertura.

- [x] **Step 2: Escrever a prova com as duas conexões e observar os resultados.**

Ordem de sincronização:

```python
carregada = sessao.get(Mission, missao_id)
carregou.set()
assert iniciar_pedido.wait(SEGUNDOS_LIMITE)
resultado = _operar(sessao, segunda, missao_id, acao_id, SEGUNDO_EM)
```

Antes de liberar o vencedor, consultar numa terceira conexão:

```sql
SELECT pg_blocking_pids(:pid)
```

Expected: PID vencedor na lista; cada desfecho satisfaz os cinco itens de Review Focus; exatamente um crédito `mission_completed` de 40 XP para dificuldade 2.

Run: `uv run pytest tests/integration/test_tutoring_conclusao_concorrencia.py`.
Expected: 2 passed, porque se prova um comportamento existente.

- [x] **Step 3: Ver a regressão reprovar e restaurar os bytes.**

Guardar os bytes de `src/focusquest/modules/missions/service.py`; trocar temporariamente `populate_existing=travar` por `populate_existing=False`; executar o módulo; restaurar em `finally` e conferir SHA-256.

Expected: os dois casos falham nas asserções do desfecho/prazo; EXIT 1. Código restaurado byte a byte. Reexecução: 2 passed.

- [x] **Step 4: Conferir suíte relacionada e revisão independente.**

Run: `uv run pytest tests/integration/test_tutoring_conclusao_concorrencia.py tests/integration/test_tutoring_reagendamento.py tests/integration/test_acompanhamento_concorrencia.py`.
Expected: todos aprovados. Revisão somente leitura sobre o diff local e o arquivo novo; tratar achados materiais antes do gate.

- [x] **Step 5: Atualizar os registros e aprovar o gate final.**

Registrar escopo, comandos e resultados reais no handoff; riscar a pendência 167 com limites da prova. Atualizar a retomada e a responsabilidade do módulo na arquitetura. Incorporar os três documentos preservados do principal, sem apagar seu conteúdo.

Run: `make check` e `git diff --check`.
Expected: EXIT 0; 1438 Python, 990 frontend, 59 E2E e 100%. Manter logs e ledger para continuação. A restrição inicial de commit/push
foi substituída pela autorização posterior do dono para commit, push e PR.

**Registro de execução:** etapas posteriores, revisão e gate final são registrados no ledger ao terminarem. O baseline não aprova os arquivos novos.
