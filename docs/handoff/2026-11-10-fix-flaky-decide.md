# 2026-11-10 — wt/fix-flaky-decide

- Pendência encerrada: teste instável `useDecideAction.test.tsx` (falhou no gate de 10/11 lendo `confirming`).
- Causa: o hook chama `changed`/`missionCreated` no mesmo tick do `setState`; o React renderiza depois. O teste esperava o callback e afirmava o estado em seguida, uma corrida sob carga.
- Correção só no teste: o `waitFor` espera o estado `idle`; os callbacks são afirmados depois. O hook não mudou; nenhum timeout foi alterado.
- Evidência: com atraso injetado (fora do repo), 39/50 falhas antes e 0/50 depois; carga natural 0/60 nos dois.
