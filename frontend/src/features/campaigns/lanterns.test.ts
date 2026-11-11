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
const MISSION: Mission = {
  id: 1,
  instructions: 'Revisar',
  completion_criterion: 'Resumo',
  difficulty: 2,
  estimated_minutes: 30,
  mission_type: 'diaria',
  day: DAYS[0],
  deadline: '2026-09-22T00:00:00-03:00',
  state: 'pendente',
  availability: 'disponivel',
  started_at: null,
  completed_at: null,
  xp: 40,
  actual_duration_minutes: null,
  verification: null,
  evidence: null,
  evaluation: null,
  reschedules: [],
}

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

  it('separa as sete diarias, na ordem da API, da especial', () => {
    const { days, special } = lanternsOf(semana)
    expect(days.map((lantern) => [lantern.kind, lantern.day])).toEqual(
      DAYS.map((date) => ['day', date]),
    )
    expect(special.kind).toBe('special')
    expect('day' in special).toBe(false)
  })

  it('o estado de cada lanterna sai da tabela de disponibilidade', () => {
    const { days, special } = lanternsOf(semana)
    expect(days.map((lantern) => lantern.state)).toEqual([
      'lit',
      'lit',
      'out',
      'lit',
      'future',
      'future',
      'future',
    ])
    expect(special.state).toBe('future')
  })

  it('guarda a disponibilidade original de cada lanterna', () => {
    const { days, special } = lanternsOf(semana)
    expect(days.map((lantern) => lantern.availability)).toEqual([
      'concluida',
      'concluida',
      'perdida',
      'concluida',
      'disponivel',
      'bloqueada',
      'bloqueada',
    ])
    expect(special.availability).toBe('bloqueada')
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
    expect(lanternsOf(concluida).special.state).toBe('lit')
    expect(lanternsOf(expirada).special.state).toBe('out')
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
