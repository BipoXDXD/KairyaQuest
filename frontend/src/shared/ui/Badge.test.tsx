import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Badge } from './Badge'

const TONES = ['neutral', 'success', 'danger', 'action'] as const

test.each(TONES)('tom %s mostra o texto e expõe data-tone', (tone) => {
  render(
    <Badge tone={tone} data-testid="b">
      Concluída
    </Badge>,
  )
  const badge = screen.getByTestId('b')
  expect(badge).toHaveTextContent('Concluída')
  expect(badge).toHaveAttribute('data-tone', tone)
  expect(badge).toHaveClass('rounded-pill')
})

test.each([
  ['neutral', 'text-text-muted'],
  ['success', 'text-feedback-success'],
  ['danger', 'text-feedback-danger'],
  ['action', 'text-action-primary'],
] as const)('tom %s usa %s, sem fundo próprio', (tone, cls) => {
  render(
    <Badge tone={tone} data-testid="b">
      Concluída
    </Badge>,
  )
  const badge = screen.getByTestId('b')
  expect(badge).toHaveClass(cls)
  expect([...badge.classList].filter((c) => c.startsWith('bg-'))).toEqual([])
})
