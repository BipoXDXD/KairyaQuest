# Kairya: celebração na conclusão, no nível e na conquista — 2026-11-11

Tarefa 6.3e da Fase 6 (presença da Kairya). Revisão-base: `c08813d`.

## O que muda

- `features/kairya/celebration.ts` (puro): `completionEvents` e
  `evaluationEvents` transformam conclusão e avaliação em `KairyaEvent[]`.
- `MissionCard` despacha `completionEvents` ao concluir; `EvaluationPanel`
  (`EvidenceAndEvaluation`) despacha `evaluationEvents` a cada avaliação
  concluída, via `useKairya().dispatchAll`.
- `features/kairya/index.ts` exporta as duas funções.

## Decisão R6

O tipo da missão decide a celebração: `diaria` → `dailyDone`, `especial` →
`weeklyTrialDone`, `avulsa` → `missionDone`. Depois, `levelUp` se
`level_after > level_before` e `achievement` se houver conquistas. Sem
`reward` (ausente ou `null`), só o evento do tipo. Os eventos saem em ordem e o
reducer, que já resolve a prioridade (D2), fica com o mais forte. Avaliação:
`atende` e `parcial` viram `say`, `nao_atende` vira `concern`, sem veredito
não reage; o bônus soma só nível e conquista.

## Delta de assinatura (sem dependência nova, sem endpoint novo)

- `useCompleteMission(missionId, registry, onCompleted?: (outcome: CompletionOutcome) => void)`;
  `CompletionOutcome = { mission: Mission; reward: Reward | null | undefined }`.
  A missão não leva a chave `reward`.
- `useRequestEvaluation(missionId, onRewarded?, onResult?: (result: EvaluationResult) => void)`;
  `onResult` roda em todo sucesso e, se lançar, só registra com `console.error`.

## Nota para a revisão

O reducer guarda uma única fala por celebração (D2), e `SpeechCue.detail` é um
só `CaptionDetail`. Com nível e conquista juntos, a bolha mostra a fala e a
legenda do nível; a conquista aparece no `RewardAnnouncement` do cartão. A
legenda de conquista só entra na bolha quando não há nível novo. Juntar as
legendas exige mudar `CaptionDetail` e o reducer (fora desta tarefa).

## Verificação

`npx vitest run src/features/kairya src/features/missions src/pages`: 1046
testes verdes, arquivos tocados com 100%. `npm run typecheck` e `npm run lint`
limpos. `make check` fica com o gate de commit.
