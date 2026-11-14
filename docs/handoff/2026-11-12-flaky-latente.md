# Flaky latente sob Scheduler lento (#161)

## Objetivo
Resolver a `P-ausencia-audio-1`: sob um Scheduler do React lento, dois testes que nao
sao de audio reprovavam (`CycleSection.createPlan.test.tsx` "plano da proxima semana" e
`TutorPanel.test.tsx` "P32 a conversa rolavel"). So testes; nenhum codigo de producao
muda. A causa nao e uma race de producao (ver "Causa raiz").

Revisao-base: `dd942b0` (origin/main).

## Reproducao (deterministica)
A config e o setup abaixo sao TEMPORARIOS: nao entram no repo (o #159 tambem nao os
commitou). Salve os dois em `frontend/` e rode com `--config`.

`frontend/vitest.slow-scheduler.setup.ts` -- o React escolhe `setImmediate` para o
Scheduler quando ele existe, no instante em que carrega. Trocar `setImmediate` por um
`setTimeout` de 25 ms ANTES disso deixa lenta a tarefa que renderiza updates e
descarrega efeitos passivos fora do `act`. O `setTimeout` REAL e capturado de
proposito: sem isso, um teste com `vi.useFakeTimers()` adiaria o Scheduler por tabela e
dezenas de testes de prazo reprovariam por um motivo que nao e o do lote.

```ts
const realSetTimeout = globalThis.setTimeout
const slow = ((fn: (...a: unknown[]) => void, ...args: unknown[]) =>
  realSetTimeout(fn, Number(process.env.SCHEDULER_DELAY_MS ?? 25), ...args)) as unknown as typeof setImmediate
;(globalThis as { setImmediate: unknown }).setImmediate = slow
```

`frontend/vitest.slow-scheduler.config.ts` -- o setup lento TEM de vir antes do setup do
projeto (com `mergeConfig` o do projeto vinha antes e o React ja tinha o Scheduler):

```ts
import base from './vite.config.ts'

export default {
  ...base,
  test: {
    ...base.test,
    setupFiles: ['./vitest.slow-scheduler.setup.ts', ...(base.test?.setupFiles ?? [])],
  },
}
```

Comandos (em `frontend/`, um Vitest por vez, `--maxWorkers=6`):

```bash
export VITE_CONFIG_NATIVE_IGNORE_WARNING=true
# normal
timeout 600 npx vitest run --maxWorkers=6
# lento (padrao 25 ms; SCHEDULER_DELAY_MS muda o atraso)
timeout 600 npx vitest run --config vitest.slow-scheduler.config.ts --maxWorkers=6
SCHEDULER_DELAY_MS=100 timeout 600 npx vitest run --config vitest.slow-scheduler.config.ts --maxWorkers=6
```

## Causa raiz
Tudo o que o React agenda fora do `act` roda numa tarefa do Scheduler, DEPOIS de quem
chamou:
o render de um `setState` vindo de `fetch`/promessa e os efeitos passivos. Um `findBy*`
ou um `waitFor` que espera outra coisa (a linha de `fetch` no mock, uma regiao que ja
existia) resolve ANTES dessa tarefa, e a afirmacao seguinte olha um DOM/estado que ainda
nao foi desenhado. Em maquina normal a tarefa roda em microssegundos e o teste passa por
sorte; com a tarefa 25 ms atras, reprova. Nenhum desses casos e race de producao: no
produto o usuario so age sobre o que ja foi desenhado.

| Teste | O que o teste afirmava cedo demais |
|---|---|
| `CycleSection.createPlan` "plano da proxima semana" (+ irmaos `LanternTrail.createPlan` e `WeekPlanEntry.test` com o mesmo trecho) | `toHaveFocus()` na confirmacao logo depois do `findByTestId`. O foco vai para a confirmacao num `useEffect` de `WeekPlanEntry.tsx`, que roda na tarefa do Scheduler depois do commit que o `findBy` viu. |
| `TutorPanel.test` "P32 a conversa rolavel" | `findByRole('region')` resolve no primeiro render (a regiao existe desde antes de o historico chegar) e o `getByTestId('tutor-messages')` seguinte ainda nao encontra a lista: o `setHistory` do `GET` so renderiza na tarefa do Scheduler. |
| `useTutorConversation.test` "de duas atualizacoes silenciosas" e "a atualizacao silenciosa que falha mantem..." (achados na varredura, intermitente a 25 ms) | `waitFor` na contagem de `GET`s (que sai sincrona, no mesmo handler que faz `setSend('failed')`) e em seguida `retry()` e `send.status === 'failed'`/`messages` lidos antes do commit. |
| `WeekPlanForm.test` "plano_existente na semana atual avisa..." (so a 100 ms) | `waitFor(onExists)` (callback sincrono) e o texto do aviso lido antes do commit que o desenha. |

## Correcao (so teste, no padrao do #159)
Espera-se o efeito OBSERVAVEL (`waitFor`/`findBy` do proprio foco, da lista, do estado
ou do texto), nunca o tempo: nenhum timeout aumentado, nenhum retry, nenhum `sleep`.
Nos testes de AUSENCIA mantida (a atualizacao silenciosa que falha nao apaga a resposta
provisoria) espera-se primeiro a PRESENCA e so depois se deixa a atualizacao chegar, para
que a afirmacao de ausencia continue valendo.

Arquivos: `missions/CycleSection.createPlan.test.tsx`, `tutoring/TutorPanel.test.tsx`,
`campaigns/LanternTrail.createPlan.test.tsx`, `campaigns/WeekPlanEntry.test.tsx`,
`campaigns/WeekPlanForm.test.tsx`, `tutoring/useTutorConversation.test.tsx`.

## Prova (executada nesta sessao; suite completa do Vitest, 136 arquivos / 2810 testes)
| Cenario | Antes | Depois |
|---|---|---|
| normal | 2810 passam | 2810 passam |
| Scheduler 25 ms | 4 reprovam (P32; plano da proxima semana x3: CycleSection, LanternTrail, WeekPlanEntry); `useTutorConversation` reprova de forma intermitente (1 em 5 rodadas do arquivo) | 0 reprovam |
| Scheduler 100 ms | 7 reprovam (os acima + 2 de `useTutorConversation` + `WeekPlanForm`) | 0 reprovam |

Os dois arquivos da pendencia, 20x cada cenario: normal 20/20, lento (25 ms) 20/20.
Mensagem do vermelho original (CycleSection): `expect(element).toHaveFocus()` com o
`body`/bolha da Kairya como elemento focado; (P32) `Unable to find an element by:
[data-testid="tutor-messages"]`.

## Mutacao (copias mutadas do produto, revertidas; nada commitado)
Os testes corrigidos afirmam PRESENCA (foco, lista), entao a mutacao mostra que o
`waitFor` nao tornou a afirmacao vacua:
- `WeekPlanEntry.tsx`: o efeito `confirmation.current?.focus()` trocado por no-op ->
  "plano da proxima semana" (CycleSection) reprova no normal e no lento.
- `TutorConversation.tsx`: removido `tabIndex={0}` da regiao -> P32 reprova (e P33/P35)
  no normal e no lento.

## Limites
- A 250 ms o Vitest ja reprova varios testes (a espera padrao do `waitFor` e de 1 s;
  falharam os testes de saudacao, um do `App` e um de `useTutorConversation`): isso nao era coberto e foi
  investigado depois (secao ao final). O cenario documentado do #157/#159 e o de 25 ms; 100 ms tambem fica verde.
- Nao ha varredura geral de "afirmar algo cedo demais apos um `findBy`"; so os testes que
  reprovaram sob 25 ms e 100 ms foram corrigidos.
- A config lenta continua temporaria e fora do repo; um teste novo com a mesma forma so
  sera pego por quem a rodar de novo (comandos acima).

Resolve a `P-ausencia-audio-1` (a consolidacao a risca no `docs/HANDOFF.md`).

## Os 11 testes que reprovavam a 250 ms

Revisao-base: `db1f2c7` (origin/main, com o #161). Reproducao: a mesma da secao acima,
com `SCHEDULER_DELAY_MS=250` (config e setup temporarios, fora do commit).

### Os 11 (antes), com a mensagem
| Arquivo | Teste | Mensagem |
|---|---|---|
| `App.test.tsx` | "trocar de area corta a voz da fala, e voltar nao fala de novo" | `Unable to find role="figure" and name "Kairya"` |
| `pages/Headquarters.test.tsx` ("saudacao do dia", 9 testes) | "saude de manha, anuncia a fala e grava o dia"; "a saudacao segue o periodo pelo relogio" (15:00Z e 21:00Z); "uma vez por dia: remontar..."; "concluir a diaria e reler o ciclo..."; "sequencia zerada..."; "storage que lanca..."; "storage nulo..."; "valor invalido na chave..." | `Unable to find role="figure" and name "Kairya"` |
| `tutoring/useTutorConversation.test.tsx` | "a rejeicao da recarga anterior ao done nao apaga o historico e a decisao ja carregados" | `AssertionError: expected 'loading' to be 'loaded'` |

A 25 e 100 ms a main (db1f2c7) passa limpa: 2810/2810.

### Causa: profundidade da cadeia de tarefas do Scheduler contra o 1000 ms do `findBy`
Nao e uma race de producao (nenhum dos testes afirma estado errado: com o `findBy`/`waitFor`
de 20 s todos passam, e a suite inteira passa a 250 e a 600 ms com esse prazo; nenhuma
afirmacao precoce sobrou escondida).

A saudacao leva ~5 tarefas do Scheduler em fila, cada uma `SCHEDULER_DELAY_MS` depois da
anterior: o commit que traz o ciclo, os efeitos passivos dele (`useDailyOpening`), o evento
da saudacao virando estado da Kairya, o commit da bolha e o efeito dela (a medicao conta as
tarefas pelo tempo, nao as nomeia uma a uma). Linha do tempo medida a 250 ms: dados na tela
em ~306 ms, bolha em ~1315 ms. O tempo ate a bolha e linear no atraso
(0 ms: 71 ms; 25: 207; 100: 604; 250: 1351; 400: 2109), ou seja ~5 tarefas, e passa do 1000 ms
padrao do `findBy` a partir de ~200 ms por tarefa. O `useTutorConversation` e a mesma
coisa: depois do `done` com o historico em `loading`, o `setAttempt` rende (tarefa 1), o
efeito pede o GET (tarefa 2) e o `setHistory` rende (tarefa 3), tudo dentro de UM `waitFor`.

Esse limite e uma caracteristica do cenario artificial: no produto cada tarefa leva
microssegundos, e o usuario so age sobre o que ja foi desenhado. Aumentar o prazo
(`timeout`) nao e a correcao e nao foi usado.

### Correcao (so teste; nenhum timeout, retry ou sleep)
- `Headquarters.test.tsx` e `App.test.tsx`: espera-se o dado observavel que ja era o
  gatilho (`cycle-today` / o `settleHeadquarters`), descarrega-se com
  `flushPendingEffects()` os efeitos desse commit (a cadeia efeito -> estado -> efeito corre
  dentro do `act` do helper, sem pagar uma tarefa do Scheduler por elo) e so entao espera-se a
  bolha, com a mesma afirmacao de antes (`findByRole('figure')` + texto/tom/storage).
  Em "uma vez por dia", a afirmacao de AUSENCIA ("remontar no mesmo dia nao saude") passou a
  ser feita depois de `flushPendingEffects()`: antes ela valia vazia sob Scheduler lento.
- `useTutorConversation.test.tsx`: o `waitFor` unico virou dois marcos observaveis e
  independentes: o terceiro `GET` do historico (a recarga que o `done` pede, que sai de um
  efeito) e, depois, `history.status === 'loaded'`.
- Limite que ficou: o primeiro elo (o `fetch` resolver e o React renderizar) continua custando
  uma tarefa. A prova abaixo vai ate 250 ms. A 600 ms, nos tres arquivos tocados, 42 testes
  ainda reprovam com o prazo padrao (varios encadeiam esperas de `findBy` por desenho): isso
  nao foi tratado, e e o mesmo limite do cenario artificial.

### Prova (suite completa do Vitest, 136 arquivos / 2810 testes, `--maxWorkers=4`)
| Cenario | main (db1f2c7) | PR |
|---|---|---|
| normal | 0 reprovam (2810 passam) | 0 reprovam (2810 passam) |
| Scheduler 25 ms | 0 reprovam | 0 reprovam |
| Scheduler 100 ms | 0 reprovam | 0 reprovam |
| Scheduler 250 ms | 11 reprovam (3 arquivos) | 0 reprovam |

Diagnostico (so na main, fora do repo): com `asyncUtilTimeout` de 20 s, 250 ms passa 2810/2810; com
60 s, 600 ms tambem passa 2810/2810 -- nenhuma afirmacao precoce escondida atras do prazo.

### Mutacao (producao mutada e revertida; nada commitado; 3 arquivos de teste, normal e 250 ms)
| Mutacao | Resultado com a correcao |
|---|---|
| `KairyaPresenceProvider.tsx`: `reportStreak = ignoreStreak` (a saudacao nunca sai) | 10 reprovam (os 9 da saudacao + o do App), no normal e a 250 ms |
| `dailyOpening.ts`: `greetedDay()` sempre `null` (saudaria todo remontar) | reprova "uma vez por dia" (a ausencia), no normal e a 250 ms |
| `useTutorConversation.ts`: o `done` sem `setAttempt` (nao pede a recarga) | 3 reprovam, entre elas a do alvo ("a rejeicao da recarga..."), no normal e a 250 ms |

Sobre a ausencia de "uma vez por dia": o `Headquarters.test.tsx` da MAIN, sob a mutacao de
`greetedDay` e Scheduler a 100 ms, PASSA (33/33): a afirmacao de ausencia era vazia sob
Scheduler lento. Com o `flushPendingEffects()` antes dela, reprova.

### Ajustes posteriores ao commit 7c190e0 (ainda nao commitados)
Dois ajustes, so em teste, nos arquivos abaixo. Nenhum timeout, retry ou sleep.

**(a) Ausencia no remontar do mesmo dia.** Em "uma vez por dia", o `settle` nao espera o
ciclo; sem ele, o `flushPendingEffects()` podia rodar antes do commit que traz o ciclo, e a
ausencia da bolha voltava a valer vazia. Agora o teste espera `findByTestId('cycle-today')`
antes de `flushPendingEffects()` e da afirmacao de ausencia.

**(b) `within` + `testid` no lugar do nome acessivel.** Os cliques passaram de
`screen.findByRole('button', { name: ... })` para `within(<regiao>).findByTestId(...)`:
calcular o nome acessivel na pagina inteira, a cada poll do `findBy`, e o que estourava o
prazo sob carga. O nome do botao continua provado nos testes do componente
(`MissionList.test.tsx` e `CycleSection.test.tsx` ainda afirmam "Concluir a missao: ...").

Os arquivos que esta mudanca toca, e o motivo de cada um:

| Arquivo | Estado | Motivo |
|---|---|---|
| `pages/Headquarters.test.tsx` | 7c190e0 + nao commitado | 9 testes da saudacao (secao acima); agora tambem (a) e (b): os cliques em `mission-complete` escopados em `missions-list` (avulsa) ou em `cycle` (diaria) |
| `App.test.tsx` | 7c190e0 + nao commitado | o teste de trocar de area (secao acima); agora tambem (b): o botao "Ir ao Quartel-General" vira `within(campaigns).findByTestId('trail-go-headquarters')` |
| `pages/Headquarters.audio.test.tsx` | so nao commitado | (b): o clique em `mission-complete` e o "Missao concluida." escopados em `missions-list` |
| `tutoring/useTutorConversation.test.tsx` | so 7c190e0 | o `waitFor` unico virou dois marcos (secao acima); nao mudou depois |

Os ajustes (a) e (b) nao foram rerodados sob Scheduler lento nesta nota; a tabela de prova
acima e a do commit 7c190e0.
