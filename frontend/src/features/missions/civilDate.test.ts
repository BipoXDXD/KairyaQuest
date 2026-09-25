import { describe, expect, it } from 'vitest'
import { formatCivilDate } from './civilDate'

describe('formatCivilDate', () => {
  // A armadilha que a spec do ciclo nomeia: `new Date('2026-09-21')` e a
  // meia-noite em UTC, e formatada em Sao Paulo vira domingo, 20/09.
  it('mostra o dia que a API mandou, sem conversao de fuso', () => {
    expect(formatCivilDate('2026-09-21')).toBe('segunda-feira, 21/09')
  })

  it('atravessa a virada do ano sem escorregar para o dia anterior', () => {
    expect(formatCivilDate('2027-01-01')).toBe('sexta-feira, 01/01')
  })
})
