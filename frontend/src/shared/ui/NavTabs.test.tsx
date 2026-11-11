import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { NavTabs } from './NavTabs'

const items = [
  { id: 'headquarters', label: 'Quartel-General' },
  { id: 'campaigns', label: 'Campanhas' },
] as const

function renderTabs(onSelect = vi.fn()) {
  render(<NavTabs items={items} active="campaigns" onSelect={onSelect} />)
  return onSelect
}

test('lista com um botão por item e aria-current só no ativo', () => {
  renderTabs()
  const list = screen.getByRole('list')
  const buttons = within(list).getAllByRole('button')
  expect(buttons).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Campanhas' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('button', { name: 'Quartel-General' })).not.toHaveAttribute(
    'aria-current',
  )
})

test('não cria landmark: nenhum role navigation dentro do componente', () => {
  renderTabs()
  expect(screen.queryByRole('navigation')).toBeNull()
})

test('o ativo tem marcador visível aria-hidden além da cor', () => {
  renderTabs()
  const markers = screen.getAllByTestId('nav-current-marker')
  expect(markers).toHaveLength(1)
  expect(markers[0]).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByRole('button', { name: 'Campanhas' })).toContainElement(markers[0])
})

test('o ativo tem peso 700 e o outro não', () => {
  renderTabs()
  expect(screen.getByRole('button', { name: 'Campanhas' })).toHaveClass('font-bold')
  expect(screen.getByRole('button', { name: 'Quartel-General' })).not.toHaveClass('font-bold')
})

test('clique chama onSelect com o id', () => {
  const onSelect = renderTabs()
  fireEvent.click(screen.getByRole('button', { name: 'Quartel-General' }))
  expect(onSelect).toHaveBeenCalledWith('headquarters')
  expect(onSelect).toHaveBeenCalledTimes(1)
})

test('mantém data-testid nav-<id>', () => {
  renderTabs()
  expect(screen.getByTestId('nav-headquarters')).toBe(
    screen.getByRole('button', { name: 'Quartel-General' }),
  )
  expect(screen.getByTestId('nav-campaigns')).toBe(
    screen.getByRole('button', { name: 'Campanhas' }),
  )
})

test('alvo de toque: cada botão tem min-h-11, foco dusk e transition-colors', () => {
  renderTabs()
  for (const button of screen.getAllByRole('button')) {
    expect(button).toHaveClass('min-h-11', 'focus-visible:outline-focus-ring', 'transition-colors')
    expect(button).toHaveAttribute('type', 'button')
  }
})

test('lista vazia não quebra', () => {
  render(<NavTabs<string> items={[]} active="x" onSelect={vi.fn()} />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
})
