# Reagendamento durante espera — prova determinística parcial da 160

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar esta tarefa. Revisão independente pelo controlador antes de publicar.

**Goal:** Provar que o reagendamento direto revalida o prazo e encadeia o histórico com o relógio lido depois de uma espera real pela missão.

**Architecture:** Um módulo próprio cria uma avulsa commitada, mantém a missão pré-carregada na sessão perdedora e observa `pg_blocking_pids` antes de liberar o vencedor. Um relógio injetado não bloqueante muda de instante somente depois da observação: o pedido perdedor é recusado se seu prazo venceu ou grava um segundo elo coerente se continua futuro.

**Tech Stack:** PostgreSQL real, SQLAlchemy 2.x, pytest e biblioteca padrão Python; nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-29-incremento-f-acompanhamento-design.md`, F9/F14; `docs/HANDOFF.md`, pendência 160.

## Global Constraints

- Worktree `wt/reagendamento-espera`, base `5ba81c3`, banco `focusquest_reagendamento-espera_test`, offset 8; um implementador exclusivo.
- Não executar compose neste worktree; não executar pytest e E2E juntos no mesmo banco.
- Nenhuma alteração permanente de produção, contrato, dependência, configuração ou teste antigo.
- Preservar a fatia 167 e os outros worktrees. A 160 recebe resolução parcial, com seus outros limites mantidos.
- O controlador autorizou o implementador a realizar commit assinado/push de uma ref/PR após revisão sem bloqueador e gate final aprovado; merge requer autorização própria.

## Review Focus

- Relógio não pode esperar pela liberação nem consultar a hora real, pois isso esconderia a mutação.
- A observação precisa ligar os PIDs exatos; uma espera posterior de escrita/FK não substitui as asserções dos efeitos.
- A referência da missão pré-carregada permanece retida, sem expire/refresh.
- O prazo expirado não grava operação ou elo perdedor; o prazo futuro encadeia ambos os elos e devolve o prazo novo.
- Em erro, rollback libera a trava antes da espera do executor; limpeza remove apenas a missão do cenário e seus efeitos por CASCADE.

### Task 1: Testar prazo e histórico após a espera

**Files:**
- Create: `tests/integration/test_reagendamento_espera_deterministica.py`.
- Create: `docs/superpowers/plans/2026-10-05-reagendamento-espera.md`.
- Modify: `docs/HANDOFF.md` e `docs/ARCHITECTURE.md`.

**Interfaces:**
- Consumes: `reagendar_missao(Session, int, int, str, *, novo_prazo, motivo, origem, clock) -> Mission`; `PrazoExpiradoError`.
- Produces: `test_reagendamento_revalida_prazo_e_historico_depois_da_espera`, parametrizado por prazo expirado/futuro.

- [x] **Step 1: Confirmar isolamento, hooks, migração e baseline completo.**

Run: `uv run pre-commit install --install-hooks`, `make migrate-test`, `make check`.
Expected: hooks instalados; caso o banco ainda não exista, registrar a falha isolada de migrate-test e deixar a fixture protegida criá-lo no baseline; gate EXIT 0, 1436 Python/990 frontend/59 E2E, cobertura 100%.

- [x] **Step 2: Criar a prova dos dois resultados.**

A thread retém a missão antes da primeira escrita; o controlador opera o primeiro reagendamento sem commit, libera o pedido e observa o bloqueio. Só então muda o relógio e commita:

```python
carregada = sessao.get(Mission, missao_id)
carregou.set()
assert iniciar_pedido.wait(SEGUNDOS_LIMITE)
# Relógio retorna imediatamente; não faz wait.
clock = lambda: DEPOIS_DA_ESPERA if liberou.is_set() else ANTES_DA_ESPERA
# No controlador, depois de SELECT pg_blocking_pids(:pid):
liberou.set()
vencedor.commit()
```

Run: `uv run pytest tests/integration/test_reagendamento_espera_deterministica.py`.
Expected: 2 passed, porque o contrato já existe. Prazo vencido gera `PrazoExpiradoError` sem escrita perdedora, conferida antes do rollback por consultas com autoflush; prazo futuro gera dois elos coerentes e instante exato posterior à espera, sem XP.

- [x] **Step 3: Provar três mutações separadas e restaurar os bytes.**

Guardar os bytes de `src/focusquest/modules/missions/service.py`; para cada mutação executar o módulo e restaurar em `finally`, conferindo SHA-256:

```python
# M1: reagendar_missao lê clock antes da busca travada.
# M2: reagendar_missao busca com travar=False.
# M3: buscar_para_escrever usa populate_existing=False.
```

Run: módulo novo contra cada mutação e, depois, contra a produção restaurada. Uma mutação adicional insere uma operação antes de levantar `PrazoExpiradoError`: precisa reprovar o cenário de recusa antes do rollback.
Expected: M1/M2 reprovam os dois cenários; M3 reprova o encadeamento do prazo futuro (o prazo expirado pode continuar recusado). Cada RED precisa falhar na expectativa real, não por erro de sintaxe. GREEN final: 2 passed; produção byte a byte igual à base.

- [x] **Step 4: Validar suíte relacionada, documentar limites e revisar.**

Run: `uv run pytest tests/integration/test_reagendamento_espera_deterministica.py tests/integration/test_acompanhamento_concorrencia.py tests/integration/test_reagendar_missao.py`.
Expected: todos aprovados; handoff registra resultados reais e fechamento apenas parcial da 160; arquitetura registra o módulo. Enviar diff e evidências para revisão somente leitura.

- [ ] **Step 5: Executar gate completo e entregar para publicação.**

Run: `make check` e `git diff --check`.
Expected: EXIT 0, 1438 Python/990 frontend/59 E2E e cobertura 100%. Logs no ledger; revisão independente antes de publicação. Depois da revisão sem bloqueador e do gate final aprovado, publicar somente os quatro arquivos próprios: commit `-S` com hooks, push de uma ref e PR; registrar assinatura, HEAD e PR no ledger. Nenhum merge.

**Registro:** resultados do gate final e da revisão independente são registrados no ledger ao terminarem; o baseline não aprova arquivos novos. A etapa 5 continua pendente neste roteiro até a evidência final, registrada no ledger sem reescrever fontes durante o gate.
