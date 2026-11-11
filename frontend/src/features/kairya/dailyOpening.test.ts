import { beforeEach, describe, expect, it } from 'vitest'
import {
  civilDayInSaoPaulo,
  decideOpening,
  GREETING_STORAGE_KEY,
  greetingPeriod,
  PRESENCE_TIME_ZONE,
  STREAK_STORAGE_KEY,
  storageMemory,
} from './dailyOpening'

function failing(): never {
  throw new DOMException('denied', 'SecurityError')
}

/** Storage que lança em toda operação, como no modo privado ou sem cota. */
const BROKEN_STORAGE: Storage = {
  length: 0,
  clear: failing,
  getItem: failing,
  key: failing,
  removeItem: failing,
  setItem: failing,
}

describe('constantes', () => {
  it('chaves com prefixo kairyaquest. e fuso de São Paulo', () => {
    expect(GREETING_STORAGE_KEY).toBe('kairyaquest.lastGreeting')
    expect(STREAK_STORAGE_KEY).toBe('kairyaquest.lastStreak')
    expect(PRESENCE_TIME_ZONE).toBe('America/Sao_Paulo')
  })
})

describe('civilDayInSaoPaulo', () => {
  it.each([
    ['2026-11-11T02:59:59Z', '2026-11-10'],
    ['2026-11-11T03:00:00Z', '2026-11-11'],
  ])('civilDayInSaoPaulo(%s) → %s', (iso, day) => {
    expect(civilDayInSaoPaulo(new Date(iso))).toBe(day)
  })
})

describe('greetingPeriod', () => {
  it.each([
    ['2026-11-10T07:59:00Z', 'evening'],
    ['2026-11-10T08:00:00Z', 'morning'],
    ['2026-11-10T14:59:00Z', 'morning'],
    ['2026-11-10T15:00:00Z', 'afternoon'],
    ['2026-11-10T20:59:00Z', 'afternoon'],
    ['2026-11-10T21:00:00Z', 'evening'],
    ['2026-11-11T02:59:00Z', 'evening'],
    ['2026-11-11T03:00:00Z', 'evening'],
  ])('greetingPeriod(%s) → %s (on/off point em 05h, 12h, 18h e 00h de SP)', (iso, period) => {
    expect(greetingPeriod(new Date(iso))).toBe(period)
  })
})

describe('decideOpening', () => {
  it.each([
    [
      { streak: 3, lastStreak: 2, greetedDay: null },
      { type: 'greet', period: 'morning' },
    ],
    [
      { streak: 0, lastStreak: 3, greetedDay: null },
      { type: 'concern', reason: 'streakReset' },
    ],
    [
      { streak: 0, lastStreak: 1, greetedDay: null },
      { type: 'concern', reason: 'streakReset' },
    ],
    [
      { streak: 0, lastStreak: 0, greetedDay: null },
      { type: 'greet', period: 'morning' },
    ],
    [
      { streak: 0, lastStreak: null, greetedDay: null },
      { type: 'greet', period: 'morning' },
    ],
    [
      { streak: 1, lastStreak: 3, greetedDay: null },
      { type: 'greet', period: 'morning' },
    ],
    [{ streak: 0, lastStreak: 3, greetedDay: '2026-11-10' }, null],
    [
      { streak: 1, lastStreak: 1, greetedDay: '2026-11-09' },
      { type: 'greet', period: 'morning' },
    ],
  ])('decideOpening(%o) → %o', (partial, expected) => {
    expect(decideOpening({ ...partial, today: '2026-11-10', period: 'morning' })).toEqual(expected)
  })

  it('usa o período recebido na saudação', () => {
    expect(
      decideOpening({
        streak: 2,
        lastStreak: 2,
        greetedDay: null,
        today: '2026-11-10',
        period: 'evening',
      }),
    ).toEqual({ type: 'greet', period: 'evening' })
  })
})

describe('storageMemory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('grava e lê o dia saudado e a sequência', () => {
    const m = storageMemory(localStorage)
    expect(m.greetedDay()).toBeNull()
    expect(m.lastStreak()).toBeNull()
    m.markGreeted('2026-11-10')
    m.rememberStreak(0)
    expect(localStorage.getItem('kairyaquest.lastGreeting')).toBe('2026-11-10')
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBe('0')
    expect(m.greetedDay()).toBe('2026-11-10')
    expect(m.lastStreak()).toBe(0)
  })

  it.each(['{', '2026-1-10', '2026-11-10x', ' 2026-11-10', ''])(
    'dia saudado inválido %j vira null',
    (raw) => {
      localStorage.setItem('kairyaquest.lastGreeting', raw)
      expect(storageMemory(localStorage).greetedDay()).toBeNull()
    },
  )

  it.each(['-1', '2.5', 'abc', '', '1e3', ' 3', 'Infinity', '99999999999999999999'])(
    'sequência inválida %j vira null',
    (raw) => {
      localStorage.setItem('kairyaquest.lastStreak', raw)
      expect(storageMemory(localStorage).lastStreak()).toBeNull()
    },
  )

  it('sequência 12 é lida como 12', () => {
    localStorage.setItem('kairyaquest.lastStreak', '12')
    expect(storageMemory(localStorage).lastStreak()).toBe(12)
  })

  it.each([-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rememberStreak(%s) inválido é ignorado e não grava',
    (streak) => {
      localStorage.setItem('kairyaquest.lastStreak', '3')
      storageMemory(localStorage).rememberStreak(streak)
      expect(localStorage.getItem('kairyaquest.lastStreak')).toBe('3')
    },
  )

  it.each([
    [0, '0'],
    [1, '1'],
    [Number.MAX_SAFE_INTEGER, '9007199254740991'],
  ])('rememberStreak(%s) na borda válida grava %s', (streak, stored) => {
    storageMemory(localStorage).rememberStreak(streak)
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBe(stored)
  })

  it('storageMemory sobrevive a storage que lança (Review Focus 3)', () => {
    const m = storageMemory(BROKEN_STORAGE)
    expect(m.greetedDay()).toBeNull()
    expect(m.lastStreak()).toBeNull()
    expect(() => {
      m.markGreeted('2026-11-10')
      m.rememberStreak(2)
    }).not.toThrow()
  })

  it('storage null lê null e grava nada', () => {
    const m = storageMemory(null)
    expect(() => {
      m.markGreeted('2026-11-10')
      m.rememberStreak(2)
    }).not.toThrow()
    expect(m.greetedDay()).toBeNull()
    expect(m.lastStreak()).toBeNull()
  })
})
