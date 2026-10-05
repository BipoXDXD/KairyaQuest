# Identidade do XP na 0005 — completar T-M4 sem inventar defeito de produção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar esta tarefa. Revisão independente antes de publicar.

**Goal:** Completar o recorte de identidade/FKs da T-M4 e corrigir a descrição ampla da pendência 97(j), preservando a cobertura indireta já existente de valores e conquistas.

**Architecture:** Um único teste SQL cria dois usuários com missão concluída, entrada de XP e conquista em 0004. O snapshot inclui IDs, valores, instantes, FKs brutas, vínculos lógicos e somatórios por usuário. O upgrade para 0005 e o downgrade de volta para 0004 precisam preservá-lo exatamente; finally restaura head e remove somente os usuários próprios e seus dados por CASCADE. Nenhum serviço de produção participa da construção.

**Tech Stack:** PostgreSQL real, SQLAlchemy 2.x, Alembic e pytest; nenhuma dependência nova.

**Spec:** README §§8–10; pendência 97(j)/T-M4 de `docs/HANDOFF.md`.

## Global Constraints

- Branch `wt/migracao-xp-identidade`, base `5ba81c3`, banco `focusquest_migracao-xp-identidade_test`, offset 17, implementador exclusivo.
- Não executar compose, usar banco real ou rodar pytest e E2E simultaneamente no mesmo banco.
- Nenhuma alteração permanente de migração, schema, produção, contrato, configuração ou dependência.
- Preservar PR14, outras fases e a cobertura existente da UNIQUE/bonus; não repetir seus probes.
- Commit assinado, push de uma ref e PR autorizados após revisão sem bloqueadores e gate final aprovado; nenhum merge.

## Review Focus

- `test_progression_migration.py` já atravessa 0005 e confere valores/datas/conquistas; não descrever a T-M4 como ausência total de cobertura.
- O snapshot novo compara `xp_entries.id` e `user_achievements.xp_entry_id` sem normalizá-los.
- Relatório RED precisa falhar por identidade, depois de passar payload/totais/vínculos, sem erro de FK/UNIQUE.
- SQL e migrations apontam para o banco de teste guardado; cleanup e restauração funcionam mesmo após asserção falhar.

### Task 1: Preservar identidade no roundtrip 0004↔0005

**Files:**
- Modify: `tests/integration/test_evaluation_migration.py`.
- Create: `docs/superpowers/plans/2026-10-05-migracao-xp-identidade.md`.
- Modify: `docs/HANDOFF.md` e `docs/ARCHITECTURE.md`.

**Interfaces:**
- Consumes: `command.upgrade/downgrade`, `alembic_config()` com `x=test=true`, SQL do esquema 0004.
- Produces: `test_ida_e_volta_0005_preserva_identidade_e_vinculos_do_xp_legado`.

- [x] **Step 1: Confirmar isolamento, hooks, preparo e baseline completo.**

Run: script de worktree, `uv run pre-commit install --install-hooks`, `make reset-test-db`, `make migrate-test`, `make check`.
Expected: EXIT 0, baseline 1436 Python/990 frontend/59 E2E, cobertura 100%.

- [x] **Step 2: Acrescentar o único teste e conferir contrato existente.**

Run: módulo de avaliação/migração ou caso novo focado; Ruff lint/format e mypy.
Expected: identidade preservada em upgrade/downgrade, versão conferida em cada etapa; finally head e cleanup próprio.

- [x] **Step 3: Provar renumeração válida e restaurar bytes.**

Na janela entre remover a UNIQUE antiga e criar a nova, copiar entradas com IDs deslocados por `max(id)+1`, apontar conquistas às cópias e remover originais. Preservar valores, ordem relativa e FKs reais. Executar o caso novo e o teste existente de valores do backfill; restaurar bytes em finally e conferir SHA-256.
Expected: novo teste RED na comparação do ID, após payload/totais/vínculos passarem; teste existente de valores continua aprovado. Sem violação FK/UNIQUE, sintaxe ou timeout; GREEN após restore.

- [x] **Step 4: Validar módulos relacionados e corrigir docs.**

Run: `uv run pytest tests/integration/test_evaluation_migration.py tests/integration/test_progression_migration.py`.
Expected: todos aprovados. Documentar resultados reais, completar somente T-M4 de 97(j) e manter demais itens; enviar diff/logs à revisão somente leitura.

- [ ] **Step 5: Gate completo e publicação.**

Run: `make check`, `git diff --check`.
Expected: EXIT 0, 1437 Python/990 frontend/59 E2E, cobertura 100%; fontes/HEAD/índice estáveis. Após revisão sem bloqueador, stage somente os quatro arquivos próprios, commit `-S` com hooks, push de uma ref e PR. Assinatura, HEAD, PR e CI no ledger ignorado; nenhum merge.

**Registro:** baseline não aprova arquivos novos. Gate final, revisão e publicação ficam registrados no ledger ao terminarem, sem reescrever fontes durante o gate. Migração 0005 de produção não tinha defeito observado e permanece byte a byte igual à base.
