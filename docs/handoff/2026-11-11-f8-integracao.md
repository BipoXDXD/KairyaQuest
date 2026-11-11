# F8: integração do áudio (gatilhos, voz da legenda e E2E)

- **Branch:** `wt/f8-gatilhos`, a partir de `48514c7`.
- **Objetivo:** ligar o áudio pré-gerado (PR A) ao app e provar, ponta a ponta,
  o convite, a preferência, a voz da legenda, os efeitos e as falhas.

## Decisões

- **D14 (voz da legenda):** o `KairyaBubble` chama `useSpokenCue(cue)`, que toca
  o mp3 da fala uma vez por identidade de `SpeechCue` (`WeakSet`, preenchido
  mesmo com a voz desligada) e corta quando a fala some. O corte é agendado em
  microtask e cancelado por qualquer fala nova, para o StrictMode não cortar a
  fala que acabou de começar.
- **D15 (folha da tutora):** só o clique que abre a folha no celular corta a
  voz; no desktop o painel não cobre a bolha. Fechar a folha não retoma a fala.
- **D16 (troca de área):** `App.navigate` corta a voz antes do `flushSync`; o
  Quartel-General segue montado e oculto, e a mesma fala não repete na volta.
- **D17 (efeitos por eventos):** funções puras (`sfxForCompletion`,
  `sfxForEvaluation`, `sfxForTutorEvent`) chamadas onde os eventos já são
  despachados, sem observador do estado da presença.
- **D18 (`streak_kept`):** `readStreak()` no contexto da Kairya; a saudação com
  sequência viva soa, sem re-render dos consumidores.
- **D19 (trilha e painel):** `weekly_trial_unlocked`, `trail_step` e
  `panel_open` saem direto de `LanternTrail` e `TutorPanel`, sem prop nova.

## E2E (`frontend/tests/e2e/audio.spec.ts`)

- Os cenários do brief, com `storageState` vazio para o convite voltar.
- A bolha não tem `data-line`: o spec acha o `LineId` pelo texto da legenda
  contra o catálogo pt-BR importado do app.
- Evento repetido: `Math.random` substituído por `addInitScript` (sementes 0 e 1,
  via `Object.defineProperty`: o `noMathRandom.test.ts` varre `tests/e2e`, e só
  `Math.random` escrito no código o acusa)
  e relógio do navegador andando os 3 s da celebração entre conclusões; a
  resposta de `complete` perde o `reward` só nesse teste, porque nível e
  conquista tomam a fala e gastam sorteios, o que quebraria a alternância A, B, A.
- Cada teste que conclui a diária usa um dia diferente da semana semeada
  (2025-03-03): a diária concluída não volta a ficar disponível.
- `tsconfig.e2e.json` ganhou `jsx` e `vite/client`: as constantes importadas de
  `src/shared/audio` alcançam um `.tsx` e um `import.meta.env`.

## Pendências

- Escuta do dono dos 12 efeitos e das amostras de fala (EN e PT).
- N1 a N3 da F6 seguem abertos.
