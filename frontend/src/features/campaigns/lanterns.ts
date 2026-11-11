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

export interface Lantern {
  key: string
  kind: 'day' | 'special'
  state: LanternState
  availability: Availability
  /** A data civil do dia; `null` na lanterna grande, que e a especial. */
  day: string | null
}

const SPECIAL_KEY = 'special'

/** As sete diarias na ordem da API e, por ultimo, a especial. */
export function lanternsOf(plan: Plan): Lantern[] {
  const days: Lantern[] = plan.days.map((day) => ({
    key: day.day,
    kind: 'day',
    state: LANTERN_STATE[day.availability],
    availability: day.availability,
    day: day.day,
  }))
  const special: Lantern = {
    key: SPECIAL_KEY,
    kind: 'special',
    state: LANTERN_STATE[plan.special.availability],
    availability: plan.special.availability,
    day: null,
  }
  return [...days, special]
}

/**
 * Hoje e o ULTIMO dia revelado: a API revela hoje e os anteriores e manda os
 * futuros sem missao, e o plano corrente e sempre o da semana de hoje.
 */
export function todayIndexOf(plan: Plan): number {
  return plan.days.findLastIndex((day) => day.mission !== null)
}
