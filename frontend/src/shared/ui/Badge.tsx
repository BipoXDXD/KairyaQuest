export type BadgeTone = 'neutral' | 'success' | 'danger' | 'action'

interface BadgeProps {
  tone: BadgeTone
  /** Texto obrigatório: o tom nunca é o único sinal (WCAG 1.4.1). */
  children: string
  'data-testid'?: string
}

/**
 * Sem fundo próprio: o texto no tom fica sobre a superfície do pai, e cada
 * par tom/superfície está medido em `tokens/contrastPairs.ts`.
 */
const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'text-text-muted',
  success: 'text-feedback-success',
  danger: 'text-feedback-danger',
  action: 'text-action-primary',
}

/** Pílula de estado, com borda na cor do texto. */
export function Badge({ tone, children, 'data-testid': testId }: BadgeProps) {
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      className={`inline-flex items-center rounded-pill border border-current px-2 text-xs font-bold ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  )
}
