import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EmptyState } from './EmptyState'

test('mostra a arte decorativa do tipo pedido, título no nível 2 e a ação', () => {
  render(
    <EmptyState
      art="missions"
      title="Nenhuma missão ainda"
      body="Crie a primeira."
      action={<button>Criar</button>}
    />,
  )
  const img = screen.getByRole('presentation', { hidden: true })
  expect(img).toHaveAttribute('src', '/art/empty/missions.webp')
  expect(img).toHaveAttribute('alt', '')
  expect(img).toHaveAttribute('loading', 'lazy')
  expect(
    screen.getByRole('heading', { level: 2, name: 'Nenhuma missão ainda' }),
  ).toBeInTheDocument()
  expect(screen.getByText('Crie a primeira.').tagName).toBe('P')
  expect(screen.getByRole('button', { name: 'Criar' })).toBeInTheDocument()
})

test.each([
  ['plan', '/art/empty/plan.webp'],
  ['campaign-new', '/art/empty/campaign-new.webp'],
] as const)('arte %s aponta para %s', (art, src) => {
  const { container } = render(<EmptyState art={art} title="t" />)
  expect(container.querySelector('img')).toHaveAttribute('src', src)
})

test('a arte tem tamanho fixo (width e height), para não deslocar o layout', () => {
  const { container } = render(<EmptyState art="plan" title="t" />)
  const img = container.querySelector('img')
  expect(img).toHaveAttribute('width', '160')
  expect(img).toHaveAttribute('height', '160')
  expect(img).toHaveClass('object-cover')
})

test('headingLevel 3 é respeitado', () => {
  render(<EmptyState art="plan" title="Sem plano" headingLevel={3} />)
  expect(screen.getByRole('heading', { level: 3, name: 'Sem plano' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
})

test('sem body nem action, não sobra parágrafo nem contêiner vazio', () => {
  render(<EmptyState art="plan" title="Sem plano" data-testid="e" />)
  const tags = [...screen.getByTestId('e').children].map((c) => c.tagName)
  expect(tags).toEqual(['IMG', 'H2'])
})

test('arte que falha ao carregar some e o texto continua', () => {
  const { container } = render(<EmptyState art="plan" title="Sem plano" />)
  const img = container.querySelector('img')
  if (!img) throw new Error('a arte deveria estar na tela antes do erro')
  fireEvent.error(img)
  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Sem plano' })).toBeVisible()
})

test('com body e action, a ordem é arte, título, texto e ação', () => {
  render(
    <EmptyState
      art="plan"
      title="Sem plano"
      body="Monte o primeiro."
      action={<button>Montar</button>}
      data-testid="e"
    />,
  )
  const tags = [...screen.getByTestId('e').children].map((c) => c.tagName)
  expect(tags).toEqual(['IMG', 'H2', 'P', 'DIV'])
})

test('depois de uma falha, trocar a arte volta a mostrar a imagem nova', () => {
  const { container, rerender } = render(<EmptyState art="plan" title="Sem plano" />)
  const failed = container.querySelector('img')
  if (!failed) throw new Error('a arte deveria estar na tela antes do erro')
  fireEvent.error(failed)
  expect(container.querySelector('img')).toBeNull()
  rerender(<EmptyState art="missions" title="Sem plano" />)
  expect(container.querySelector('img')).toHaveAttribute('src', '/art/empty/missions.webp')
})
