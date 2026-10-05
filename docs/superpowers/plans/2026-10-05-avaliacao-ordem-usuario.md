# Avaliação antes do usuário — prova parcial da pendência 104

**Objetivo:** observar a missão retida e o usuário ainda livre enquanto a transação 2 aguarda a escrita da avaliação; nenhuma alteração permanente em produção.

**Base:** `5ba81c3`, branch `wt/avaliacao-ordem-usuario`, banco exclusivo e offset 13. Worktree criado pelo script do projeto; hooks instalados; nenhum compose.

**Design:** aprovado pelo root e verify_mcps. Provedor pelo Protocol segura a resposta após o commit da tentativa. O controlador trava somente MissionEvaluation; a Session observada captura o PID da transação 2 antes de registrar_resultado. `pg_blocking_pids` deve mostrar esse PID aguardando o holder. Sonda A: Mission FOR KEY SHARE NOWAIT recusa com LockNotAvailable; rollback. Sonda B: User FOR SHARE NOWAIT passa; rollback antes de liberar o holder. Confirmar avaliação, missão, evidência, operação e créditos40+20 próprios da missão.

**Arquivos:** `tests/integration/test_evaluation_concorrencia.py`, `docs/HANDOFF.md`, `docs/ARCHITECTURE.md` e este plano; logs/ledger ignorados. Reutilizar fixture local com cleanup CASCADE. Nenhum teste ignorado, dependência, contrato ou gate diferente.

**Limite:** prova da escrita da avaliação antes da trava do usuário e da missão retida nessa espera; o bloqueio da avaliação vem do UPDATE/flush atual. Não prova matriz inteira nem ordem global de todos os fluxos.

**Foco da revisão:** conflito NOWAIT real, observação do bloqueio real, três conexões distintas, clock fixo, exceções antecipadas propagadas, limpeza libera holder e resposta antes de shutdown; mutação semanticamente válida e fonte restaurada por SHA-256.

## Task 1: Provar a ordem na transação 2

- Executar baseline do módulo existente.
  Comando: `uv run pytest tests/integration/test_evaluation_concorrencia.py`.
  Esperado: EXIT0,5 testes.
- Escrever novo cenário e validar lint/formato/tipos.
- RED causal: mutação temporária carrega Mission sem trava e chama registrar_bonus antes de registrar_resultado; remove a chamada posterior, preservando rollback de tentativa superada. Esperado: sonda B falha por OperationalError/psycopg.LockNotAvailable, não por timeout ou código inválido. Restaurar bytes em finally e conferir SHA-256.
- GREEN: executar cenário e módulo real. Esperado: EXIT0,1 e6 testes; avaliação concluída tentativa1, modelo/feedback/instantes corretos, evidência intacta, uma operação e créditos40+20 únicos.
- Documentar os resultados e o limite parcial da104 antes de revisão/gate, sem declarar a matriz completa resolvida.
- Executar make check completo isolado e git diff --check. Esperado: EXIT0/cobertura100%, fontes/HEAD/índice estáveis. Revisão independente pelo verify_mcps.
- Gate100% e revisão aprovados autorizam commit-S com hooks, push de uma única ref e PR main; não executar merge.

Preservar worktrees e fontes das fases anteriores. Evidências: `.superpowers/sdd/2026-10-05-avaliacao-ordem-usuario/`.
