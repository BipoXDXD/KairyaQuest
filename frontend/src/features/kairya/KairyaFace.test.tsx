import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithI18n } from '../../test/i18n'
import { translate, type MessageKey } from '../../shared/i18n/catalog'
import type { Locale } from '../../shared/i18n/locale'
import type { Mood } from './events'
import { KairyaFace } from './KairyaFace'

const MOODS: readonly [Mood, string, MessageKey][] = [
  ['idle', 'neutral', 'kairya.face.neutral'],
  ['speaking', 'neutral', 'kairya.face.neutral'],
  ['listening', 'listening', 'kairya.face.listening'],
  ['thinking', 'thinking', 'kairya.face.thinking'],
  ['celebrating', 'celebrating', 'kairya.face.celebrating'],
  ['concerned', 'concerned', 'kairya.face.concerned'],
]
const LOCALES: readonly Locale[] = ['pt-BR', 'en']

describe('KairyaFace', () => {
  it.each(
    LOCALES.flatMap((locale) =>
      MOODS.map(([mood, face, altKey]) => [locale, mood, face, altKey] as const),
    ),
  )('em %s, o humor %s na cena traz o alt do catalogo', (locale, mood, face, altKey) => {
    renderWithI18n(<KairyaFace mood={mood} size="scene" />, { locale })

    const image = screen.getByRole('img', {
      name: translate(locale, altKey),
    })
    expect(image).toHaveAttribute('src', `/art/kairya/${face}.webp`)
    expect(image).toHaveAttribute('decoding', 'async')
  })

  it.each(MOODS)('o humor %s na miniatura e decorativo (alt vazio)', (mood, face) => {
    const { container } = renderWithI18n(<KairyaFace mood={mood} size="thumb" />)

    const image = container.querySelector('img')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('src', `/art/kairya/${face}.webp`)
  })

  it('reserva as dimensoes reais do arquivo', () => {
    const { rerender } = renderWithI18n(<KairyaFace mood="idle" size="scene" />)
    expect(screen.getByRole('img')).toHaveAttribute('width', '864')
    expect(screen.getByRole('img')).toHaveAttribute('height', '1184')

    rerender(<KairyaFace mood="celebrating" size="scene" />)
    expect(screen.getByRole('img')).toHaveAttribute('height', '1152')
  })

  it('troca src e alt no mesmo ato, sem timer', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = renderWithI18n(<KairyaFace mood="idle" size="scene" />)
      const before = screen.getByRole('img')
      expect(before).toHaveAttribute('src', '/art/kairya/neutral.webp')

      rerender(<KairyaFace mood="thinking" size="scene" />)

      const after = screen.getByRole('img', { name: translate('pt-BR', 'kairya.face.thinking') })
      expect(after).toHaveAttribute('src', '/art/kairya/thinking.webp')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(MOODS)('o humor %s nao leva transition nem animate fora de motion-safe', (mood) => {
    const { container } = renderWithI18n(<KairyaFace mood={mood} size="scene" />)

    const classes = (container.querySelector('img')?.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((name) => !name.startsWith('motion-safe:'))
    expect(classes.filter((name) => /transition|animate/.test(name))).toEqual([])
  })
})
