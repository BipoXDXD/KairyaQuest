import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Area } from './areas'
import { SideNav } from './SideNav'

describe('SideNav', () => {
  it('e um landmark de navegacao chamado Áreas, com Quartel-General e Campanhas, nessa ordem', () => {
    render(<SideNav active="headquarters" onNavigate={vi.fn()} />)

    const nav = screen.getByRole('navigation', { name: 'Áreas' })
    const buttons = within(nav).getAllByRole('button')
    expect(buttons).toHaveLength(2)
    // O nome acessivel nao inclui o marcador ▸ (aria-hidden).
    expect(buttons[0]).toHaveAccessibleName('Quartel-General')
    expect(buttons[1]).toHaveAccessibleName('Campanhas')
  })

  it.each<[Area, string, string]>([
    ['headquarters', 'Quartel-General', 'Campanhas'],
    ['campaigns', 'Campanhas', 'Quartel-General'],
  ])('com %s ativa, so ela tem aria-current=page', (active, current, other) => {
    render(<SideNav active={active} onNavigate={vi.fn()} />)

    expect(screen.getByRole('button', { name: current })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: other })).not.toHaveAttribute('aria-current')
  })

  it('o marcador visivel ▸ fica so na area ativa, e o leitor de tela nao o le', () => {
    // Aviso alem da cor (README §7): quem nao distingue a cor da barra ainda
    // ve o marcador. O leitor de tela ja ouve o `aria-current`.
    render(<SideNav active="campaigns" onNavigate={vi.fn()} />)

    const markers = screen.getAllByTestId('nav-current-marker')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toHaveTextContent('▸')
    expect(markers[0]).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('nav-campaigns')).toContainElement(markers[0]!)
  })

  it('clicar numa area chama onNavigate com o id dela', () => {
    const onNavigate = vi.fn()
    render(<SideNav active="headquarters" onNavigate={onNavigate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Campanhas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quartel-General' }))

    expect(onNavigate.mock.calls).toEqual([['campaigns'], ['headquarters']])
  })
})
