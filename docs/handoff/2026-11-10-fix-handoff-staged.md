# fix-handoff-staged — check-handoff avalia o que vai ser commitado

**Objetivo.** O `check-handoff` do pre-commit reprovava o commit de merge que traz a `main`
para uma branch antiga e devolve o `docs/HANDOFF.md` à versão da `main`. No pre-commit o `HEAD`
ainda é o commit anterior ao merge, então `git diff base...HEAD` via a edição antiga da branch.

**Revisão-base.** `main` em 4c30464.

**Decisão.** Com mudança staged ou `MERGE_HEAD`, o script monta um commit sintético do índice
(`git write-tree` + `git commit-tree`, pais `HEAD` e cada linha de `MERGE_HEAD`) e aplica o mesmo
critério de antes, `git diff --name-only base...sintético`. Sem nada staged, segue com `HEAD`
(CI e pre-push inalterados). O objeto sintético fica solto e o `git gc` o recolhe.

**Alterações.** `scripts/check-handoff.sh`; `tests/integration/test_check_handoff.py` (+5 testes:
merge que devolve o HANDOFF da main aprova; merge que mantém a edição reprova; edição staged
reprova; staged que reverte edição commitada aprova; edição fora do índice não conta).

**Resultados.** Os 3 testes de regressão falharam antes da correção; 13/13 passam depois.
shellcheck limpo.

**Pendências.** Nenhuma nova. Desbloqueia a sincronização do #68 e dos PRs antigos que editam
o `docs/HANDOFF.md`.
