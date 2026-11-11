# 2026-11-10 — wt/fix-flaky-decide

**Objetivo.** Completar a correção do teste instável `useDecideAction.test.tsx` (falhou no gate de
10/11 lendo `confirming`). A `main` já trouxe a troca em D1, D6 e "UUID que lança" (commit 79e8690);
faltava o `it.each` "após falha ao recusar, libera uma nova decisão", com a mesma corrida.

**Revisão-base.** `main` em 4c30464 (merge da `main` na branch).

**Decisão.** Só teste: o `waitFor` espera o estado renderizado `idle` e os callbacks são afirmados
depois. O hook chama `changed`/`missionCreated` no mesmo callback do `setState`; quando o estado
renderiza, os callbacks já rodaram. O hook não mudou; nenhum timeout foi alterado.

**Comandos e resultados.**
- `npx vitest run src/features/tutoring/useDecideAction.test.tsx` 5x: 27/27 em todas (revisão independente).
- Sabotagem no hook (não chamar `changed`, não voltar a `idle`, não chamar `missionCreated`): 12, 12 e 11 testes falham.
- `make check` verde no commit de merge (gate pre-commit).

**Pendências.** Nenhuma nova.
