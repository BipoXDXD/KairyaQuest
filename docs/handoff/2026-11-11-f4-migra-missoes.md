# Fase 4, Tarefa 4.8: missões no design system, estado vazio e lanterna da diária — 2026-11-10

Objetivo: migrar as missões (cartão, lista, ciclo, avaliação, evidência,
reagendamento, histórico e anúncio da recompensa) para tokens e componentes
da F4, com o estado vazio ilustrado e a lanterna que acende ao concluir a
diária.
Base: `wt/f4-migra-tutoria` (`d2123bc`) com merge de `origin/wt/f3-missions`
(`3986b24`).

Decisões:

- Cartão: o `li` (`mission-item`, `min-w-0 wrap-anywhere`) envolve um
  `Panel`; o estado é `Badge` (pendente `neutral`, em andamento `action`,
  concluída `success`), sempre com o rótulo em texto. A grade de dados ganha
  borda superior e inferior em `border-subtle`.
- Botões: Concluir é o `primary` do cartão; Iniciar, Recarregar, pedir a
  avaliação, salvar o reagendamento e "Tentar novamente" são `secondary`; os
  toggles de evidência e de reagendamento são `tertiary`. Um botão que antes
  usava `self-start`/`mt-*` ganhou um `div` em volta, porque o `Button` não
  aceita `className`.
- Evidência e reagendamento usam `Field` para rótulo e controle; os
  `aria-describedby`, `aria-invalid` e o erro do link (`role="alert"`, depois
  do blur) continuam como estavam, sobrescrevendo o que o `Field` entrega.
- Tons: verde vira `feedback-success`; vermelho e o âmbar de bloqueio,
  `feedback-danger`; o âmbar de aviso e o azul de status, `text-muted`; o
  veredito "parcial" vira `action-primary`. Todos são pares medidos em
  `contrastPairs.ts`.
- As falhas continuam `role="alert"` (como na 4.7); as caixas de erro da
  lista e do ciclo têm borda `feedback-danger`, sem fundo próprio.
- Estado vazio: `EmptyState` com `ART.empty.missions` e `h3` (o `h2` é o
  título da seção), com o mesmo `data-testid` e o mesmo texto do catálogo.
- Lanterna: `LanternMark` (SVG decorativo, `aria-hidden`) entra no
  `RewardAnnouncement` com `lit`, que o cartão passa só para a diária. O
  estado aceso mora no `base.css` (`.lantern-mark[data-lit='true']`, com o
  `--glow-lantern-filter`) e vale sob movimento reduzido; a animação
  (`animate-lantern-light`, por `filter`, nunca `box-shadow`) e a entrada do
  anúncio (`animate-reward-in`) só existem sob `motion-safe:`. Os dois
  `--animate-*` e os `@keyframes` saíram do `index.css` para `tokens.css` e
  `base.css`.
- `.rpg-cycle`, `.rpg-mission-card` e `.rpg-mission-state` saíram do
  `index.css`; os oito arquivos de missões saíram de `PENDING_MIGRATION`.
- Primeira dobra: com os botões de 44 px (o toggle de evidência era um link
  de ~20 px), o Iniciar da diária passou 10 px da dobra de 1440x900 e
  reprovou o `layout.spec.ts`. Três ajustes o trazem de volta, com 6,6 px de
  folga medidos:
  - a região fechada da evidência e do reagendamento só ganha margem com
    conteúdo (`not-empty:mt-2`);
  - o `Badge` do estado fica num `span` `flex`, sem a linha de texto em
    volta;
  - a coluna do ciclo usa `gap-2`.
- E2E novo `missions-layout.spec.ts`: título longo sem rolagem horizontal a
  320px, lanterna acesa e anúncio visível sob `reduced-motion`, e axe sem
  violações com a lanterna acesa.
- No commit de merge, `tests/unit/no-literal-jsx.test.ts` ganhou um
  aquecimento em `beforeAll` (prazo de 30 s): com a máquina carregada, a
  partida do ESLint passou dos 5 s do primeiro caso e o reprovou duas vezes.
  Cada caso continua medindo só a regra.

# Ajuste de pendência feito pelo #90 no HANDOFF (T8) — 2026-11-11

Onde o HANDOFF dizia:

> - `formatDeadline` (`shared/lib/deadline.ts`) ainda formata em `pt-BR` nos
>   dois idiomas; fica para quem migrar `shared/lib`.

passa a valer:

> - `formatDeadline` (`shared/lib/deadline.ts`) já recebe o idioma (T8): os
>   cartões da tutoria formatam o prazo pelo `useLocale()`.

# i18n: missões no catálogo e datas por idioma — 2026-11-10

Tarefa 8 do plano de i18n. Os textos de `features/missions` (quadro, cartão,
evidência, reagendamento, histórico, avaliação, recompensa e ciclo) passam pelo
`t()`, com 99 chaves `missions.*` nos dois catálogos; o PT é o texto anterior.
O plural usa `plural()`: no ciclo, o zero de "dias seguidos" e de "faltam"
aponta para a forma `other`, porque o CLDR `pt` põe o 0 em `one`.
`formatCivilDate`, `civilWeekday` e `formatDeadline` recebem `locale: Locale`
explícito, com um formatador por idioma (`shared/lib/formatterPerLocale.ts`);
quem chama obtém o idioma de `useLocale()`. A tutoria já formata o prazo pelo
idioma de `useLocale()`; só as campanhas (`CampaignTrail.tsx`), ainda não
migradas, passam `'pt-BR'` por uma constante `DATE_LOCALE`. A regra contra
literal no JSX passou a valer em `src/features/missions/**`.

**Exceção registrada: números do texto sem formatação por idioma.** O `{max}`
dos limites de evidência e de link ("4000", "2000") entra como `String(n)`,
sem `Intl.NumberFormat`, igual ao `questionLimit` da tutoria. O EN mostra
"4000" em vez de "4,000"; o PT continua "4000" (formatar daria "4.000" e
mudaria o texto atual). Follow-up: formatar as variáveis numéricas dentro do
`translate`, pelo idioma, para todas as áreas de uma vez.

**Pendência para a migração de `campaigns`.** A falha de carga de missions usa
`MissionsLoadFailure` (`features/missions/loadFailure.ts`): o estado guarda
`{ kind: 'unexpected' }` sem texto, e a tela traduz no idioma corrente. O
`LoadFailure` compartilhado (`shared/i18n/failureText.ts`) ainda grava a
mensagem inesperada como texto. Quando `campaigns` migrar, ele deve adotar
`{ kind: 'unexpected' }` sem texto; então `MissionsLoadFailure` e
`LoadFailureMessage` saem, e o comentário do `LoadFailure` em `failureText.ts`,
que promete a chave "no PR da área", é corrigido.
