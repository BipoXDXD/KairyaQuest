# Axe na recusa da proposta e no aviso de cópia do plano

## Objetivo
Item #173 da guarda-chuva #208, continuação do PR anterior
(`2026-11-14-ds-axe-estados.md`). A galeria `ui-states` passa a cobrir os
estados da recusa do `DecisionControls` e o aviso de "segunda copiada" do
`WeekPlanForm`. Este PR também fortalece as asserções dos casos de
confirmação, como pediu a revisão anterior.

Revisão-base: `main` em `10e8adc`.

## Decisões e porquê
- **Mesmo molde do PR anterior.** "Recusando" e "falha ao recusar" vêm de um
  clique, com o POST de `/reject` interceptado. Nenhum componente ganha prop
  só para a galeria.
- **Falha que se repete na recusa.** O 503 com corpo vazio cai em `retry`, e
  não em `refresh`. O Recusar vira "Tentar de novo" e o Confirmar volta ao
  normal, que é o ramo que a galeria ainda não media.
- **POST que nunca responde.** O fetch desiste sozinho depois de
  `MUTATION_TIMEOUT_MS` (20 s), bem depois do axe. Um comentário em cada caso
  registra isso.
- **Mesma chave de operação na segunda tentativa.** O caso "falha ao confirmar"
  agora clica em "Tentar de novo" e confere que o `operation_id` das duas
  chamadas é o mesmo. É a garantia de que repetir não duplica.
- **O aviso de cópia também em inglês.** O caso entra em `ENGLISH_CASE_IDS`
  como os outros do formulário. A asserção escolhe o texto pelo `lang` da URL
  da variante e confere que o dia seguinte recebeu a segunda: o tom `neutral`
  sozinho não prova nada, porque o aviso vazio também é neutro.
- **Nome acessível inteiro nos botões.** Confirmar e Recusar são conferidos
  com `toHaveAccessibleName` (rótulo visível, espaço e o alvo `sr-only`), e
  não com `toContainText`: um rótulo novo que contivesse o antigo passaria, e
  o nome inteiro também prova o espaço fora do `span`.

## Alterações
- `src/test/gallery/caseIds.ts` e `cases.tsx`: três casos novos
  (`week-plan-copy-monday`, `reschedule-proposal-rejecting` e
  `reschedule-proposal-reject-failed`), mais o comentário sobre a origem dos
  estados; `caseComponents.tsx`: a doc do `RescheduleProposalCase`.
- `tests/e2e/ui-states.spec.ts`: três entradas novas no `SETUP` e as
  asserções reforçadas em `reschedule-proposal-confirming` e
  `reschedule-proposal-confirm-failed`.

## Pendências
- `MissionCard` e `MissionList` ainda não passam pela galeria.
