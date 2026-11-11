import type { Availability } from '../../shared/types/mission'
import type { Plan } from './types'

/** Como a lanterna aparece: acesa, apagada ou futura (ainda por vir ou sem plano). */
export type LanternState = 'lit' | 'out' | 'future'

/**
 * `Record<Availability, ...>` faz a tabela ser EXAUSTIVA: uma disponibilidade
 * nova no contrato reprova o `tsc` aqui, em vez de aparecer sem estado na tela.
 *
 * `fora_do_plano` (dia anterior a criacao do plano) e `future`, nunca `out`:
 * quem acabou de chegar nao tem lanterna apagada, porque nao houve falha.
 */
export const LANTERN_STATE: Record<Availability, LanternState> = {
  concluida: 'lit',
  perdida: 'out',
  expirada: 'out',
  disponivel: 'future',
  bloqueada: 'future',
  fora_do_plano: 'future',
}

interface LanternBase {
  state: LanternState
  availability: Availability
}

/** Uma diaria: sempre tem a data civil. */
export interface DayLantern extends LanternBase {
  kind: 'day'
  day: string
}

/** A lanterna grande, a especial: nao tem data. */
export interface SpecialLantern extends LanternBase {
  kind: 'special'
}

export type Lantern = DayLantern | SpecialLantern

export interface Trail {
  /** As sete diarias, na ordem da API. */
  days: DayLantern[]
  special: SpecialLantern
}

export function lanternsOf(plan: Plan): Trail {
  return {
    days: plan.days.map((day) => ({
      kind: 'day',
      state: LANTERN_STATE[day.availability],
      availability: day.availability,
      day: day.day,
    })),
    special: {
      kind: 'special',
      state: LANTERN_STATE[plan.special.availability],
      availability: plan.special.availability,
    },
  }
}

/**
 * Hoje e o ULTIMO dia revelado: a API revela hoje e os anteriores e manda os
 * futuros sem missao, e o plano corrente e sempre o da semana de hoje.
 */
export function todayIndexOf(plan: Plan): number {
  return plan.days.findLastIndex((day) => day.mission !== null)
}
