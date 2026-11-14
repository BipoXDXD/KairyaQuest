# Painel de progresso nos componentes do design system

## Objetivo
Migrar o `ProgressPanel` (`frontend/src/features/progression/`) para os
componentes de `shared/ui`, item #173 da guarda-chuva #208, área Progressão.
Tutoria e a animação da lanterna ficam para incrementos próprios.

Revisão-base: `main` em `7edecf1`.

## Decisões e porquê
- **Componentes:** `Panel` (o painel, `surface`), `ProgressBar` (a barra de
  nível), `Badge` (a faixa, já usado), `StatusLine` (carregando) e `Button`
  (tentar de novo e atualizar).
- **A barra:** o `ProgressBar` lança com `max <= 0`; o `parseProgress` já
  rejeita custo de nível não positivo na fronteira, então nada novo pode
  quebrar a renderização.
- **Superfície sólida no lugar do gradiente.** As regras `.rpg-progress`,
  `.rpg-progress-content` e `.progress-achievements` saíram do `index.css`; o
  layout virou utilitários com tokens (o nível em `font-display text-2xl`, o
  XP total na mesma linha do nível quando cabe, o resumo das conquistas em
  `text-action-primary` com anel `focus-ring`). O `gradientContrast.test.ts`
  ficou só com `.rpg-tutor`, e a âncora da "leitura de verdade" passou para
  ele.
- **CSS morto removido junto:** `.rpg-trail-card` não tinha uso desde o PR
  #108 (já registrado nas notas de 11/11). Sem o `.rpg-progress`, o bloco de
  apresentação legada ficaria só com ela.
- **Pesos:** `font-semibold`/`font-medium` viraram `font-bold` ou peso normal,
  como exige o `designLint` (só 400/500/700, e 500 só em título).

## Alterações
- `features/progression/ProgressPanel.tsx`.
- `src/index.css`: regras de progresso e de trilha removidas.
- `shared/ui/designLint.test.ts`: `ProgressPanel.tsx` saiu de
  `PENDING_MIGRATION`.
- `styles/gradientContrast.test.ts`: entrada `.rpg-progress`, cores de CSS e
  borda decorativa do painel removidas.
- Comentário de `tests/e2e/axe-transitorios.spec.ts` e `docs/QUALITY.md`
  (contraste sobre gradiente) atualizados.

## Pendências
- Restam em `PENDING_MIGRATION` os cinco arquivos da Tutoria.
