# A lanterna de hoje acende na trilha

## Objetivo
A animação da lanterna acesa no item #173 da guarda-chuva #208: cerca de
900 ms quando a diária é concluída, desligada sob `prefers-reduced-motion`.

Revisão-base: `main` em `7fb07c2`.

## Decisões e porquê
- **Onde acende.** A diária é concluída no Quartel-General, mas a lanterna
  só existe na trilha de Campanhas. A coordenação escolheu: a lanterna de
  hoje acende na primeira vez que a trilha é aberta depois de concluir. O QG
  não muda, porque uma lanterna nova no cartão da diária arriscaria a dobra.
- **"Já vista" por dia no `localStorage`** (`kairyaquest.lanternRevealSeen`,
  em `features/campaigns/lanternReveal.ts`). Guarda só o último dia visto.
- **Storage ausente ou que lança na leitura: não anima.** Sem como lembrar,
  a animação repetiria a cada visita. Falha na escrita é engolida.
- **Decide no render, grava no efeito.** `useLanternReveal` só lê o storage
  durante o render e guarda a decisão até o dia aceso mudar. O render tem de
  ser puro: um render descartado pelo React gravaria como vista uma lanterna
  que não apareceu. (A primeira versão desta nota culpava o render duplo do
  `StrictMode`, o que não se confirma no React 19; corrigido no PR seguinte,
  com o teste `useLanternReveal` em `lanternReveal.test.ts`.) A troca de
  `litDay` (uma atualização em silêncio que acende a lanterna com a trilha
  aberta) decide de novo, pelo padrão de ajustar estado durante o render.
- **Movimento reduzido.** A classe é `motion-safe:animate-lantern-lit`; sob
  `reduce` nada anima e a lanterna aparece acesa. O `base.css` já zera as
  durações nesse caso.
- **O que anima:** só o glifo (`aria-hidden`), com opacidade, escala e o
  filtro `--glow-lantern-filter`, terminando no brilho estático do item. O
  texto do estado não anima, então o contraste medido pelo axe não muda.

## Alterações
- `features/campaigns/lanternReveal.ts` e `lanternReveal.test.ts`: novos.
- `features/campaigns/LanternTrail.tsx` e `LanternTrail.test.tsx`: o glifo
  de hoje ganha `data-testid="trail-day-art"` e a animação.
- `src/index.css`: `@keyframes lantern-lit` e `--animate-lantern-lit`.
- `tests/e2e/cycle.spec.ts`: a primeira vista anima, a volta no mesmo dia
  não, e com movimento reduzido nada anima.
- `docs/ARCHITECTURE.md`: a trilha deixa de dizer que nada anima.

## Pendências
- Se a escrita falhar mas a leitura funcionar (cota cheia), a animação se
  repete a cada visita. É raro com uma chave de dez caracteres; tratar
  exigiria gravar no render.
