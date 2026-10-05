# Rótulos de reagendamento — pendência 161(a)

**Objetivo:** remover a cópia do tipo e do mapa de motivos da tutoria, mantendo os mesmos contratos e textos.

**Base:** `5ba81c3`, branch `wt/rotulos-reagendamento`, banco exclusivo e offset 10. Um implementador; nenhum compose neste worktree.

**Design aprovado pelo coordenador e revisor:** `tutoring/types.ts` importa `RescheduleReason` como tipo de `shared/types/mission.ts`; `RescheduleProposalCard.tsx` importa o mapa compartilhado diretamente. Remover os dois exports locais; sem reexport e sem import de outra feature. O `kind` desconhecido da 161(b) fica fora da fatia.

**Arquivos:** `frontend/src/features/tutoring/types.ts`, `frontend/src/features/tutoring/RescheduleProposalCard.tsx`, `docs/HANDOFF.md`, `docs/ARCHITECTURE.md` e este plano.

**Invariantes:** textos e union compartilhados preservados, shape de payload igual, dependências e gates iguais; nenhum teste existente alterado ou teste espelho novo.

**Foco da revisão:** import de tipo de shared, consumo direto do mapa pelo cartão, remoção dos dois exports locais, contrato/textos iguais, 161(b) preservada e registros verdadeiros.

## Task 1: Compartilhar motivos e rótulos

- Conferir isolamento e instalar hooks. Executar testes existentes de cartão, formulário e histórico no contexto `frontend/`.
  Comando: `npm --prefix frontend run test -- src/features/tutoring/RescheduleProposalCard.test.tsx src/features/missions/RescheduleForm.test.tsx src/features/missions/RescheduleHistory.test.tsx`.
  Esperado: EXIT 0, 45 testes (R2 verifica os três motivos no cartão).
- Aplicar os imports do design e retirar a union e o mapa duplicados. Atualizar arquitetura e somente a parte (a) da 161.
- Reexecutar os mesmos testes e `npm --prefix frontend run typecheck`.
  Esperado: EXIT 0, 45 testes e TypeScript sem erros; nenhuma edição de testes.
- Registrar comandos/resultados focados antes de congelar as fontes; revisão independente coordenada pelo root.
- Executar `make check` completo isolado, `git diff --check` e conferir estabilidade de fontes/HEAD/índice.
  Esperado: EXIT 0, cobertura 100%; contagens e resultados efetivos no ledger.
- Com revisão C0/I0/M0 e gate verde, commit assinado com hook normal, push de uma ref e PR contra main autorizados pelo root; não executar merge.

Evidências e resultados de publicação ficam em `.superpowers/sdd/2026-10-05-rotulos-reagendamento/`. Preservar outros worktrees e a publicação da fase core.
