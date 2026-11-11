import type { LanternState } from './lanterns'

type GlyphSize = 'small' | 'grand'

/** Mesma proporcao (2:3) nos dois tamanhos; o desenho mora num quadro 32x48. */
const SIZE_PX: Record<GlyphSize, { width: number; height: number }> = {
  small: { width: 32, height: 48 },
  grand: { width: 56, height: 84 },
}

/**
 * A forma muda com o estado -- a cor so reforca (WCAG 1.4.1): a acesa tem
 * chama e corpo preenchido; a apagada tem so o pavio e o contorno cheio; a
 * futura tem o contorno tracejado, sem chama nem pavio.
 */
const OUTLINE_CLASS: Record<LanternState, string> = {
  lit: 'stroke-action-primary fill-bg-raised',
  out: 'stroke-text-muted fill-none',
  future: 'stroke-border-strong fill-none',
}

const FRAME_CLASS: Record<LanternState, string> = {
  lit: 'stroke-action-primary fill-action-primary',
  out: 'stroke-text-muted fill-none',
  future: 'stroke-border-strong fill-none',
}

const FUTURE_DASH = '4 3'

/** A lanterna desenhada a mao. Decorativa: o texto de estado ao lado e que informa. */
export function LanternGlyph({ state, size }: { state: LanternState; size: GlyphSize }) {
  const { width, height } = SIZE_PX[size]
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-state={state}
      viewBox="0 0 32 48"
      width={width}
      height={height}
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path data-part="string" d="M16 1v5" className="stroke-border-strong" />
      <path data-part="cap" d="M10 6h12l2 4H8z" className={FRAME_CLASS[state]} />
      <path
        data-part="outline"
        d="M8 10h16c3 7 3 19 0 26H8c-3-7-3-19 0-26z"
        strokeDasharray={state === 'future' ? FUTURE_DASH : undefined}
        className={OUTLINE_CLASS[state]}
      />
      <path data-part="base" d="M10 36h12v4H10z" className={FRAME_CLASS[state]} />
      {state === 'lit' && (
        <path
          data-part="flame"
          d="M16 16c3 3 4 5 4 8a4 4 0 0 1-8 0c0-3 1-5 4-8z"
          strokeWidth={0}
          className="fill-action-primary"
        />
      )}
      {state === 'out' && <path data-part="wick" d="M16 25v4" className="stroke-text-muted" />}
    </svg>
  )
}
