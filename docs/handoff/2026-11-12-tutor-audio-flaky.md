# Lote 24 -- flaky em `TutorPanel.audio.test.tsx:182`

## Sintoma
"no desktop, aceitar a proposta toca a voz da legenda visivel" falhou uma vez no
`make check` (`rig.voice()?.src` indefinido logo apos
`findByTestId('proposal-created')`) e passou 3/3 isolado.

## Causa raiz: (a) o teste afirma cedo demais; o produto esta correto
- `useDecideAction` chama `changed(...)` e `missionCreated()` no mesmo `.then`; o React
  agrupa os dois `setState` num unico commit: `proposal-created` e a fala
  `proposalAccepted` aparecem juntos.
- A voz sai de `useSpokenCue`, num **efeito passivo**. O React o descarrega numa
  tarefa do Scheduler (`setImmediate`) DEPOIS do commit.
- `findByTestId` resolve quando o DOM muda (MutationObserver), ou seja, pode resolver
  antes dessa tarefa. Em maquina carregada (gate completo) a ordem falha.
- Nao ha defeito de produto: o play acontece no mesmo ciclo de render, sem
  depender de render posterior nem de corrida com a proposta.

## Prova deterministica (vermelho sem sorte)
Config de vitest temporaria (nao commitada) cujo primeiro `setupFile` troca
`globalThis.setImmediate` por `setTimeout(fn, 25)` ANTES de o React carregar o
Scheduler, atrasando os efeitos passivos. Com o teste antigo:
`TypeError: .toMatch() expects to receive a string, but got undefined`
em `TutorPanel.audio.test.tsx:182` -- o mesmo sintoma, 100% das vezes.

## Correcao (so teste)
1. Desktop: `await waitFor(() => expect(rig.voice()?.src).toMatch(...))` -- espera o
   efeito observavel, sem sleep e sem aumentar timeout.
2. Mesmo padrao na forma negativa (celular, `expect(rig.voice()).toBeUndefined()`
   logo apos `findBy`): passava vazio com efeito pendente. Verificado: com
   `useSpokenCue` mutado para ignorar `inert`, o teste antigo ficava verde sob o
   scheduler lento. Agora o teste fecha a folha antes (todo render descarrega os
   efeitos pendentes, com a legenda ainda `inert`) e a mutacao reprova nos dois
   cenarios (scheduler normal e lento). `act(async () => {})` NAO basta: nao
   descarrega tarefa do Scheduler agendada fora do `act`.

## Verificacao
Ver o fim deste arquivo (resultados do `make check` e das repeticoes).

## Pendencia / risco (fora do escopo)
`Headquarters.audio.test.tsx` (`expect(elements).toHaveLength(0)` no fim) e
`MissionCard.audio.test.tsx` (`act(async () => Promise.resolve())`) tem forma
parecida de espera de efeito; nao falharam e nao foram alterados.

## Resultados (executados nesta sessao)
- `TutorPanel.audio.test.tsx` repetido 20x isolado: 20/20 com 5 testes passando.
- Scheduler lento (repro): teste antigo vermelho em :182; teste novo verde; mutacao
  de `useSpokenCue` (ignorar `inert`) reprova o teste do celular no cenario normal e
  no lento.
- `make check` sob a trava: exit 0 (pytest 2264 passed; Playwright 207 passed;
  frontend com cobertura 100% mantida).
