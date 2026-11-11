import { describe, expect, it } from 'vitest'
import type { Locale } from './locale'
import { plural } from './plural'

describe('plural', () => {
  // Regra CLDR: no `pt`, 0 cai em `one`; no `en`, 0 cai em `other`.
  const forms = { one: 'um', other: 'muitos' } as const
  it.each<[Locale, number, string]>([
    ['pt-BR', 0, 'um'],
    ['pt-BR', 1, 'um'],
    ['pt-BR', 2, 'muitos'],
    ['en', 0, 'muitos'],
    ['en', 1, 'um'],
    ['en', 2, 'muitos'],
  ])('plural(%s, %d) → %s', (locale, n, expected) => {
    expect(plural(locale, n, forms)).toBe(expected)
  })

  const comZero = { zero: 'nenhum', one: 'um', other: 'muitos' } as const
  it.each<[Locale, number, string]>([
    ['pt-BR', 0, 'nenhum'],
    ['pt-BR', 1, 'um'],
    ['pt-BR', 2, 'muitos'],
    ['en', 0, 'nenhum'],
    ['en', 1, 'um'],
    ['en', 2, 'muitos'],
  ])('plural com zero(%s, %d) → %s', (locale, n, expected) => {
    expect(plural(locale, n, comZero)).toBe(expected)
  })
})
