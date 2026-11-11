import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LanternMark } from './LanternMark'

describe('LanternMark', () => {
  it('repassa o data-testid ao svg', () => {
    const { container } = render(<LanternMark lit data-testid="x-lantern" />)

    expect(container.querySelector('svg')).toHaveAttribute('data-testid', 'x-lantern')
  })

  it('acesa: data-lit true, decorativa e com a animação só sob motion-safe', () => {
    const { container } = render(<LanternMark lit />)
    const svg = container.querySelector('svg')

    expect(svg).toHaveAttribute('data-lit', 'true')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveClass('lantern-mark', 'motion-safe:animate-lantern-light')
    const classes = (svg?.getAttribute('class') ?? '').split(/\s+/)
    expect(classes.some((classe) => /^animate-/.test(classe))).toBe(false)
  })

  it('apagada: data-lit false e sem animação', () => {
    const { container } = render(<LanternMark lit={false} />)
    const svg = container.querySelector('svg')

    expect(svg).toHaveAttribute('data-lit', 'false')
    expect(svg).toHaveClass('lantern-mark')
    expect(svg).not.toHaveClass('motion-safe:animate-lantern-light')
  })

  it('pinta com as variáveis da lanterna, sem cor solta', () => {
    const { container } = render(<LanternMark lit />)

    expect(container.innerHTML).toContain('var(--lantern-200)')
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})
