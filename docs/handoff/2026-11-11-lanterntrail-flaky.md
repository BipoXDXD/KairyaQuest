# LanternTrail intermitente sob carga (issue #136, PR #137), 2026-11-11

Revisão-base: `origin/main` 8936820 (#134). Branch `wt/lanterntrail-flaky`.
Resolve a issue #136. Não toca `docs/HANDOFF.md`, backend nem catálogos i18n.

## Sintoma

`LanternTrail.test.tsx`, "a especial que fica disponivel depois da montagem
toca weekly_trial_unlocked uma vez" (`expected [] to deeply equal
['weekly_trial_unlocked']`): reprovou no `pre-push` com load alto e passa
isolado.

## Hipótese (confirmada)

O `waitFor` espera só o atributo `data-availability="disponivel"` no DOM; o
`expect(played())` vem depois. O som sai de `useEffect` em `SpecialItem`
(efeito passivo), que o React roda DEPOIS do commit que mexe no DOM. O React
agenda esse efeito pelo scheduler: se o render passa do frame de 5 ms, o
scheduler cede e o efeito vai para outra tarefa (`setImmediate`). O
`waitFor` do Testing Library resolve no `MutationObserver` e ainda espera um
`setTimeout(0)` antes de devolver. Quem chega primeiro, o timer de 1 ms ou o
`setImmediate`, depende da carga do laço de eventos. Medido (log dentro do
`waitFor`): na primeira passagem do callback `played()` ainda era `[]`; só
depois do `setTimeout(0)` virava `['weekly_trial_unlocked']`. A margem era
essa corrida, não um tempo.

O caso `uma vez por montagem` (linha 664) tinha a mesma janela
(`findByTestId` + leitura imediata). Não é defeito do componente: tocar no
efeito é o comportamento correto.

## Reprodução

Método A, determinístico (simula render lento sem mexer no código): config
Vitest temporária (não versionada) com um setup antes do `setup.ts` do
projeto:

```ts
let skew = 0
const realNow = performance.now.bind(performance)
performance.now = () => realNow() + (skew += 6)   // o scheduler cede após cada tarefa
globalThis.setImmediate = ((fn, ...a) => setTimeout(fn, 5, ...a)) as typeof setImmediate
```

`npx vitest run -c vitest.zz-slow.config.ts src/features/campaigns/LanternTrail.test.tsx -t "<caso>"`

Método B, carga real: 20 laços `node -e 'while(true){}'` (PIDs próprios) +
`npx vitest run` da suíte inteira (workers em paralelo), 4 execuções.

## Números

| Método | Antes | Depois |
|---|---|---|
| A, caso da issue (depois da montagem), 10 execuções | 10/10 falham, `expected [] to deeply equal ['weekly_trial_unlocked']` | 0/10 |
| A, caso `uma vez por montagem`, 10 execuções | 10/10 falham | 0/10 |
| A, arquivo inteiro (37 testes) | 2 falham (linhas 664 e 680) | 37 passam |
| Sem lentidão, `-t depois da montagem`, 10 execuções | 0/10 | 0/5 (`efeitos`) |
| B, 20 laços de CPU, suíte inteira x4 (2584 testes) | 0 falhas em 4 | 0 falhas em 4 |
| B, só o caso, 20 laços de CPU, 40 execuções | 0/40 | não repetido |

Honestidade: carga de CPU pura (B) NÃO reproduz a falha nesta máquina; ela
depende da ordem entre timer e `setImmediate`, que o método A força. A causa
foi provada pelo log (`played()` vazio dentro do `waitFor`) e pela
reprodução A com a mensagem idêntica à da issue.

## Correção

Só teste (`LanternTrail.test.tsx`): o helper `expectPlayedOnce` espera o
próprio som com `waitFor(() => expect(played()).toEqual([...]))` (espera por
condição, sem timeout novo), faz `await act(async () => {})` para o React
esvaziar a fila e reconfere, o que prova o "uma vez". Os dois casos que
liam `played()` logo após o DOM passam a usá-lo. Sem retry, sem skip, sem
timeout aumentado, sem diretiva de cobertura. Sabotagem: sem a linha
`playSfx('weekly_trial_unlocked')` os dois casos reprovam.

## Os outros dois timeouts de 5 s (só diagnóstico, sem alteração)

`src/test/noCrossFeatureInternals.test.ts` e `src/test/noMathRandom.test.ts`
NÃO têm a mesma causa. São varreduras síncronas e ligadas à CPU (glob + parse
da AST do TypeScript de ~300 arquivos) contra o timeout padrão de 5 s do
teste; não há corrida. Medido: isolado, 282 ms e 218 ms; na suíte inteira sob
20 laços de CPU, 0,7 a 1,9 s (4 a 8x). Para estourar 5 s o contexto do
`pre-push` precisa deixá-los ~20x mais lentos (gate completo + Playwright +
outras sessões). Proposta (para decidir, não feita aqui): (1) filtro textual
barato antes do `createSourceFile` (`noMathRandom`: só parseia arquivo que
contenha `random`), e (2) reaproveitar um parse por arquivo entre os dois
testes de AST, em vez de aumentar o timeout.

Os outros testes com `played()` (`MissionCard.audio`, `useTutorPresence`)
passam sob o método A.

## Comandos e resultados

`make check` completo sob a trava `lote-off9.lock`: EXIT 0. Vitest 128
arquivos / 2584 testes, cobertura do frontend 100%; pytest 2162 passed, 32
subtests, cobertura Python 100% (TOTAL); Playwright 189 passed. Antes do
commit, `git diff origin/main -- docs/HANDOFF.md` vazio. O commit e o push
rodam o gate de novo pelos hooks.
