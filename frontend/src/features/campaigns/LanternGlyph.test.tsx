import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LanternGlyph } from './LanternGlyph'
import type { LanternState } from './lanterns'

const STATES: LanternState[] = ['lit', 'out', 'future']
const SIZES = ['small', 'grand'] as const

function glyph(state: LanternState, size: 'small' | 'grand'): SVGSVGElement {
  const { container } = render(<LanternGlyph state={state} size={size} />)
  const svg = container.querySelector('svg')
  if (svg === null) throw new Error('sem svg')
  return svg
}

describe('LanternGlyph', () => {
  it.each(STATES.flatMap((state) => SIZES.map((size) => [state, size] as const)))(
    'estado %s, tamanho %s: svg decorativo com o estado exposto',
    (state, size) => {
      const svg = glyph(state, size)
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg).toHaveAttribute('data-state', state)
      expect(svg).toHaveAttribute('focusable', 'false')
    },
  )

  it('so a lanterna acesa tem chama', () => {
    expect(glyph('lit', 'small').querySelector('[data-part="flame"]')).not.toBeNull()
    expect(glyph('out', 'small').querySelector('[data-part="flame"]')).toBeNull()
    expect(glyph('future', 'small').querySelector('[data-part="flame"]')).toBeNull()
  })

  it('so a lanterna futura tem o contorno tracejado; a apagada tem so o pavio', () => {
    const outline = (state: LanternState) =>
      glyph(state, 'small').querySelector('[data-part="outline"]')
    expect(outline('future')).toHaveAttribute('stroke-dasharray')
    expect(outline('lit')).not.toHaveAttribute('stroke-dasharray')
    expect(outline('out')).not.toHaveAttribute('stroke-dasharray')
    expect(glyph('out', 'small').querySelector('[data-part="wick"]')).not.toBeNull()
    expect(glyph('lit', 'small').querySelector('[data-part="wick"]')).toBeNull()
    expect(glyph('future', 'small').querySelector('[data-part="wick"]')).toBeNull()
  })

  it('o contorno de cada estado usa um token de cor diferente do da chama', () => {
    expect(glyph('lit', 'small').querySelector('[data-part="outline"]')).toHaveClass(
      'stroke-action-primary',
    )
    expect(glyph('out', 'small').querySelector('[data-part="outline"]')).toHaveClass(
      'stroke-text-muted',
    )
    expect(glyph('future', 'small').querySelector('[data-part="outline"]')).toHaveClass(
      'stroke-border-strong',
    )
    expect(glyph('lit', 'small').querySelector('[data-part="flame"]')).toHaveClass(
      'fill-action-primary',
    )
  })

  it('a lanterna grande e maior que a pequena, na mesma proporcao', () => {
    const small = glyph('lit', 'small')
    const grand = glyph('lit', 'grand')
    const dimension = (svg: SVGSVGElement, name: 'width' | 'height') =>
      Number(svg.getAttribute(name))
    expect(dimension(grand, 'width')).toBeGreaterThan(dimension(small, 'width'))
    expect(dimension(grand, 'height')).toBeGreaterThan(dimension(small, 'height'))
    expect(dimension(grand, 'width') / dimension(grand, 'height')).toBeCloseTo(
      dimension(small, 'width') / dimension(small, 'height'),
    )
  })
})
