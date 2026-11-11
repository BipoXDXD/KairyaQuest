import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderWithI18n } from '../../test/i18n'
import { Skeleton } from './Skeleton'

test('sem label, o status sr-only diz "Carregando…" (catálogo)', () => {
  renderWithI18n(<Skeleton />)
  const status = screen.getByRole('status')
  expect(status).toHaveTextContent('Carregando…')
  expect(status).toHaveClass('sr-only')
})

test('sem label, em inglês, diz "Loading…"', () => {
  renderWithI18n(<Skeleton />, { locale: 'en' })
  expect(screen.getByRole('status')).toHaveTextContent('Loading…')
})

test('com label, diz o label', () => {
  renderWithI18n(<Skeleton label="Carregando a conversa…" />)
  expect(screen.getByRole('status')).toHaveTextContent('Carregando a conversa…')
})

test('label vazio é tratado como ausente: o status diz "Carregando…"', () => {
  renderWithI18n(<Skeleton label="" />)
  expect(screen.getByRole('status')).toHaveTextContent('Carregando…')
})

test('repassa data-testid e tem exatamente 3 filhos diretos [aria-hidden="true"] por padrão', () => {
  renderWithI18n(<Skeleton data-testid="sk" />)
  expect(screen.getByTestId('sk').querySelectorAll(':scope > [aria-hidden="true"]')).toHaveLength(3)
})

test('o status é filho direto do contêiner', () => {
  renderWithI18n(<Skeleton data-testid="sk" />)
  expect(screen.getByRole('status').parentElement).toBe(screen.getByTestId('sk'))
})

test('lines=1 desenha uma linha', () => {
  renderWithI18n(<Skeleton lines={1} data-testid="sk" />)
  expect(screen.getByTestId('sk').querySelectorAll(':scope > [aria-hidden="true"]')).toHaveLength(1)
})

test.each([0, -1, 1.5, Number.NaN])('lines %d lança RangeError', (lines) => {
  expect(() => renderWithI18n(<Skeleton lines={lines} />)).toThrow(RangeError)
})

test('a pulsação só existe sob motion-safe', () => {
  renderWithI18n(<Skeleton data-testid="sk" />)
  const lines = [...screen.getByTestId('sk').querySelectorAll(':scope > [aria-hidden="true"]')]
  expect(lines.every((l) => l.classList.contains('motion-safe:animate-pulse'))).toBe(true)
  expect(lines.some((l) => l.classList.contains('animate-pulse'))).toBe(false)
})
