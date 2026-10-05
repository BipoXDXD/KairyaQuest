# Diagnóstico de falhas no worker da Tifa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Propagar o erro original do worker durante as esperas de sinal e de bloqueio, sem substituir a prova de concorrência do PostgreSQL.

**Architecture:** Somente helpers e testes de integração. O bloco de disputa com rollback/evento antes do shutdown do executor será compartilhado pelos cenários normais e pelas falhas; nenhum arquivo em `src/` muda.

**Tech Stack:** Python, pytest, Future/ThreadPoolExecutor e PostgreSQL via SQLAlchemy já existentes.

**Spec:** Design delegado e aprovado pelo responsável nesta sessão: antes/depois do sinal, mesma limpeza, identidades reais de erro, trava livre e estado original após rollback.

## Global Constraints

- Base do incremento: PR #7, `0cb4cc2`; PR empilhado contra `wt/tifa-conclusao`, sem merge da main.
- Um implementador neste worktree, banco próprio e offset15; não rodar compose.
- Manter PIDs, `pg_blocking_pids`, clocks e expectativas das duas ordens originais.
- Polling de Future usa `done()` seguido de `result()` sem esperar outro prazo; falha do worker tem precedência sobre timeout opaco.
- Hooks normais, assinatura e gate completo com cobertura100%; nenhuma dependência nova.

## Review Focus

- Worker falha antes do sinal: erro sentinela original aparece.
- Worker falha depois do sinal: observador não esconde a exceção atrás de ausência de bloqueio.
- Falha do harness: rollback do vencedor precede shutdown do executor.
- Falha do worker: sessão fecha e rollback restaura ação/trava.
- Caminho normal: backend exato continua bloqueado pelo vencedor e efeitos das duas ordens permanecem.

### Task1: Helpers com diagnóstico e provas de rollback

**Files:** Modify `tests/integration/test_tutoring_conclusao_concorrencia.py`, `docs/HANDOFF.md`; create este plano; evidências no ledger ignorado.

**Interfaces:** Helper comum recebe worker callable real com eventos/PIDs; retornará os resultados normais. Esperas recebem Future e verificam finalização enquanto aguardam a condição.

- [x] Step1: Rodar os2cenários originais; extrair somente o bloco de disputa/limpeza sem mudar esperas, e verificar2cenários.
- [x] Step2: Adicionar falhas antes/depois do sinal. Worker real abre Session, trava e altera payload da ação sem commit, então levanta a MESMA instância de sentinela. Vencedor usa conclusão real. Teste exige propagação do erro e depois consulta missão/ação com `FOR UPDATE NOWAIT` em conexão nova; estado, prazo, payload, operações e XP devem continuar originais.
- [x] Step3: RED contra esperas atuais: falhas devem mostrar sinal/bloqueio timeout em vez da sentinela esperada.
- [x] Step4: GREEN: helper de sinal faz polling de Event e Future; observador faz polling de Future sem remover consulta `pg_blocking_pids`. Future finalizado com sucesso antes da condição falha explicitamente.
- [x] Step5: Rodar módulo, Ruff/mypy e suíte relacionada; mutações removem cada checagem de Future e exigem erro opaco correspondente; restaurar bytes em finally e conferir SHA.
- [ ] Step6: Documentar resultados, revisão independente verify_mcps, gate final com fontes/HEAD/índice congelados.
- [ ] Step7: Somente depois revisão e gate aprovados: commit-S normal, push1ref com pre-push e PR empilhado; não fazer merge.

## Evidência desta sessão

Extração preservada:2pass. RED:2falhas esperas opacas/2pass20,73s. GREEN:4pass0,52s.
Quatro mutações EXIT1, com restauração SHA-256 `593354361acf6b663d999835a4c38a31d0cd7cdf4755b84cf11fab24cf966d3f` e GREEN restaurado.
Suíte relacionada43pass9,10s; Ruff/mypy aprovados. Fontes de produção intactas.
Falhas testadas são antecipadas no worker, antes/depois do sinal; não alegar prova
de falha do coordenador enquanto worker já bloqueado. Revisão/gate/publicação
posteriores no ledger, com estado real e manifestos de estabilidade.
