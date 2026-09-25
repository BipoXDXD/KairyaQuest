# Incremento D — Plano de Implementação (a progressão)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a progressão de RPG: saldo de XP, nível e conquistas no Quartel-General, com anúncio de recompensa no cartão concluído, contexto de progresso para a Tifa, e retroativamente para as missões já concluídas.

**Architecture:** Módulo novo, `progression`, no backend (`src/focusquest/modules/progression/`) e no frontend (`frontend/src/features/progression/`). Migração `0004_progressao` no Alembic com backfill retroativo das missões já concluídas. Nenhuma mudança em `missions` nem `tutoring`; apenas integração do crédito na conclusão (D3 da spec).

**Tech Stack:** Python 3.12, SQLAlchemy, Pydantic, FastAPI (backend); React 19, TypeScript, Tailwind 4, Vitest, Testing Library, Playwright + axe-core (frontend). Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-25-incremento-d-progressao-design.md` — decisões D1–D16, modelo de dados, domínio puro, serviço, API, frontend, A Tifa e testes.

## Global Constraints

- Interface em pt-BR com acento; contratos externos (chaves JSON, rotas) em inglês; identificadores do código em inglês; comentários e docstrings em português **sem acento**, como o resto do código (`AGENTS.md` §3, README §3, `docs/ARCHITECTURE.md` §5 regra 7).
- `make check` verde antes de cada commit (os hooks o rodam); proibido `--no-verify`, `SKIP`, `|| true`, teste ignorado, diretiva de ignorar cobertura, limiar reduzido (`AGENTS.md` §3).
- Cobertura de 100% em `src/` e em `frontend/src/` nos quatro eixos (fonte: `Makefile` e `frontend/vite.config.ts`).
- **Regra da casa (spec, "Testes"):** cada teste novo é visto reprovando — antes do código (RED) e por mutação depois dele. Cada Task lista as mutações; o relatório da Task registra o resultado de cada uma.
- Datas civis nunca passam por `new Date(civil)` com fuso: só pelas funções de `civilDate` (Risco 3 do B, emendado pela Task 5 do C). Os testes do Vitest rodam em `Asia/Tokyo` (`vite.config.ts`).
- Nenhuma chamada HTTP fora de `shared/api/` (`docs/ARCHITECTURE.md` §5 regra 6); nenhum import de detalhe interno de outra feature (§5 regra 1) — o que duas features usam sobe para `shared/` (§5 regra 3).
- Base: a `main` com o C mesclado (8ab91ce, merge do PR #14) + a spec (1551ea8) + o merge da Frente 0 (d2125d5, `feat/gate-paralelo`). Este worktree tem banco de teste (`focusquest_d_test`) e portas do E2E próprias; `make check` não colide com outros. NÃO rode `make db-up`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Commit, push, PR e merge só com autorização do dono (`AGENTS.md` §2).

## Review Focus

1. **Nada duplica XP nem conquista.** Duas travas: a missão concluída é terminal (A5) **e** `xp_entries.mission_id` é UNIQUE. Deadlock não acontece: ordem fixa missão → usuário em todo caminho (D12). Testes na Task 3 (integração).
2. **A recompensa do reenvio é idêntica ao original.** Reconstruída do banco a partir do lançamento, não recalculada (D10). Um teste compara o corpo do reenvio com o original **depois** de outras conclusões no meio (Task 3).
3. **As retroativas são verdadeiras.** A migração lança XP de toda missão concluída com a data real, destrava conquistas com a data em que foram cumpridas pela primeira vez (D7), e um teste prova equivalência com o serviço (Task 2).
4. **A cópia congelada da migração não diverge da regra viva.** Teste de equivalência após o D; depois dele a cópia é histórico (D8, Task 2).
5. **O painel mostra progresso correto, e o anúncio mostra a recompensa do momento.** O anúncio mostra o saldo do momento da conclusão, o painel mostra o atual — é a semântica certa (D10, Task 6).
6. **A Tifa sabe o progresso, mas não pode pedir XP.** Contexto traz nível, saldo e conquistas, só leitura (D15). Um teste prova que "dar-me 100 XP" não altera `xp_entries` (Task 8).

---

## Decisões que a spec não fixava (entram no HANDOFF na Task 9)

| # | Decisão | Motivo |
|---|---|---|
| D' | O painel de progresso fica **acima** do ciclo no `Headquarters.tsx`, renderizado antes de `<CycleSection />` | Progresso é o topo da página. Os hooks `useProgress` e `useCycle` rodam em paralelo; o refresh do painel pedido pelas duas formas de conclusão usa um `ref` à mesma maneira do que o quadro (`MissionListHandle`). |

## Mapa de arquivos

Backend (Task 1, integração com missions):

- Create: `src/focusquest/modules/progression/domain.py`, `progression/service.py`, `progression/router.py`.
- Create: `alembic/versions/0004_progressao.py` (migração com backfill).
- Create: `tests/unit/test_progression_domain.py`, `tests/integration/test_progression_service.py`, `tests/integration/test_progression_migration.py`, `tests/e2e/test_progression_api.py`.
- Modify: `src/focusquest/modules/missions/service.py` (chamar `progression.registrar_conclusao`), `src/focusquest/main.py` (incluir router novo), `src/focusquest/modules/tutoring/context.py` (linha de progresso).
- Modify: `tests/e2e/test_missions_api.py` (o `POST /api/missions/{id}/complete` agora leva `reward`).

Frontend (Task 5, integração com missions):

- Create: `frontend/src/features/progression/types.ts`, `useProgress.ts`, `ProgressPanel.tsx`, `ProgressPanel.test.tsx`.
- Create: `frontend/src/features/missions/RewardAnnouncement.tsx`, `RewardAnnouncement.test.tsx`.
- Create: `frontend/src/shared/types/reward.ts`.
- Modify: `frontend/src/pages/Headquarters.tsx` (+ teste), `frontend/src/features/missions/MissionList.tsx` (+ teste), `frontend/src/features/missions/useCompleteMission.ts` (+ teste), `frontend/src/features/missions/cycle.spec.ts` (E2E).

Docs (Tasks 2, 6, 9):

- Modify: `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY.md`.

---

### Task 0: Revisão-base do Incremento D

**Files:**

- Modify: `docs/HANDOFF.md` (seção "Revisão-base", no topo)
- Add: este plano

- [ ] **Step 1: Registrar a revisão-base.** Inserir, logo depois de `## Revisão-base`, um parágrafo "**Incremento D — a progressão.**" com: a branch `feat/incremento-d`, a base (a `main` 8ab91ce, merge do PR #14, + a spec 1551ea8 + o merge da Frente 0 d2125d5), a spec e este plano, o recorte (saldo, nível, conquistas; entrega e avaliação ficam para o E), e "**Estado de publicação: não publicado.**"
- [ ] **Step 2: Gate.** Run: `make check` — Expected: EXIT 0 (só documentação mudou).
- [ ] **Step 3: Commit.**

```bash
git add docs/HANDOFF.md docs/superpowers/plans/2026-09-25-incremento-d.md
git commit -m "docs(progressao): spec e plano do incremento d, revisao-base

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Próximas Tasks (esboço)

- **Task 1:** Domínio puro (`progression/domain.py`), testes (RED).
- **Task 2:** Migração e backfill (`0004_progressao.py`), serviço base (`progression/service.py`), testes.
- **Task 3:** Integração com `missions.service`, API (`progression/router.py`), testes E2E de conclusão.
- **Task 4:** Contexto da Tifa (`tutoring/context.py`).
- **Task 5:** Frontend: painel, anúncio de recompensa, hook `useProgress`, integração com missões, testes de cobertura.
- **Task 6:** E2E: conclusão com anúncio, painel atualizado, axe.
- **Task 7–9:** Revisão, correções, documentação final.
