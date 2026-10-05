# Pendência 83 — reconhecer o roundtrip populado já existente

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar esta tarefa. Revisão independente antes de publicar.

**Goal:** Corrigir somente a descrição desatualizada da 83, reconhecendo o teste explícito populado da 0004 na base; preservar seus limites de normalização de IDs e reconstrução da progressão.

**Architecture:** Alteração documental em handoff/arquitetura, com plano próprio. A função existente `test_ida_e_volta_0004_populada_preserva_legado_e_reconstroi_progressao` exige dados não vazios, compara legado em 0003↔head e reconstrói XP/conquistas sem IDs brutos. Nenhum teste ou código será modificado.

**Tech Stack:** Markdown; gate existente PostgreSQL/pytest/frontend/E2E, sem dependência nova.

**Spec:** README §§9–10; `docs/HANDOFF.md`, pendência 83; teste existente em `test_progression_migration.py`.

## Global Constraints

- Branch `wt/docs-roundtrip-populado`, base `5ba81c3`, banco `focusquest_docs-roundtrip-populado_test`, offset 20, implementador exclusivo.
- Não executar compose nem pytest/E2E juntos no mesmo banco; não tocar código, migrações, testes, configuração ou outras pendências.
- Fontes da PR18 e outros checkpoints permanecem congelados; CI final apenas no ledger ignorado correspondente.
- Commit assinado, push de uma ref e PR autorizados após revisão sem bloqueadores e gate final aprovado; nenhum merge.

## Review Focus

- Riscar apenas a descrição antiga da 83; o teste estrutural de tabelas continua existente e há outro caso explicitamente populado.
- Distinguir valores/vínculos lógicos reconstruídos da identidade bruta tratada em T-M4/97; não alegar sequência, índice ou todo o schema.
- Snapshot do legado considera colunas de 0003; `fallback_model` posterior fica fora conforme o helper.
- A suíte de 25 testes da fase T-M4 foi executada nesta sessão com o arquivo igual à base; não aprova esta nova árvore documental. Gate próprio obrigatório.

### Task 1: Atualizar o registro da 83

**Files:**
- Modify: `docs/HANDOFF.md`, somente relato da fatia e item 83.
- Modify: `docs/ARCHITECTURE.md`, descrição do teste existente.
- Create: `docs/superpowers/plans/2026-10-05-docs-roundtrip-populado.md`.

**Interfaces:**
- Consumes: teste populado existente e evidência local já executada.
- Produces: descrição documental precisa da cobertura e dos limites, sem comportamento novo.

- [x] **Step 1: Confirmar fonte, isolamento, hooks e baseline.**

Run: leitura do teste/base, conferência SHA, script worktree, `uv run pre-commit install --install-hooks`, `make reset-test-db`, `make migrate-test`, `make check` com manifesto antes/depois.
Expected: teste igual à main e à fase anterior; baseline EXIT 0, 1436 Python/990 frontend/59 E2E, 100%, fontes/HEAD/índice estáveis.

- [x] **Step 2: Corrigir descrição e documentar limites.**

Riscar a 83 antiga, apontar o caso populado e suas asserções não vazias/legado/reconstrução. Descrever IDs normalizados e colunas legadas; preservar todos os outros itens. Arquitetura registra responsabilidade do caso existente.

- [x] **Step 3: Revisar o diff documental.**

Run: `git diff --check`, conferir `git diff -- src tests alembic` vazio; enviar diff e evidências à revisão somente leitura.
Expected: somente os três arquivos próprios; nenhuma prova nova ou defeito de produção inventado.

- [ ] **Step 4: Gate completo e publicação.**

Run: `make check` da árvore final congelada.
Expected: EXIT 0, 1436 Python/990 frontend/59 E2E, 100%, fontes/HEAD/índice estáveis. Após revisão sem bloqueador: stage somente três arquivos próprios, commit `-S` com hooks, push de uma ref e PR main. Registrar assinatura, HEAD, PR e CI no ledger ignorado; nenhum merge.

**Registro:** resultados finais de revisão/gate/publicação ficam no ledger ao terminarem; o baseline não aprova docs novos. Não adicionar teste redundante nem tocar a pendência 97.
