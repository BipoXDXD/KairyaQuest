import { describe, expect, it } from 'vitest'
import type { Availability } from '../../shared/types/mission'
import { translate } from '../../shared/i18n/catalog'
import { AVAILABILITY_DISPLAY } from './availability'

/**
 * Todos os valores do tipo `Availability`, escritos a mao: e a lista contra a
 * qual `AVAILABILITY_DISPLAY` e conferido como exaustivo. Se o tipo ganhar um
 * valor novo, esta lista fica desatualizada -- mas o `tsc` ja reprova
 * `AVAILABILITY_DISPLAY` antes disso (o `Record<Availability, ...>` exige
 * todo membro do tipo).
 */
const TODAS_AS_DISPONIBILIDADES: Availability[] = [
  'fora_do_plano',
  'bloqueada',
  'disponivel',
  'concluida',
  'perdida',
  'expirada',
]

describe('AVAILABILITY_DISPLAY', () => {
  it.each(TODAS_AS_DISPONIBILIDADES)(
    '%s tem rotulo em texto nos dois idiomas e um icone proprio',
    (availability) => {
      const { label, icon } = AVAILABILITY_DISPLAY[availability]
      expect(translate('pt-BR', label).trim()).not.toBe('')
      expect(translate('en', label).trim()).not.toBe('')
      expect(icon.length).toBeGreaterThan(0)
    },
  )

  it('e exaustivo: exatamente os valores do tipo Availability, e nenhum repetido', () => {
    expect(Object.keys(AVAILABILITY_DISPLAY).sort()).toEqual([...TODAS_AS_DISPONIBILIDADES].sort())
  })

  it('cada disponibilidade tem um icone diferente: o desenho nao repete', () => {
    const icones = TODAS_AS_DISPONIBILIDADES.map((d) => AVAILABILITY_DISPLAY[d].icon)
    expect(new Set(icones).size).toBe(icones.length)
  })
})
