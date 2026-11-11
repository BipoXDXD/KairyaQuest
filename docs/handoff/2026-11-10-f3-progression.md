# i18n: progressão e campanhas no catálogo, regra global contra literal — 2026-11-10

Tarefa 9 do plano de i18n. `ProgressPanel`, `unlockedDate`, `CampaignTrail`,
`availability` e `pages/Campaigns.tsx` passam pelo `t()`, com chaves
`progression.*` e `campaigns.*` nos dois catálogos; o PT é o texto anterior, e
os 14 textos das conquistas são cópia do `CATALOGO` do back. O XP sai por
`formatXp(value, locale)` (`features/progression/xpFormat.ts`, um
`Intl.NumberFormat` por idioma) e a data da conquista por
`formatUnlockedAt(…, locale)`; a constante `DATE_LOCALE` das campanhas saiu.

`achievementText(achievement, t)` (`shared/i18n/achievementText.ts`) dá o
título e a descrição da conquista no idioma corrente, para o painel e para o
`RewardAnnouncement`. Code que o catálogo não conhece mostra o `title` e a
`description` do back (tolerant reader), nunca a chave crua.

`LoadFailure` virou `{ kind: 'api'; text } | { kind: 'unexpected' }`, sem
texto no estado; `loadFailureFor(error)` não recebe mais mensagem, e
`LoadFailureMessage` recebe a chave `unexpected` da área e traduz no idioma
corrente. As quatro cargas (`useMissions`, `useCycle`, `useProgress`,
`useCurrentPlan`) usam esse tipo, e `features/missions/loadFailure.ts`
(`MissionsLoadFailure`) foi removido. `MissionList` e `CycleSection` também
exibem a falha pelo `LoadFailureMessage`.

Fitness function: a regra `no-restricted-syntax` de `eslint.config.js` passa a
valer para todo `src/**/*.tsx`, menos `src/shared/i18n/**` e os testes, e
substitui o escopo por pasta das tarefas anteriores. Ela reprova literal com
letra em `JSXText`, em `aria-label`/`title`/`placeholder`/`alt` e, agora,
dentro de `{}`: string (`{'Olá'}`, `aria-label={'Fechar'}`) e template literal
com letra. Glifos sem letra, `alt=""` e `{''}` passam. Cada caso está em
`tests/unit/no-literal-jsx.test.ts`. Limite conhecido: literal dentro de
ternário, de `&&` ou guardado em variável (`{ok ? 'Sim' : 'Não'}`) passa pela
regra; cobri-lo reprovaria também `className` condicional, então fica para a
revisão de código.

Paridade com o back: `tests/unit/test_conquistas_paridade_i18n.py` compara o
`title`/`description` serializados por `UnlockedAchievementRead.da_conquista`
com as chaves de `pt-BR.ts`. Desvio do plano: não passa pelo
`GET /api/progress`, que exige banco; o teste completo pelo endpoint fica como
follow-up para quando a suíte tiver banco.

**Limitação visível até a migração da F2 (2.1/2.2).** O back desta base ainda
envia o code legado da conquista de parceria, que o front não conhece. Até a
migração trocar o valor para `kairya_partnership`, essa conquista aparece com
o título e a descrição do back, em PT, também no idioma EN. Depois do merge
da F2, o code casa com o catálogo sem mudança no front.

Pendências:

- `P-f3-progression-1`: `formatXp` e `formatterPerLocale` repetem o cache por
  idioma; num terceiro formatador, generalizar (Rule of Three).

Revisão-base: `wt/f3-missions` (merge de `origin/wt/f3-missions` em
`wt/f3-progression`, sem rebase).

## Notas para seções anteriores do `docs/HANDOFF.md`

Este PR resolve ou altera itens registrados em seções anteriores. A
consolidação aplica as notas abaixo nas seções citadas.

Seção "i18n: tutoria no catálogo pt-BR/en", depois da frase sobre a regra
`no-restricted-syntax` em `src/features/tutoring/**/*.tsx`:

(Escopo por pasta substituído na Tarefa 9 pela regra global em `src/**/*.tsx`.)

Seção "i18n: missões no catálogo e datas por idioma":

- "A regra contra literal no JSX passou a valer em `src/features/missions/**`"
  ganha: (escopo por pasta substituído na Tarefa 9 pela regra global em
  `src/**/*.tsx`).
- **Pendência para a migração de `campaigns`** (resolvida na Tarefa 9:
  `MissionsLoadFailure` saiu e o `LoadFailure` compartilhado não grava texto;
  `LoadFailureMessage` ficou, com a chave `unexpected`). A falha de carga de
  missions usava `MissionsLoadFailure` (`features/missions/loadFailure.ts`).

Seção do shell (fitness function em `src/app/**` e `src/pages/Headquarters.tsx`):

- ~~Cada PR de área acrescenta a sua pasta ao `files`.~~ Substituído na
  Tarefa 9: a regra vale para todo `src/**/*.tsx`, sem lista de pastas.
- Pendência "O fallback "Falha inesperada ao carregar …" continua literal e
  vira chave no PR de cada área": riscar. Resolvida na Tarefa 9: é chave nas
  quatro áreas.
- Pendência "Tarefa 9: a fitness function só olha `JSXText` e
  `JSXAttribute > Literal` …": riscar. Resolvida na Tarefa 9 (seletores e
  casos acrescentados).
