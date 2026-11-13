import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/client'
import { parseProgress } from './parseProgress'

/** Um corpo de `GET /api/progress` com o custo do nivel dado (proximo - piso). */
function body(floor: number, next: number): unknown {
  return { xp_total: floor, level: 3, level_floor_xp: floor, next_level_xp: next, achievements: [] }
}

/** O erro que `parseProgress` lancou, para as assercoes sobre ele. */
function failureOf(raw: unknown): unknown {
  try {
    parseProgress(raw)
  } catch (error: unknown) {
    return error
  }
  throw new Error('o parse deveria ter recusado o corpo')
}

describe('parseProgress', () => {
  it('aceita o custo de nivel 1, a menor fronteira valida, e devolve o progresso intacto', () => {
    const raw = body(300, 301)

    expect(parseProgress(raw)).toEqual({
      xp_total: 300,
      level: 3,
      level_floor_xp: 300,
      next_level_xp: 301,
      achievements: [],
    })
  })

  it.each([
    ['zero', 300, 300],
    ['negativo', 300, 299],
  ])('recusa o custo de nivel %s como falha de formato', (_caso, floor, next) => {
    const erro = failureOf(body(floor, next))

    expect(erro).toBeInstanceOf(ApiError)
    expect(erro).toMatchObject({ kind: 'format', status: 200, code: null })
  })

  it('recusa o corpo sem os campos de nivel, em vez de calcular NaN', () => {
    expect(failureOf({ xp_total: 10, achievements: [] })).toMatchObject({ kind: 'format' })
  })

  it.each([
    ['nulo', null],
    ['texto', 'ok'],
  ])('recusa o corpo %s', (_caso, raw) => {
    expect(failureOf(raw)).toMatchObject({ kind: 'format' })
  })
})
