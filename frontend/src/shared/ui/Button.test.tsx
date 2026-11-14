import { fireEvent, render, screen } from '@testing-library/react'
import { createRef, type FormEvent } from 'react'
import { expect, test, vi } from 'vitest'
import { Button } from './Button'

const VARIANTS = ['primary', 'secondary', 'tertiary', 'danger-confirm'] as const

test.each(VARIANTS)('%s renderiza um botão type=button com o rótulo', (variant) => {
  render(<Button variant={variant}>Salvar</Button>)
  const b = screen.getByRole('button', { name: 'Salvar' })
  expect(b).toHaveAttribute('type', 'button')
  expect(b).toHaveAttribute('data-variant', variant)
})

test('sem variant, é secondary', () => {
  render(<Button>Salvar</Button>)
  expect(screen.getByRole('button', { name: 'Salvar' })).toHaveAttribute(
    'data-variant',
    'secondary',
  )
})

test('fora de loading, clique chama onClick e não há aria-busy nem aria-disabled', () => {
  const onClick = vi.fn()
  render(<Button onClick={onClick}>Salvar</Button>)
  const b = screen.getByRole('button', { name: 'Salvar' })
  fireEvent.click(b)
  expect(onClick).toHaveBeenCalledTimes(1)
  expect(b).not.toHaveAttribute('aria-busy')
  expect(b).not.toHaveAttribute('aria-disabled')
})

test('loading: aria-busy, aria-disabled, rótulo mantido e clique ignorado', () => {
  const onClick = vi.fn()
  render(
    <Button loading onClick={onClick}>
      Salvar
    </Button>,
  )
  const b = screen.getByRole('button', { name: 'Salvar' })
  expect(b).toHaveAttribute('aria-busy', 'true')
  expect(b).toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(b)
  expect(onClick).not.toHaveBeenCalled()
})

test('loading + type=submit dentro de <form>: o onSubmit não é chamado', () => {
  const onSubmit = vi.fn((e: FormEvent) => e.preventDefault())
  render(
    <form onSubmit={onSubmit}>
      <Button type="submit" loading>
        Enviar
      </Button>
    </form>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
  expect(onSubmit).not.toHaveBeenCalled()
})

test('loading continua focável (não usa disabled), para o foco não se perder', () => {
  render(<Button loading>Salvar</Button>)
  const b = screen.getByRole('button', { name: 'Salvar' })
  expect(b).not.toBeDisabled()
  b.focus()
  expect(b).toHaveFocus()
})

test('disabled não chama onClick', () => {
  const onClick = vi.fn()
  render(
    <Button disabled onClick={onClick}>
      Salvar
    </Button>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  expect(onClick).not.toHaveBeenCalled()
})

test('type=submit é respeitado', () => {
  render(<Button type="submit">Enviar</Button>)
  expect(screen.getByRole('button', { name: 'Enviar' })).toHaveAttribute('type', 'submit')
})

test.each(VARIANTS)('alvo de toque: min-h-11 e min-w-11 em %s', (variant) => {
  render(<Button variant={variant}>Salvar</Button>)
  expect(screen.getByRole('button', { name: 'Salvar' })).toHaveClass('min-h-11', 'min-w-11')
})

test('cada variante tem a classe da pirâmide (sólido, contorno, link, perigo)', () => {
  render(
    <>
      <Button variant="primary">A</Button>
      <Button variant="secondary">B</Button>
      <Button variant="tertiary">C</Button>
      <Button variant="danger-confirm">D</Button>
    </>,
  )
  expect(screen.getByRole('button', { name: 'A' })).toHaveClass('bg-action-primary')
  expect(screen.getByRole('button', { name: 'B' })).toHaveClass('border-border-strong')
  expect(screen.getByRole('button', { name: 'C' })).toHaveClass('hover:underline')
  expect(screen.getByRole('button', { name: 'D' })).toHaveClass('bg-feedback-danger')
})

test('ref aponta para o <button>: quem devolve o foco ao botão não precisa de id', () => {
  const ref = createRef<HTMLButtonElement>()
  render(<Button ref={ref}>Salvar</Button>)
  expect(ref.current).toBe(screen.getByRole('button', { name: 'Salvar' }))
})
