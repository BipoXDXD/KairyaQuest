# Paridade dos limites da avulsa e regra do som da conclusão

## Objetivo
Resolver #187 (limites de formulário com fonte única por lado, sem número
escrito no catálogo) e #191 (som quando a diária destrava uma conquista),
itens da guarda-chuva #206.

Revisão-base: `43f8a20` (origin/main).

## Decisões e porquê
- **#187:** três dos cinco critérios já estavam cumpridos na `main`
  (`MAX_DIFFICULTY` declarada uma vez, mínimos nomeados no back, CHECKs do
  banco conferidos por `tests/integration/test_checks_da_evidencia.py`).
  Faltavam o espelho da estimativa máxima da avulsa e o horizonte do prazo.
  - `MAX_ESTIMATE_MINUTES` e `MAX_DEADLINE_DAYS` foram para
    `shared/types/mission.ts`, ao lado de `MAX_DIFFICULTY`, porque missões e
    tutoria usam os dois.
  - Os textos do catálogo recebem o número por variável. `FailureText` ganhou
    `vars` opcionais, que o `FailureMessage` repassa à `message`.
  - O formulário do plano passa `minMinutes`/`maxMinutes` além do `max` de
    caracteres, porque o mesmo `t()` atende todos os erros do campo.
- **#191:** fica só a conquista, que já era o comportamento, por decisão da
  coordenação. O canal de efeitos toca um som por vez, e uma fila no player
  seria feature nova sem pedido. A regra está documentada em `soundCues.ts`
  e em `docs/AUDIO.md` §2.4.

## Alterações
- `tests/unit/test_paridade_dos_limites.py`: duas linhas novas na paridade e
  um teste que reprova se o catálogo voltar a escrever 1440 ou 365.
- Front: `shared/types/mission.ts`, `shared/i18n/failureText.ts`,
  `FailureMessage.tsx`, catálogos `pt-BR` e `en`, `RescheduleForm.tsx`,
  `rescheduleFailure.ts`, `tutoring/actionFailure.ts`, `WeekPlanForm.tsx`,
  `kairya/soundCues.ts`, com os testes correspondentes.
- `docs/AUDIO.md` §2.4: a prioridade dos efeitos de conclusão.

## Resultados
- O teste de paridade, o de literal no catálogo e os testes de `vars`
  reprovaram antes da implementação e passam depois.
- O caso "diária com conquista" passou de cara, porque descreve o
  comportamento atual. Reprovou com a prioridade invertida de propósito.
- O resultado do `make check` está no PR (rodado pelo hook do commit).

## Pendências
- Nenhuma nova.
