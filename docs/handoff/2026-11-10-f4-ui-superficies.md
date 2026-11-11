# Fase 4, Tarefa 4.4: componentes de superfície e retorno + mapa de arte — 2026-11-10

Objetivo: `Panel`, `Badge`, `ProgressBar`, `StatusLine`, `Skeleton`,
`SpeechBubble` e `EmptyState` em `frontend/src/shared/ui/`, mais o mapa
`ART` (`shared/ui/art.ts`) da arte da Fase 7. Base: merge local da 4.3
(`wt/f4-componentes`, `5189789`) com `wt/f7-arte`; os 13 arquivos de
`public/art/{kairya,scenes,empty,trial}` conferidos antes de começar.

Decisões:

- `assets.test.ts` lê o disco por `readSource.ts` (`sourceExists` e o novo
  `sourceSize`), e não por `new URL(..., import.meta.url)`, que o Vite
  reescreve como URL http no Vitest 5.0.1. Reprova caminho de `ART` sem
  arquivo, `url('/...')` de CSS sem arquivo e arte acima de 200 KB.
- `ProgressBar` e `Skeleton` tratam entrada impossível como erro de
  programação (`RangeError`): `max` não positivo ou não finito, `value`
  NaN, `lines` não inteiro ou menor que 1. `value` fora da faixa é limitado
  a `[0, max]`. A largura do preenchimento vai no `style`, em %.
- `SpeechBubble` liga a `figcaption` por `aria-labelledby`: o jsdom não dá à
  `figure` o nome da legenda, e o atributo explícito vale em todo motor.
  Só `celebrating` ganha `shadow-glow-lantern`; `concerned` usa a borda
  `feedback-danger`.
- `Badge` sem fundo próprio (texto e borda `border-current` no tom, pares já
  medidos em `contrastPairs.ts`); `StatusLine` com um ícone SVG por tom, para
  a cor não ser o único sinal.
- `Panel`: props em união discriminada; `aria-labelledby` só com `as`
  `section`/`aside`/`article` (ARIA 1.2 proíbe nomear `div` generic), e o
  `div` não o repassa nem com o tipo contornado. `Skeleton` trata
  `label=""` como ausente.
- `EmptyState`: arte `alt=""` de 160 px com `width`/`height` e
  `object-cover`; se falhar ao carregar, some e o texto fica (guarda o `src`
  que falhou, então trocar a arte tenta de novo). Sem `body` ou
  `action`, nada é renderizado no lugar.
- Catálogo: só a chave nova `ui.loading` (`Carregando…` / `Loading…`). Pesos
  só 400 e 700 (M8). Galeria: 22 casos novos em `src/test/gallery/`,
  reaproveitando chaves existentes.

Pendências:

- O `npx playwright test --project ui-states` (axe e 44px nos 22 casos novos)
  não foi rodado nesta tarefa: fica com o gate do controlador.
- A fitness function de texto literal em JSX (`no-literal-jsx.test.ts`) não
  existe nesta base; o `alt=""` do `EmptyState` não tem letra e deve passar
  no seletor descrito no plano quando ela entrar.
- Nenhuma tela consome os componentes ainda: a migração é das Tarefas
  4.6–4.9 (o `TutorConversation` mantém o próprio esqueleto até lá).
- O `valueText` da `ProgressBar` na galeria (`caseComponents.tsx`) é montado
  à mão (`40 / 200`); passa a vir do catálogo, com `Intl`, quando a 4.6 criar
  as chaves de XP.
- A `StatusLine` fica montada e só o `children` muda (JSDoc): a migração das
  4.6–4.9 não pode montá-la condicionalmente, ou o retorno fica mudo.

## Seção herdada de `wt/f7-arte`

O merge de `wt/f7-arte` trouxe para o `docs/HANDOFF.md` a seção abaixo. Com o
`docs/HANDOFF.md` igual ao da base (regra do #81), ela fica guardada aqui até o
#53 a levar para a `main`.

### Arte da Kairya integrada (Fase 7) — 2026-11-10

Base `e57fa2b`. Os 13 WebP aprovados da Fase 7 (retrato, avatar, cinco
expressões, dois cenários, três estados vazios e a prova da semana) estão em
`frontend/public/art/{kairya,scenes,empty,trial}/`, todos abaixo de 200 KB.
A procedência por arquivo (prompt, modelo, id da tarefa Tripo, data e custo
real) e os retoques locais estão em [ART.md](ART.md).

O painel da Kairya usa `kairya/portrait.webp`, com texto alternativo
descritivo, e `kairya/avatar.webp`, que é decorativo. Os heroes do
Quartel-General e de Campanhas usam `scenes/hq.webp` e
`scenes/campaigns.webp`. Os placeholders `kairya-mentor.webp` e
`kairya-avatar.webp` e os dois cenários medievais saíram de `public/art`.
As expressões serão ligadas na Fase 6; os estados vazios e a prova da semana,
na Fase 5. Não entra dependência, endpoint nem serviço novo.

**Contraste dos heroes.** O axe não mede contraste sobre imagem de fundo, então
o pior caso foi calculado pela fórmula WCAG 2.x. O cenário é um pixel branco
(#ffffff) sob o gradiente de cor #07101b com alfa `a`, composto por canal como
`a·cor + (1 − a)·255`. As cores do texto são o eyebrow #ecd1a4, o título
`text-slate-50` (≈ #f8fafc) e o subtítulo #d3dce5. Os dois cenários têm
realces quase brancos em toda a largura, e o texto alcança a borda direita
no celular. Por isso todo stop entra na conta, não só o de 55%.

| Stop | Alfa | Fundo resultante | Eyebrow | Título | Subtítulo |
|---|---:|---|---:|---:|---:|
| antigo QG 55% `99` | 0,600 | (106, 112, 118) | 3,40 | 4,80 | 3,62 |
| antigo Campanhas 55% `80` | 0,502 | (131, 135, 141) | 2,45 | 3,46 | 2,61 |
| antigo QG 100% `33` | 0,200 | (205, 207, 209) | 1,06 | 1,49 | 1,12 |
| novo 0% `e6` | 0,902 | (31, 39, 49) | 10,16 | 14,34 | 10,81 |
| novo 55% e 100% `b3` | 0,702 | (81, 87, 95) | **4,93** | 6,96 | 5,25 |

O alfa mínimo para 4,5:1 com fundo branco é 0,678 (eyebrow), 0,661
(subtítulo) e 0,582 (título). `.rpg-hero-library` e `.rpg-hero-citadel`
passaram a `#07101be6 0%, #07101bb3 55%, #07101bb3 100%`. O teste
`frontend/src/heroContrast.test.ts` lê os stops e as cores do `index.css`
e reprova qualquer stop abaixo de 4,5:1. Com o stop de 100% de Campanhas
de volta em `1a`, ele falhou (1,19:1). A contrapartida é que a metade
direita dos cenários fica mais escura do que antes.

Comandos e resultados:

- `make check-web`: ESLint, Prettier, `tsc -b` e Vitest aprovados, com
  52 arquivos e 1007 testes e cobertura de 100% (1269/1269 instruções,
  962/962 ramificações, 352/352 funções, 1235/1235 linhas).
- `npx tsc --noEmit` no `frontend/`: exit 0.
- O `make check` completo, que inclui `check-e2e` e axe, roda no gate de
  commit.

Pendências:

- Renomear `.rpg-hero-citadel` para `.rpg-hero-campaigns` e
  `.rpg-hero-library` para `.rpg-hero-hq` na Fase 4 (tarefa 4.6), num
  refactor separado. A cena de Campanhas não mostra mais uma cidadela.
- `empty/campaign-new.webp`: o retoque local deixou a lanterna com halo
  claro, e ela ainda parece levemente acesa. O responsável decide antes da
  Fase 5 entre aceitar, trocar pela versão sem retoque ou regerar
  (5 créditos).
- O `make bootstrap` de `scripts/novo-worktree.sh` falhou no `uv sync
  --locked` por falta do Python 3.14.9 no PATH do `uv`. Foi contornado com
  `UV_PYTHON=3.14.10 uv sync --locked`.
