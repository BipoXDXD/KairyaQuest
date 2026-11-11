# Fase 4, Tarefa 4.2: tipografia Alegreya local — 2026-11-10

Objetivo: trocar o Georgia provisório pela tipografia da spec (Alegreya nos
títulos, Alegreya Sans no texto), servida localmente, com a escala de texto
da spec. Base: `5e3253e` (Tarefa 4.1).

Decisões:

- **As fontes são assets, não dependências.** Seis woff2 e duas licenças SIL
  OFL 1.1 em `frontend/public/fonts/`, sem pacote npm. Procedência, bytes e
  SHA-256 em `docs/ART.md`, seção "Fontes".
- **Sem CDN.** Servir da Google Fonts mandaria o IP e o User-Agent de cada
  visitante a um terceiro (privacidade), acrescentaria uma origem externa ao
  carregamento e deixaria o app sem fonte offline. Local, tudo sai da mesma
  origem do app.
- Só os subsets `latin` e `latin-ext`, com o `unicode-range` da Google Fonts:
  o `latin-ext` só baixa quando a página usa um caractere dele. A Alegreya é
  variável (um arquivo por subset declara `font-weight: 500 700`); a
  Alegreya Sans é estática, um arquivo por peso.
- `font-display: swap` em toda `@font-face` e preload só dos dois arquivos
  principais (`alegreya-sans-400-latin`, `alegreya-latin`), com
  `crossorigin`, que o preload de fonte exige para reaproveitar o download.
- No `@theme`, `--font-*: initial` e `--text-*: initial` antes de declarar:
  só existem `font-display`, `font-body` e `text-xs` a `text-4xl`
  (12/14/16/18/22/28/36/48 px), mais `leading-body` 1,6 e `leading-heading`
  1,15. O reset de `--font-*` não apaga o namespace `--font-weight-*`
  (conferido no build).
- `base.css` fica em `@layer base`: fora de layer, o `font-weight: 500` dos
  títulos venceria utilities como `font-semibold` num `h2`.
- As regras `.rpg-*` legadas trocam o Georgia por `var(--font-display)`;
  `.rpg-nav-caption` e `.rpg-eyebrow` perdem a caixa alta e o
  `letter-spacing: 0.18em` e passam de 600 para 700.
- `layoutData` saiu de `layout.spec.ts` para `tests/e2e/layoutData.ts`, para
  o `fonts.spec.ts` reaproveitar as mesmas respostas GET (o Playwright não
  aceita uma spec importando outra).

Alterações:

- Novos: `frontend/public/fonts/*`, `frontend/src/styles/fonts.css`,
  `frontend/src/styles/base.css`, `frontend/src/shared/ui/fonts.test.ts`,
  `frontend/tests/e2e/fonts.spec.ts`, `frontend/tests/e2e/layoutData.ts`.
- `frontend/src/styles/tokens.css` (famílias, escala, leading),
  `frontend/src/index.css` (imports e regras `.rpg-*`), `frontend/index.html`
  (preload), `frontend/src/test/readSource.ts` (`sourceExists`, para checar
  a existência de binários sem lê-los como texto),
  `frontend/tests/e2e/layout.spec.ts` (importa o `layoutData`),
  `docs/ART.md` (seção "Fontes").

Comandos e resultados:

- `npx vitest run src/shared/ui/fonts.test.ts` antes do `fonts.css`: falhou
  (`ENOENT` em `src/styles/fonts.css`); com `fonts.css` e tokens, 8 de 9
  (faltava o preload); depois do preload: 9 passaram.
- `npm run build`: `.font-bold{...font-weight:var(--font-weight-bold)}`
  presente e `--font-weight-bold:700` no CSS gerado; `dist/fonts/` com os
  seis woff2 e as licenças.
- `make check-web` (exit 0): lint, Prettier e `tsc` limpos; 54 arquivos,
  1044 testes passaram; cobertura 100% (1325/1325 statements, 989/989
  branches, 369/369 functions, 1286/1286 lines).
- `tests/e2e/fonts.spec.ts`: escrito e não executado (o E2E fica com o
  controlador).

Pendências:

- Componentes ainda usam `font-medium` (500) e `font-semibold` (600); a
  Alegreya Sans só tem 400 e 700, então o navegador casa 500 com 400 e 600
  com 700 enquanto isso. O lint de peso da Tarefa 4.3 os acusa e os põe na
  `PENDING_MIGRATION`; a troca acontece na migração das áreas (4.6–4.9).
  Peso 500 só em título (Alegreya).
- O `text-*` resetado perde a altura de linha padrão do Tailwind em cada
  tamanho; o texto herda `leading-body` (1,6) do `body`. Conferir no E2E de
  layout e no axe que nada ficou apertado.

