import { saoPauloCivilDate } from '../../shared/lib/deadline'

/** Quais semanas o formulario oferece: a atual e a seguinte (`semana_distante` recusa o resto). */
export type WeekChoice = 'current' | 'next'

const DAYS_PER_WEEK = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Os dias de `civil` ("2026-09-21") como um instante UTC ao meio-dia, sem fuso na conta. */
function civilNoonUtc(civil: string): number {
  return Date.UTC(
    Number(civil.slice(0, 4)),
    Number(civil.slice(5, 7)) - 1,
    Number(civil.slice(8, 10)),
    12,
  )
}

/** A data civil `days` dias depois (ou antes, se negativo) de `civil`. */
export function addCivilDays(civil: string, days: number): string {
  return new Date(civilNoonUtc(civil) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/**
 * As segundas-feiras da semana atual e da seguinte, como datas civis, para o
 * instante `now`.
 *
 * O dia vem do relogio de Sao Paulo (o mesmo `dia_de` do servidor), e nao do
 * fuso de quem le: domingo 23:59 em Sao Paulo ja e segunda em Toquio, e a
 * semana certa e a que o servidor vai considerar. Pura: `now` entra por
 * parametro.
 */
export function weekStartsOf(now: Date): Record<WeekChoice, string> {
  const today = saoPauloCivilDate(now.toISOString())
  const sundayFirst = new Date(civilNoonUtc(today)).getUTCDay()
  const sinceMonday = (sundayFirst + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK
  const current = addCivilDays(today, -sinceMonday)
  return { current, next: addCivilDays(current, DAYS_PER_WEEK) }
}
