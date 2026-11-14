# Cartões de proposta da Tutoria nos componentes do design system

## Objetivo
Migrar os cartões de proposta da Kairya (`DecisionControls`, `ProposalCard`,
`RescheduleProposalCard`) para os componentes de `shared/ui`. É a primeira
metade da Tutoria no item #173 da guarda-chuva #208. A conversa
(`TutorConversation`), o painel (`TutorPanel`) e a animação da lanterna ficam
para incrementos próprios.

Revisão-base: `main` em `bfd2d46`.

## Decisões e porquê
- **Botões:** Confirmar é `Button` primário; Recusar e Atualizar a conversa
  são secundários. Os dois continuam com `disabled` enquanto a decisão está em
  voo: é a guarda contra o clique duplo (pendência 34), e trocar por
  `loading` mudaria o comportamento que os testes descrevem.
- **Cartão:** o `Panel` (superfície) vai dentro de um `div` que guarda o
  `data-testid`, o `data-action-id`, o `data-state` e o layout (`mt-3`,
  `min-w-0`, `wrap-anywhere`). O `Panel` não tem `className` nem repassa
  atributos `data-*` além do `data-testid`. O mesmo vale para o cartão de
  `kind` desconhecido.
- **Cores:**
  - Sucesso é `text-feedback-success` e erro é `text-feedback-danger`.
  - Recusada e os rótulos são `text-text-muted`.
  - A falha gravada, que era âmbar, vira `text-action-primary`, porque não
    existe token de aviso (como em Missões).
  - O link para o quadro usa o mesmo estilo do link do `EvaluationPanel`.
- **Par de contraste novo:** `color-action-primary-hover` sobre as três
  superfícies, a 4,5:1. É o hover dos links; a falta dele foi apontada na
  revisão do PR #216.
- **Pesos:** `font-medium`/`font-semibold` saem. O título do cartão fica com o
  peso de título do `base.css`, e a confirmação de sucesso com `font-bold`.

## Alterações
- Os três componentes de `features/tutoring/`.
- `shared/ui/designLint.test.ts`: os três saíram de `PENDING_MIGRATION`.
- `shared/ui/tokens/contrastPairs.ts`: par do hover de link.

## Pendências
- `TutorConversation.tsx` e `TutorPanel.tsx` continuam em
  `PENDING_MIGRATION`.
