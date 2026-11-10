import type { ContrastPair } from './contrast'

const SURFACES = ['color-bg-canvas', 'color-bg-surface', 'color-bg-raised'] as const

function onEverySurface(fg: string, min: ContrastPair['min'], use: string): ContrastPair[] {
  return SURFACES.map((bg) => ({ fg, bg, min, use }))
}

/**
 * Os pares de cor usados de fato pela UI, com o mínimo WCAG de cada um:
 * 4,5:1 para texto, 3:1 para componente de UI e foco. `color-border-subtle`
 * fica de fora de propósito: é decorativa e nunca é o único limite de um
 * controle.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...onEverySurface('color-text-primary', 4.5, 'texto principal'),
  ...onEverySurface('color-text-muted', 4.5, 'texto secundário'),
  ...onEverySurface('color-feedback-success', 4.5, 'texto de sucesso'),
  ...onEverySurface('color-feedback-danger', 4.5, 'texto de erro'),
  ...onEverySurface('color-action-primary', 4.5, 'link terciário e Badge action'),
  { fg: 'color-text-on-action', bg: 'color-action-primary', min: 4.5, use: 'botão primário' },
  {
    fg: 'color-text-on-action',
    bg: 'color-action-primary-hover',
    min: 4.5,
    use: 'hover do botão primário',
  },
  { fg: 'color-text-on-action', bg: 'color-feedback-danger', min: 4.5, use: 'danger-confirm' },
  {
    fg: 'color-action-primary',
    bg: 'color-bg-canvas',
    min: 3,
    use: 'preenchimento do ProgressBar',
  },
  ...onEverySurface('color-focus-ring', 3, 'anel de foco'),
  ...onEverySurface('color-border-strong', 3, 'borda de controle'),
]
