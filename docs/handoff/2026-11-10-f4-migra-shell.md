# Fase 4, Tarefa 4.6: shell, navegação e cabeçalhos das áreas — 2026-11-10

Objetivo: migrar o shell (`App`, `SideNav`, cabeçalhos do Quartel-General e
de Campanhas) para tokens e componentes, criar o barrel `shared/ui/index.ts`
e a regra global de movimento reduzido.
Base: commit da 4.5 (`3f2f823`).

Decisões:

- `SideNav` compõe `NavTabs` (mesmos `data-testid`; o marcador ativo passa a
  ser o SVG do `NavTabs`, e o teste da F3 que procurava `▸` passou a
  procurar o `svg`). O `<nav>` continua o único landmark; marca
  (`font-display`) e nota (`text-text-muted`) no bloco do `LanguageSwitcher`,
  com `flex-wrap` para caber na coluna de 224 px. Saíram o brasão `✦` e a
  legenda "Explorar" (decorativos, `aria-hidden`).
- Cabeçalho das áreas num componente `pages/AreaHero.tsx`, usado pelas duas
  páginas: `header.area-hero.area-hero--{hq,campaigns}` com o gradiente da
  spec (90 % → 20 % de `--ink-950`, arte bem mais visível) e o h1 + nota
  dentro de `Panel elevation="surface"`. O véu escuro largo da F7 (todos os
  stops ≥ 0,70) saiu: o contraste agora é texto sobre superfície sólida.
- `heroContrast.test.ts` foi substituído por `pages/AreaHero.test.tsx`: a cor
  do texto e a do fundo são lidas das classes que o componente aplica e
  resolvidas em `tokens.css` (resolve o N1 da F7); um caso de sabotagem
  (`text-border-subtle`) prova que a medição reprova.
- Textos do shell e dos heroes foram para o catálogo, em PT e EN:
  `shell.brand.{name,note}`, `shell.nav.{label,headquarters,campaigns}`,
  `headquarters.hero.{title,note}`, `campaigns.hero.{title,note}`. Os textos
  PT são os de antes, então os E2E seguem com os mesmos nomes. O "eyebrow"
  dos heroes saiu (o brief só prevê h1 e nota).
- `.rpg-main` virou `.area-main` (M3 da F7) e ficou só com o que as
  features ainda não migradas usam (`section > h2` e a largura a partir de
  1600 px); o padding dos `main` passou para utilities da escala. A
  folga do fim do QG abaixo do lg virou a classe `.area-main--fab-clearance`
  (`base.css`, `calc(var(--spacing) * 24)` = 96 px), porque `pb-24` está
  fora da escala do lint. O botão fixo "Falar com a Kairya" ocupa 80 px de
  baixo da tela (retrato de 40 px + `py-3` = 64 px, mais `bottom-4`); 96 px
  deixam 16 px livres. Um E2E em 320 e 375 px confere que nenhum botão do
  último cartão fica sob ele.
- O Playwright passou a abrir com `locale: 'pt-BR'`: o shell agora segue
  `navigator.language`, o Chromium do Playwright diz `en-US`, e os E2E que
  procuram "Campanhas" e o h1 do QG em PT quebravam.
- `renderWithI18n` ganhou `strict` (opção `reactStrictMode` do Testing
  Library): um `StrictMode` aninhado no wrapper não duplicou os efeitos
  (medido: 1 chamada em vez de 2).
- Saíram de `PENDING_MIGRATION`: `App.tsx`, `SideNav.tsx`, `Campaigns.tsx`,
  `Headquarters.tsx`.

Pendências:

- `make check` (E2E, incluindo o teste novo de reduced-motion em
  `layout.spec.ts`, e axe nas duas larguras) não rodou nesta tarefa: o
  Playwright exige a API e o PostgreSQL; fica com o gate do controlador.
- M7 (4.4): a tarefa não tocou chave de XP; o `valueText` da galeria segue
  montado à mão.
