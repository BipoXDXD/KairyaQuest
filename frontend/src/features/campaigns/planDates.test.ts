import { describe, expect, it } from 'vitest'
import { addCivilDays, weekStartsOf } from './planDates'

describe('addCivilDays', () => {
  it.each([
    ['2026-09-21', 7, '2026-09-28'],
    ['2026-09-28', -7, '2026-09-21'],
    ['2026-09-28', 3, '2026-10-01'],
    ['2026-12-28', 7, '2027-01-04'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-09-21', 0, '2026-09-21'],
  ])('%s %+d dias = %s', (civil, days, expected) => {
    expect(addCivilDays(civil, days)).toBe(expected)
  })
})

describe('weekStartsOf', () => {
  it.each([
    // 2026-09-21 e segunda-feira. Os instantes em Sao Paulo (UTC-3).
    ['segunda 00:00', '2026-09-21T03:00:00Z', '2026-09-21', '2026-09-28'],
    [
      'segunda 00:00 de Toquio ainda e domingo em SP',
      '2026-09-20T15:00:00Z',
      '2026-09-14',
      '2026-09-21',
    ],
    ['quarta ao meio-dia', '2026-09-23T15:00:00Z', '2026-09-21', '2026-09-28'],
    ['domingo 23:59', '2026-09-28T02:59:00Z', '2026-09-21', '2026-09-28'],
    ['domingo 23:59 e segunda em Toquio e UTC', '2026-09-28T02:59:59Z', '2026-09-21', '2026-09-28'],
    ['segunda 00:00 seguinte', '2026-09-28T03:00:00Z', '2026-09-28', '2026-10-05'],
    ['virada de ano', '2026-12-31T15:00:00Z', '2026-12-28', '2027-01-04'],
  ])('%s', (_name, instant, current, next) => {
    expect(weekStartsOf(new Date(instant))).toEqual({ current, next })
  })
})
