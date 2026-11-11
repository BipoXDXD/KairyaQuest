import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Panel } from './Panel'

test.each([
  ['sunken', 'bg-bg-canvas'],
  ['surface', 'bg-bg-surface'],
  ['raised', 'bg-bg-raised'],
] as const)('elevation %s usa %s', (elevation, cls) => {
  render(
    <Panel elevation={elevation} data-testid="p">
      x
    </Panel>,
  )
  expect(screen.getByTestId('p')).toHaveClass(cls)
  expect(screen.getByTestId('p')).toHaveAttribute('data-elevation', elevation)
})

test('sem props, é um div surface', () => {
  render(<Panel data-testid="p">x</Panel>)
  const panel = screen.getByTestId('p')
  expect(panel.tagName).toBe('DIV')
  expect(panel).toHaveAttribute('data-elevation', 'surface')
  expect(panel).toHaveClass('bg-bg-surface')
})

test('as="section" com aria-labelledby vira region nomeada', () => {
  render(
    <Panel as="section" aria-labelledby="t">
      <h2 id="t">Missões de hoje</h2>
    </Panel>,
  )
  expect(screen.getByRole('region', { name: 'Missões de hoje' }).tagName).toBe('SECTION')
})

test.each(['aside', 'article'] as const)('as="%s" muda o elemento', (as) => {
  render(
    <Panel as={as} data-testid="p">
      x
    </Panel>,
  )
  expect(screen.getByTestId('p').tagName).toBe(as.toUpperCase())
})

test('glow só quando pedido', () => {
  render(
    <>
      <Panel data-testid="plain">x</Panel>
      <Panel glow data-testid="glow">
        y
      </Panel>
    </>,
  )
  expect(screen.getByTestId('plain')).not.toHaveClass('shadow-glow-lantern')
  expect(screen.getByTestId('glow')).toHaveClass('shadow-glow-lantern')
})

test('mostra os filhos', () => {
  render(<Panel data-testid="p">conteúdo</Panel>)
  expect(screen.getByTestId('p')).toHaveTextContent('conteúdo')
})

test('div não repassa aria-labelledby, nem quando o tipo é contornado', () => {
  render(
    // @ts-expect-error ARIA 1.2 proíbe nomear um div sem role; o tipo só aceita aria-labelledby em section, aside e article.
    <Panel aria-labelledby="t" data-testid="p">
      x
    </Panel>,
  )
  expect(screen.getByTestId('p')).not.toHaveAttribute('aria-labelledby')
})
