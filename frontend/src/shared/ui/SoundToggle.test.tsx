import { fireEvent, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { renderWithI18n } from '../../test/i18n'
import { SoundToggle } from './SoundToggle'

test.each([
  ['voice', 'Voz da Kairya'],
  ['sfx', 'Efeitos sonoros'],
] as const)('%s tem o nome do catálogo', (channel, name) => {
  renderWithI18n(<SoundToggle channel={channel} pressed onPressedChange={vi.fn()} />)
  expect(screen.getByRole('button', { name })).toBeInTheDocument()
})

test.each([
  ['voice', "Kairya's voice"],
  ['sfx', 'Sound effects'],
] as const)('%s em inglês: %s', (channel, name) => {
  renderWithI18n(<SoundToggle channel={channel} pressed onPressedChange={vi.fn()} />, {
    locale: 'en',
  })
  expect(screen.getByRole('button', { name })).toBeInTheDocument()
})

test.each([
  [false, 'false', true],
  [true, 'true', false],
])('pressed=%s: aria-pressed=%s e o clique pede %s', (pressed, attr, next) => {
  const onPressedChange = vi.fn()
  renderWithI18n(
    <SoundToggle channel="voice" pressed={pressed} onPressedChange={onPressedChange} />,
  )
  const button = screen.getByRole('button', { name: 'Voz da Kairya' })
  expect(button).toHaveAttribute('aria-pressed', attr)
  fireEvent.click(button)
  expect(onPressedChange).toHaveBeenCalledWith(next)
  expect(onPressedChange).toHaveBeenCalledTimes(1)
})

test('o ícone muda com o estado (ligado × cortado), não só a cor', () => {
  const { rerender } = renderWithI18n(
    <SoundToggle channel="sfx" pressed onPressedChange={vi.fn()} />,
  )
  const on = screen.getByTestId('sound-icon-on')
  expect(on.closest('[aria-hidden="true"]')).not.toBeNull()
  rerender(<SoundToggle channel="sfx" pressed={false} onPressedChange={vi.fn()} />)
  expect(screen.queryByTestId('sound-icon-on')).toBeNull()
  expect(screen.getByTestId('sound-icon-off')).toBeInTheDocument()
})

test('alvo de toque: o botão tem size-11', () => {
  renderWithI18n(<SoundToggle channel="sfx" pressed={false} onPressedChange={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Efeitos sonoros' })).toHaveClass('size-11')
})
