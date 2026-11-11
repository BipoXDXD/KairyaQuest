interface LanternMarkProps {
  lit: boolean
  'data-testid'?: string
}

/**
 * A lanterna decorativa (`aria-hidden`): quem diz o que aconteceu é o texto ao
 * lado dela. As cores saem dos primitivos `lantern-*` por variável CSS, e o
 * estado aceso mora no `base.css` (`.lantern-mark[data-lit='true']`), que é o
 * que vale sob movimento reduzido; a animação só acrescenta a entrada, e só
 * sob `motion-safe:`.
 */
export function LanternMark({ lit, 'data-testid': testId }: LanternMarkProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-testid={testId}
      data-lit={lit}
      viewBox="0 0 24 32"
      width="24"
      height="32"
      className={`lantern-mark shrink-0 text-action-primary${lit ? ' motion-safe:animate-lantern-light' : ''}`}
    >
      <path
        d="M8 3h8M12 3v3M7 6h10l2 4v14l-2 4H7l-2-4V10z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 12c2.5 3 3 5 3 7a3 3 0 0 1-6 0c0-2 .5-4 3-7z" fill="var(--lantern-200)" />
    </svg>
  )
}
