import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { IconButton } from './IconButton'

const icon = <svg data-testid="i" />

test('o nome acessível é o label e o ícone é aria-hidden', () => {
  render(<IconButton label="Fechar painel" icon={icon} onClick={vi.fn()} />)
  const b = screen.getByRole('button', { name: 'Fechar painel' })
  expect(b).toHaveAttribute('type', 'button')
  expect(screen.getByTestId('i').parentElement).toHaveAttribute('aria-hidden', 'true')
})

test.each([
  [true, 'true'],
  [false, 'false'],
])('pressed=%s vira aria-pressed=%s', (pressed, expected) => {
  render(<IconButton label="Som" icon={icon} pressed={pressed} onClick={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Som' })).toHaveAttribute('aria-pressed', expected)
})

test('sem pressed, o atributo aria-pressed não existe', () => {
  render(<IconButton label="Som" icon={icon} onClick={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Som' })).not.toHaveAttribute('aria-pressed')
})

test('clique chama onClick uma vez', () => {
  const onClick = vi.fn()
  render(<IconButton label="Som" icon={icon} onClick={onClick} />)
  fireEvent.click(screen.getByRole('button', { name: 'Som' }))
  expect(onClick).toHaveBeenCalledTimes(1)
})

test('loading: aria-busy, aria-disabled e clique ignorado', () => {
  const onClick = vi.fn()
  render(<IconButton label="Som" icon={icon} loading onClick={onClick} />)
  const b = screen.getByRole('button', { name: 'Som' })
  expect(b).toHaveAttribute('aria-busy', 'true')
  expect(b).toHaveAttribute('aria-disabled', 'true')
  expect(b).not.toBeDisabled()
  fireEvent.click(b)
  expect(onClick).not.toHaveBeenCalled()
})

test('disabled não chama onClick', () => {
  const onClick = vi.fn()
  render(<IconButton label="Som" icon={icon} disabled onClick={onClick} />)
  const b = screen.getByRole('button', { name: 'Som' })
  expect(b).toBeDisabled()
  fireEvent.click(b)
  expect(onClick).not.toHaveBeenCalled()
})

test('data-testid é repassado', () => {
  render(<IconButton label="Som" icon={icon} onClick={vi.fn()} data-testid="som" />)
  expect(screen.getByTestId('som')).toBe(screen.getByRole('button', { name: 'Som' }))
})

test('alvo de toque: size-11 (44px)', () => {
  render(<IconButton label="Som" icon={icon} onClick={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Som' })).toHaveClass('size-11')
})
