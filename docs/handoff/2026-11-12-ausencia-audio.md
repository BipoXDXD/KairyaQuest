# Afirmacao de AUSENCIA de som sem descarregar efeitos (#159)

## Objetivo
O PR #157 mostrou que a voz sai de um efeito passivo, que o React descarrega numa
tarefa do Scheduler depois do commit; um `findBy*` pode resolver antes. Uma
afirmacao de AUSENCIA logo depois dele passa vazia. Este lote varre os demais
testes de som com a mesma forma e os corrige. So testes; nenhum codigo de producao
muda.

## Tecnica
`src/test/flushEffects.ts` exporta `flushPendingEffects()`: monta e desmonta uma raiz
propria e vazia (`renderHook(() => undefined).unmount()`). Todo render comeca
descarregando os efeitos passivos pendentes (de qualquer raiz), sem mexer na arvore sob
teste, sem `sleep` e sem prazo maior. Medido: `flushSync(() => {})` e
`act(async () => {})` NAO descarregam; a raiz vazia sim.

## Testes alterados
- `pages/Headquarters.audio.test.tsx` -- "nao cria nenhum elemento de audio": descarrega
  antes de afirmar `elements` vazio.
- `features/missions/MissionCard.audio.test.tsx` -- `completeWith` trocou
  `act(async () => Promise.resolve())` por `flushPendingEffects()` (vale para o "nenhum
  elemento" com som desligado e para os "so este efeito").
- `features/missions/EvaluationPanel.test.tsx` -- `evaluateWith` descarrega antes de ler
  os efeitos (`parcial`/`nao_atende` nao criam elemento).
- `features/campaigns/LanternTrail.test.tsx` -- "especial bloqueada nao toca nada", o
  `[]` anterior a liberacao da especial e o "uma vez" (que usava `act(async () => {})`).
- `App.test.tsx` -- "trocar de area corta a voz": a PRESENCA do primeiro `play` agora
  espera o efeito (`waitFor`), como no #157 (sob Scheduler lento, `elements[0]` era
  indefinido). A parte de ausencia ("voltar nao fala de novo") ja roda dentro de
  `act(async)`; nao mudou.

## Prova por mutacao (copias mutadas do produto, revertidas; nada commitado)
Cenarios: "normal" (`vitest` padrao) e "lento" (config temporaria, nao commitada, cujo
primeiro `setupFile` troca `setImmediate` por `setTimeout(25ms)` ANTES de o React
carregar o Scheduler; a ordem importa -- com `mergeConfig` o setup do projeto vinha
antes e a config nao reproduzia nem o #157).

| Teste | Mutacao | Teste antigo (normal / lento) | Teste novo (normal / lento) |
|---|---|---|---|
| Headquarters | efeito da resposta toca `soft_error` e o provider ignora o mute para esse som | vermelho / VERDE (vacuo) | vermelho / vermelho |
| MissionCard "som desligado" | conclusao dispara um efeito passivo que toca ignorando o mute | vermelho / VERDE (vacuo) | vermelho / vermelho |
| EvaluationPanel `parcial`, `nao_atende` | idem, no resultado da avaliacao | vermelho / VERDE (vacuo) | vermelho / vermelho |
| LanternTrail "bloqueada nao toca" e "[] antes da liberacao" | `SpecialItem` toca sem checar `ready` | vermelho / VERDE (vacuo) | vermelho / vermelho |
| App "voltar nao fala de novo" | `useSpokenCue` sem deps e sem a guarda de fala dita | antigo reprova antes, na PRESENCA do 1o `play` (lento); ausencia: so medida no novo | vermelho / vermelho (ausencia dentro de `act`) |

## Limites (honestidade)
- MissionCard e EvaluationPanel tocam por callback sincrono, nao por efeito; a mutacao
  modela a regressao "mover o som para um efeito". O flush protege o teste contra ela.
- O "uma vez" da LanternTrail (`expectPlayedOnce`) trocou `act` por `flushPendingEffects`,
  mas nenhuma mutacao realista o diferencia: o cenario nao tem um segundo render depois
  do primeiro som. Nao ha prova por mutacao para essa segunda afirmacao.
- Sob o Scheduler lento, 2 testes nao-audio ja reprovam e NAO foram tocados:
  `CycleSection.createPlan.test.tsx` ("plano da proxima semana") e `TutorPanel.test.tsx`
  ("P32 a conversa rolavel").
- `useSpokenCue.test.tsx`, `useTutorPresence.test.tsx` e `KairyaBubble.test.tsx` mudam
  estado dentro de `act`/`rerender` sincronos, que descarregam efeitos na saida: sem risco.

## Resultados (executados nesta sessao)
Ver o fim deste arquivo.
- `make check` sob a trava: exit 0 (vitest 2810 passed em 136 arquivos, cobertura do
  frontend 100% mantida, pytest 2335 passed, Playwright 207 passed).
- Os 5 arquivos alterados, 20x: 20/20 no cenario normal e 20/20 no Scheduler lento
  (107 testes por rodada).
