# Lote 26 -- flaky latente sob Scheduler lento (P-ausencia-audio-1)

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
  falharam os testes de saudacao, um do `App` e um de `useTutorConversation`): isso nao e coberto e nao foi
  investigado. O cenario documentado do #157/#159 e o de 25 ms; 100 ms tambem fica verde.
- Nao ha varredura geral de "afirmar algo cedo demais apos um `findBy`"; so os testes que
  reprovaram sob 25 ms e 100 ms foram corrigidos.
- A config lenta continua temporaria e fora do repo; um teste novo com a mesma forma so
  sera pego por quem a rodar de novo (comandos acima).

Resolve a `P-ausencia-audio-1` (a consolidacao a risca no `docs/HANDOFF.md`).
