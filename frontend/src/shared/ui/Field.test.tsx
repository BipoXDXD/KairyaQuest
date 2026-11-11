import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Field } from './Field'
import { Panel } from './Panel'

test('label liga ao controle pelo id', () => {
  render(<Field label="Evidência">{(c) => <textarea {...c} />}</Field>)
  expect(screen.getByLabelText('Evidência').tagName).toBe('TEXTAREA')
})

test('help e error entram no aria-describedby, nesta ordem', () => {
  render(
    <Field label="Evidência" help="Cole o link." error="Campo vazio.">
      {(c) => <input {...c} />}
    </Field>,
  )
  const control = screen.getByLabelText('Evidência')
  const ids = control.getAttribute('aria-describedby')?.split(' ') ?? []
  expect(ids).toHaveLength(2)
  expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
    'Cole o link.',
    'Campo vazio.',
  ])
})

test('só help: aria-describedby aponta para ele e aria-invalid ausente', () => {
  render(
    <Field label="Evidência" help="Cole o link.">
      {(c) => <input {...c} />}
    </Field>,
  )
  const control = screen.getByLabelText('Evidência')
  expect(control).toHaveAccessibleDescription('Cole o link.')
  expect(control).not.toHaveAttribute('aria-invalid')
})

test('com error: aria-invalid=true e a mensagem tem ícone, não só cor', () => {
  render(
    <Field label="Evidência" error="Campo vazio.">
      {(c) => <input {...c} />}
    </Field>,
  )
  const control = screen.getByLabelText('Evidência')
  expect(control).toHaveAttribute('aria-invalid', 'true')
  expect(control).toHaveAccessibleDescription('Campo vazio.')
  const message = screen.getByText('Campo vazio.').parentElement
  expect(message).toHaveClass('text-feedback-danger')
  expect(message?.querySelector('[aria-hidden="true"] svg')).not.toBeNull()
})

test('sem help nem error: aria-describedby ausente e aria-invalid ausente', () => {
  render(<Field label="Evidência">{(c) => <input {...c} />}</Field>)
  const control = screen.getByLabelText('Evidência')
  expect(control).not.toHaveAttribute('aria-describedby')
  expect(control).not.toHaveAttribute('aria-invalid')
})

test('help e error vazios contam como ausentes', () => {
  render(
    <Field label="Evidência" help="" error="">
      {(c) => <input {...c} />}
    </Field>,
  )
  const control = screen.getByLabelText('Evidência')
  expect(control).not.toHaveAttribute('aria-describedby')
  expect(control).not.toHaveAttribute('aria-invalid')
})

test('o controle recebe as classes dos tokens: borda forte, fundo canvas, foco dusk e 44px', () => {
  render(<Field label="Evidência">{(c) => <input {...c} />}</Field>)
  expect(screen.getByLabelText('Evidência')).toHaveClass(
    'border-border-strong',
    'bg-bg-canvas',
    'focus-visible:outline-focus-ring',
    'min-h-11',
    'aria-invalid:border-feedback-danger',
  )
})

test('dois Field na mesma tela têm ids distintos', () => {
  render(
    <>
      <Field label="A">{(c) => <input {...c} />}</Field>
      <Field label="B">{(c) => <input {...c} />}</Field>
    </>,
  )
  expect(screen.getByLabelText('A').id).not.toBe(screen.getByLabelText('B').id)
})

test('funciona dentro de Panel raised (border-strong passa 3:1 ali)', () => {
  render(
    <Panel elevation="raised">
      <Field label="Evidência">{(c) => <input {...c} />}</Field>
    </Panel>,
  )
  expect(screen.getByLabelText('Evidência').tagName).toBe('INPUT')
})
