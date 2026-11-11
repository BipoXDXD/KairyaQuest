import { describe, expect, it } from 'vitest'
import { translate } from '../../shared/i18n/catalog'
import type { Locale } from '../../shared/i18n/locale'
import { captionLines } from './captionText'

const tIn =
  (locale: Locale) =>
  (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
    translate(locale, key, vars)

const FIRST_STEPS = { code: 'first_steps', title: 'do back', description: 'do back' }
const STREAK_7 = { code: 'streak_7', title: 'do back', description: 'do back' }

describe('captionLines', () => {
  it('sem detalhe, não há legenda', () => {
    expect(captionLines(null, tIn('pt-BR'))).toEqual([])
  })

  it.each([
    ['pt-BR', 'Subiu para o nível 5!'],
    ['en', 'You reached level 5!'],
  ] as const)('em %s, o nível vira uma linha', (locale, text) => {
    expect(captionLines({ kind: 'level', level: 5 }, tIn(locale))).toEqual([text])
  })

  it.each([
    ['pt-BR', ['Conquista: Primeiros passos', 'Conquista: Uma semana inteira']],
    ['en', ['Achievement: First Steps', 'Achievement: A Whole Week']],
  ] as const)('em %s, cada conquista vira uma linha com o título do catálogo', (locale, lines) => {
    const detail = { kind: 'achievements', items: [FIRST_STEPS, STREAK_7] } as const

    expect(captionLines(detail, tIn(locale))).toEqual(lines)
  })

  it('um código que o catálogo não conhece cai no título do back', () => {
    const detail = {
      kind: 'achievements',
      items: [{ code: 'novo_no_back', title: 'Título do back', description: 'd' }],
    } as const

    expect(captionLines(detail, tIn('pt-BR'))).toEqual(['Conquista: Título do back'])
  })
})
