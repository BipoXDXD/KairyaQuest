import type { ReactNode } from 'react'

export type StatusTone = 'neutral' | 'success' | 'danger'

interface StatusLineProps {
  tone?: StatusTone
  children: ReactNode
  'data-testid'?: string
}

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'text-text-muted',
  success: 'text-feedback-success',
  danger: 'text-feedback-danger',
}

/** Um ícone por tom: a cor nunca é o único sinal (WCAG 1.4.1). */
const TONE_ICON: Record<StatusTone, ReactNode> = {
  neutral: <circle cx="12" cy="12" r="4" fill="currentColor" />,
  success: <path d="M5 12.5 10 17.5 19 7" />,
  danger: <path d="M12 6v8M12 17.5v.5" />,
}

/**
 * Linha de retorno anunciada pelo leitor de tela (`role="status"`, polida).
 *
 * **Monte uma vez e troque só o `children`.** Vários pares de leitor de tela e
 * navegador não anunciam uma live region que já entra no DOM com conteúdo:
 * `{saved && <StatusLine>…</StatusLine>}` fica mudo. A tela mantém a
 * `StatusLine` montada (com `children` vazio no repouso) e muda o texto.
 */
export function StatusLine({ tone = 'neutral', children, 'data-testid': testId }: StatusLineProps) {
  return (
    <p
      role="status"
      data-tone={tone}
      data-testid={testId}
      className={`flex items-center gap-2 text-sm ${TONE_CLASS[tone]}`}
    >
      <span aria-hidden="true" className="inline-flex shrink-0">
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {TONE_ICON[tone]}
        </svg>
      </span>
      <span>{children}</span>
    </p>
  )
}
