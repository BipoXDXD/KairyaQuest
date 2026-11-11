import type { ReactNode, Ref } from 'react'

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
 * `aria-labelledby` e o `aria-label` só existem na variante de `section`,
 * `aside` e `article`. O `ref` também: quem precisa do elemento é quem o
 * trata como região (o painel da Kairya isola os irmãos dele).
 */
export type PanelProps = PanelBaseProps &
  (
    | {
        as: 'section' | 'aside' | 'article'
        'aria-labelledby'?: string
        'aria-label'?: string
        ref?: Ref<HTMLElement>
      }
    | { as?: 'div'; 'aria-labelledby'?: never; 'aria-label'?: never; ref?: never }
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
  ref,
  'aria-labelledby': labelledBy,
  'aria-label': label,
  'data-testid': testId,
}: PanelProps) {
  const className = `rounded-ui border border-border-subtle p-4 text-text-primary ${ELEVATION_CLASS[elevation]}${glow ? ' shadow-glow-lantern' : ''}`
  if (Element === 'div') {
    return (
      <div data-testid={testId} data-elevation={elevation} className={className}>
        {children}
      </div>
    )
  }
  return (
    <Element
      ref={ref}
      aria-labelledby={labelledBy}
      aria-label={label}
      data-testid={testId}
      data-elevation={elevation}
      className={className}
    >
      {children}
    </Element>
  )
}
