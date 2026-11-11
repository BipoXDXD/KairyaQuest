import type { ReactNode } from 'react'

export type Elevation = 'sunken' | 'surface' | 'raised'

interface PanelBaseProps {
  elevation?: Elevation
  /** O brilho da lanterna, o único efeito decorativo do sistema. */
  glow?: boolean
  children: ReactNode
  'data-testid'?: string
}

/**
 * Só elemento com papel pode ter nome: o ARIA 1.2 proíbe nomear um `div` sem
 * role (generic), e o axe acusa `aria-prohibited-attr`. Por isso o
 * `aria-labelledby` só existe na variante de `section`, `aside` e `article`.
 */
export type PanelProps = PanelBaseProps &
  (
    | { as: 'section' | 'aside' | 'article'; 'aria-labelledby'?: string }
    | { as?: 'div'; 'aria-labelledby'?: never }
  )

/** A elevação é dada pela superfície mais clara, nunca por sombra. */
const ELEVATION_CLASS: Record<Elevation, string> = {
  sunken: 'bg-bg-canvas',
  surface: 'bg-bg-surface',
  raised: 'bg-bg-raised',
}

/** Superfície de conteúdo. Sem `className` público: o espaço entre painéis é do pai. */
export function Panel({
  elevation = 'surface',
  as: Element = 'div',
  glow = false,
  children,
  'aria-labelledby': labelledBy,
  'data-testid': testId,
}: PanelProps) {
  const glowClass = glow ? ' shadow-glow-lantern' : ''
  return (
    <Element
      aria-labelledby={Element === 'div' ? undefined : labelledBy}
      data-testid={testId}
      data-elevation={elevation}
      className={`rounded-ui border border-border-subtle p-4 text-text-primary ${ELEVATION_CLASS[elevation]}${glowClass}`}
    >
      {children}
    </Element>
  )
}
