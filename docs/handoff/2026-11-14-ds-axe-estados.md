# Axe nos estados da proposta de reagendamento e da evidência

## Objetivo
Item #173 da guarda-chuva #208: axe e alvos de 44px nos estados das telas
migradas que ainda não passavam pela galeria. Este PR cobre o cartão de
reagendamento da Kairya e o formulário de evidência. Ele também corrige o
motivo registrado na nota da lanterna, achado da varredura da #208.

Revisão-base: `main` em `816629d`.

## Decisões e porquê
- **Axe pela galeria `ui-states`, sem dependência nova.** O axe só existe no
  Playwright (`@axe-core/playwright`), que mede contraste num navegador de
  verdade; o jsdom não mede. Por isso, nada de `vitest-axe`.
- **Estados interativos montados pelo spec.** "Confirmando" e "falha ao
  confirmar" vêm de um clique com o POST interceptado (`page.route`). O erro
  de link vem de tirar o foco do campo. Os componentes não ganham nenhuma prop
  só para a galeria.
- **Exportados pelo `index` das features.** `EvidenceForm` e
  `RescheduleProposalCard` (com `useActionKeys` e os tipos) passam a sair do
  `index.ts` de `missions` e de `tutoring`. A regra 1 do `ARCHITECTURE.md` §5
  vale também para `src/test`, e o `noCrossFeatureInternals.test.ts` a impõe;
  o precedente são as tabelas de falha, exportadas para o teste dos textos.
- **Sem `.test.tsx` próprio para `DecisionControls`.** Os testes do
  `RescheduleProposalCard` e dos outros cartões já cobrem os estados dele.
- **Lanterna.** O motivo de gravar o "já vista" no efeito é o render puro: o
  React pode descartar um render. O render duplo do `StrictMode` não é o
  motivo, porque não se reproduz no React 19. O teste `useLanternReveal`
  reprova a gravação no render (verificado com a sabotagem).

## Alterações
- `src/test/gallery/caseIds.ts`, `cases.tsx` e `caseComponents.tsx`: dez
  casos novos, seis do cartão de reagendamento e quatro da evidência.
- `tests/e2e/ui-states.spec.ts`: três entradas novas no `SETUP`.
- `features/missions/index.ts` e `features/tutoring/index.ts`: as exportações
  que a galeria usa.
- `features/campaigns/lanternReveal.ts` e `lanternReveal.test.ts`: o
  comentário e o teste do hook.
- `docs/handoff/2026-11-14-ds-lanterna.md`: o motivo corrigido.

## Pendências
- Os outros cartões de proposta (criação de missão, plano) seguem cobertos só
  pelos testes de unidade e pelos E2E de fluxo. A galeria pode recebê-los no
  mesmo molde, se a revisão pedir.
