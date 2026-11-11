# wt/f6-provider: provider da presença, hook useKairya e fitness da semente (F6 Tarefa 6.3b) — 2026-11-11

Objetivo: dar à Kairya um estado de presença compartilhado por contexto, para
que missões e tutoria despachem eventos sem repassar callbacks por props, e
travar por teste que nenhum teste chama `Math.random`. Empilhado sobre
`4145d10` (Tarefa 6.3a). Plano: `docs/superpowers/plans/2026-11-11-f6-presenca.md`
(Tarefa 6.3b).

## Declarações

- Zero dependência nova (nem de runtime, nem de dev).
- Zero endpoint novo.
- Zero migração, zero coluna nova.
- Nenhuma string de UI nova: o provider não renderiza texto.

## Contrato novo (para as próximas tarefas)

`import { KairyaPresenceProvider, useKairya } from '../kairya'`
(`features/kairya/index.ts` é a superfície pública; as outras features só
importam dela).

```ts
interface KairyaContextValue {
  state: PresenceState
  dispatch(event: KairyaEvent): void
  dispatchAll(events: readonly KairyaEvent[]): void // em ordem
  reportStreak(streak: number): void                // no-op com greeting=false
}
KairyaPresenceProvider({ children, scheduler?, random?, clock?, storage?, greeting? })
useKairya(): KairyaContextValue                     // lança fora do provider
```

`dispatch`, `dispatchAll` e `reportStreak` têm identidade estável; o valor do
contexto é memoizado. `renderWithI18n` ganhou `presence?:
Omit<KairyaPresenceProviderProps, 'children'>`, aninhado dentro do
`AudioProvider`.

## Decisões

- **R3, presença por contexto, não por props.** `MissionList` → `MissionCard` →
  `EvaluationPanel` precisariam repassar callbacks por três níveis. O provider
  fica em `features/kairya/` (mesma divisão em três arquivos do `AudioProvider`,
  por causa do `react-refresh/only-export-components`) e é montado em
  `main.tsx`, dentro do `I18nProvider`. `useKairya()` lança fora do provider; o
  contexto não tem valor padrão para não esconder o esquecimento. Custo se
  errado: a presença sobe para `shared/` ou volta para props.
- **R4, a voz fica na F8.** Nada de áudio aqui. O ponto de ligação é
  `useKairya().state.cue` (`{ line: LineId; detail }`): a Tarefa de gatilhos da
  F8 faz um efeito `playVoice(lineSrc(locale, cue.line))` quando `prefs.voice`
  estiver ligado.
- **R13, padrão de teste do provider.** `renderWithI18n` monta o provider com
  `greeting: false` e `random: () => 0` (semente fixa: a primeira fala do
  grupo). Sem `greeting: false`, toda página de teste ganharia uma bolha e o
  `localStorage` do jsdom vazaria entre testes. Páginas que testam saudação
  passam `presence: { greeting: true, clock, storage, random }`.
- **`greeting === false`** troca `reportStreak` por uma função vazia de módulo
  (identidade estável): nada é decidido nem gravado.
- **Fitness da semente.** `src/test/noMathRandom.test.ts` varre todo
  `*.test.ts(x)` de `src/` e reprova `/Math\.random\(/`. Espiar a função
  (`vi.spyOn(Math, 'random')`, usado em `useKairyaMood.test.tsx` para o ramo
  padrão) não é chamada e passa. O arquivo monta a amostra proibida em partes
  para não casar com a própria regra.

## Alterações

- Novos: `features/kairya/presenceContext.ts`, `KairyaPresenceProvider.tsx`,
  `useKairya.ts`, `index.ts`, `KairyaPresenceProvider.test.tsx`,
  `src/test/noMathRandom.test.ts`.
- Editados: `src/main.tsx`, `src/test/i18n.ts`.

## Comandos e resultados

- `npx vitest run src/features/kairya/KairyaPresenceProvider.test.tsx`: falhou
  antes (módulo ausente), 10 testes verdes depois.
- `npx vitest run --coverage` (suíte inteira): 105 arquivos, 2191 testes verdes,
  cobertura 100% em instruções, ramos, funções e linhas.
- `npm run typecheck` e `npm run lint`: verdes.
- Sabotagem da fitness, revertida: um `*.test.ts` com a chamada proibida
  reprova `nenhum teste chama Math.random` e lista o arquivo; removido o
  arquivo, volta a verde.

## Pendências

Nenhuma nova. `weekPlanCreated` e `farewell` seguem sem gatilho (R5, registrado
na Tarefa 6.3h).
