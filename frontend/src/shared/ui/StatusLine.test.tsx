import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { StatusLine } from './StatusLine'

test.each([
  ['neutral', 'text-text-muted'],
  ['success', 'text-feedback-success'],
  ['danger', 'text-feedback-danger'],
] as const)('tom %s: role=status, tom exposto, cor %s e ícone aria-hidden', (tone, cls) => {
  render(<StatusLine tone={tone}>Salvo.</StatusLine>)
  const status = screen.getByRole('status')
  expect(status).toHaveTextContent('Salvo.')
  expect(status).toHaveAttribute('data-tone', tone)
  expect(status).toHaveClass(cls)
  const icon = status.querySelector('[aria-hidden="true"]')
  expect(icon?.querySelector('svg')).not.toBeNull()
})

test('cada tom tem um ícone próprio, para a cor não ser o único sinal', () => {
  render(
    <>
      <StatusLine tone="neutral">a</StatusLine>
      <StatusLine tone="success">b</StatusLine>
      <StatusLine tone="danger">c</StatusLine>
    </>,
  )
  const icons = screen
    .getAllByRole('status')
    .map((s) => s.querySelector('[aria-hidden="true"]')?.innerHTML)
  expect(new Set(icons).size).toBe(3)
})

test('sem tom, é neutral; repassa data-testid', () => {
  render(<StatusLine data-testid="s">x</StatusLine>)
  expect(screen.getByTestId('s')).toHaveAttribute('data-tone', 'neutral')
})
