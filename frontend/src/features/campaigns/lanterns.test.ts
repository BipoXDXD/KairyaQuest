import { describe, expect, it } from 'vitest'
import type { Availability, Mission } from '../../shared/types/mission'
import type { Plan, PlanDay } from './types'
import { LANTERN_STATE, lanternsOf, todayIndexOf, type LanternState } from './lanterns'

const DAYS = [
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2026-09-27',
]

/** So a presenca da missao importa para `todayIndexOf`; o conteudo nao. */
const MISSION = { id: 1 } as Mission

function day(date: string, availability: Availability, revealed: boolean): PlanDay {
  return { day: date, availability, mission: revealed ? MISSION : null }
}

function plan(availabilities: Availability[], revealedUntil: number): Plan {
  return {
    week_start: DAYS[0],
    days: DAYS.map((date, index) => day(date, availabilities[index], index <= revealedUntil)),
    special: { availability: 'bloqueada', progress: 1, mission: null },
  }
}

describe('LANTERN_STATE', () => {
  it.each<[Availability, LanternState]>([
    ['concluida', 'lit'],
    ['perdida', 'out'],
    ['expirada', 'out'],
    ['disponivel', 'future'],
    ['bloqueada', 'future'],
    ['fora_do_plano', 'future'],
  ])('%s vira %s', (availability, state) => {
    expect(LANTERN_STATE[availability]).toBe(state)
  })

  it('cobre exatamente os seis valores de Availability', () => {
    expect(Object.keys(LANTERN_STATE).sort()).toEqual([
      'bloqueada',
      'concluida',
      'disponivel',
      'expirada',
      'fora_do_plano',
      'perdida',
    ])
  })
})

describe('lanternsOf', () => {
  const semana = plan(
    ['concluida', 'concluida', 'perdida', 'concluida', 'disponivel', 'bloqueada', 'bloqueada'],
    4,
  )

  it('devolve oito lanternas: sete diarias na ordem da API e a especial por ultimo', () => {
    const lanterns = lanternsOf(semana)
    expect(lanterns).toHaveLength(8)
    expect(lanterns.slice(0, 7).map((l) => [l.kind, l.day])).toEqual(
      DAYS.map((date) => ['day', date]),
    )
    expect(lanterns[7]).toMatchObject({ kind: 'special', day: null })
  })

  it('o estado de cada lanterna sai da tabela de disponibilidade', () => {
    expect(lanternsOf(semana).map((l) => l.state)).toEqual([
      'lit',
      'lit',
      'out',
      'lit',
      'future',
      'future',
      'future',
      'future',
    ])
  })

  it('guarda a disponibilidade original e uma chave unica por lanterna', () => {
    const lanterns = lanternsOf(semana)
    expect(lanterns.map((l) => l.availability)).toEqual([
      'concluida',
      'concluida',
      'perdida',
      'concluida',
      'disponivel',
      'bloqueada',
      'bloqueada',
      'bloqueada',
    ])
    expect(new Set(lanterns.map((l) => l.key)).size).toBe(8)
  })

  it('a especial concluida acende e a expirada apaga', () => {
    const concluida: Plan = {
      ...semana,
      special: { availability: 'concluida', progress: 0, mission: MISSION },
    }
    const expirada: Plan = {
      ...semana,
      special: { availability: 'expirada', progress: 0, mission: MISSION },
    }
    expect(lanternsOf(concluida)[7].state).toBe('lit')
    expect(lanternsOf(expirada)[7].state).toBe('out')
  })
})

describe('todayIndexOf', () => {
  const todas = Array<Availability>(7).fill('bloqueada')

  it('e o indice do ultimo dia revelado', () => {
    expect(todayIndexOf(plan(todas, 3))).toBe(3)
  })

  it('com a semana inteira revelada, e o domingo', () => {
    expect(todayIndexOf(plan(todas, 6))).toBe(6)
  })

  it('sem nenhum dia revelado, e -1', () => {
    expect(todayIndexOf(plan(todas, -1))).toBe(-1)
  })
})
