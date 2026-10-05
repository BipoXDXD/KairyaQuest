# Pendência 166 — consultas da leitura da trilha

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans nesta tarefa aprovada. Revisão independente pelo agente designado pelo controlador.

**Goal:** Eliminar o N+1 da serialização da trilha atual, preservando seu conteúdo e a ocultação das missões futuras.

**Architecture:** `_ler_plano` antecipa `evidence`, `evaluation` e `reschedules` na consulta das missões. O teste conta leitura e `PlanRead.da_leitura` juntas, com identidades descartadas após o preparo. O ciclo já usa snapshot de colunas em um comando e permanece intacto.

**Tech Stack:** PostgreSQL real, SQLAlchemy 2.x e pytest; nenhuma dependência nova.

**Spec:** README §§8–10; docs/HANDOFF.md pendência 166; desenho aprovado pelo controlador. Context7 `/websites/sqlalchemy_en_20` já consultado pelo controlador sobre selectinload; referência: https://docs.sqlalchemy.org/en/20/tutorial/orm_related_objects.html . Dometrain get_lesson 54130255: carga antecipada quando a resposta serializa relações, conceito adaptado sem dependência de EF.

## Global Constraints

- Um implementador em `wt/plano-consultas`, base `5ba81c3`, banco `focusquest_plano-consultas_test`, offset 9.
- Hooks obrigatórios; não executar compose neste worktree nem pytest e E2E simultâneos no mesmo banco.
- Sem mudança de contrato, dependência, migração, gate, snapshot do ciclo ou regra de negócio.
- Sem commit/push/PR pelo implementador; controlador coordena publicação após revisão. Merge continua pendente.
- Preservar checkpoints e outros worktrees; revisão não autoriza editar a árvore alheia.

## Review Focus

- SQL contabilizado inclui serialização, evitando um teste verde que só mede o serviço.
- Identidades/relacionamentos do preparo não podem mascarar lazy loading.
- Segunda: só a primeira diária revelada, seis marcadores fechados e especial bloqueada.
- Domingo: sete diárias e especial, relações distintas preservadas, sem inventar reagendamento de diária/especial.
- Ausência de plano continua nula; o snapshot do ciclo e o fluxo de criação continuam cobertos pelas suítes existentes.

### Task 1: Carregar relações da trilha de uma vez

**Files:**
- Modify: `src/focusquest/modules/missions/cycle_service.py`, import ORM e consulta de `_ler_plano`.
- Create: `tests/integration/test_plans_leitura_consultas.py`.
- Modify: `docs/HANDOFF.md` e `docs/ARCHITECTURE.md`.

**Interfaces:**
- Consumes: `ler_plano_atual(Session, int, *, clock: Clock) -> PlanoLido | None`; `PlanRead.da_leitura(PlanoLido) -> PlanRead`.
- Produces: teste parametrizado segunda/domingo de consultas e conteúdo da trilha.

- [x] **Step 1: Instalar hooks e executar baseline.**
Run: `uv run pre-commit install --install-hooks`; `make check`.
Expected: hooks instalados e gate completo EXIT 0, resultado real no ledger.

Resultado: hooks EXIT 0; gate inicial EXIT 0, mas o teste foi criado durante a execução e não coletado. Ruling: tratar como diagnóstico, não baseline imutável; a árvore final tem gate próprio congelado.

- [x] **Step 2: Escrever e executar RED antes de produção.**
Preparar plano iniciado na segunda; domingo conclui sete diárias por serviço com evidências diferentes e avaliações nas duas primeiras. Descartar identidades e contar SQL no bloco:
```python
lido = ler_plano_atual(session, 1, clock=lambda: agora)
assert lido is not None
publicado = PlanRead.da_leitura(lido)
```
Run: `uv run pytest tests/integration/test_plans_leitura_consultas.py`.
Expected: domingo reprova a contagem; segunda pode passar por coincidência. Seis consultas são a expectativa fundamentada: plano + missões + histórico + três relações; conferir a medição antes de registrar como fato.

- [x] **Step 3: Aplicar carga antecipada e obter GREEN.**
```python
select(Mission).where(Mission.plan_id == plano.id).options(
    selectinload(Mission.evidence),
    selectinload(Mission.evaluation),
    selectinload(Mission.reschedules),
)
```
Run: `uv run pytest tests/integration/test_plans_leitura_consultas.py`.
Expected: dois casos aprovados com seis consultas e conteúdo correto.

- [x] **Step 4: Mutar cada relação isoladamente e restaurar os bytes.**
Retirar uma linha `selectinload` por vez; executar só domingo. Restaurar o arquivo em `finally`, conferir SHA-256 a cada rodada e executar o módulo restaurado.
Expected: três mutações EXIT 1 na contagem; arquivo byte a byte restaurado; módulo EXIT 0.

- [ ] **Step 5: Suíte relacionada, documentação, revisão e gate.**
Run: `uv run pytest tests/integration/test_plans_leitura_consultas.py tests/integration/test_cycle_service.py tests/integration/test_cycle_api.py tests/integration/test_cycle_consistency.py tests/integration/test_missions_listagem_consultas.py`.
Expected: todos aprovados. Atualizar a 166 com distinção trilha/ciclo; enviar diff e evidências ao revisor; tratar achados materiais antes da conclusão.
Run: `make check`; `git diff --check`.
Expected: EXIT 0 e cobertura 100%; logs/ledger preservados. Gate não autoriza merge.
