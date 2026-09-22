import { describe, expect, it } from 'vitest'
import { formatDeadline } from './deadline'

describe('formatDeadline', () => {
  it('apresenta em America/Sao_Paulo, e nao no fuso de quem le', () => {
    // Um instante em que SP e UTC caem em DIAS diferentes: 02:30 de 20/09 em
    // UTC sao 23:30 de 19/09 em SP. Com qualquer instante "de meio de dia" o
    // teste nao distinguiria os fusos pela data, so pela hora.
    //
    // O que da dente a este teste e o `TZ` do processo fixado em `Asia/Tokyo`
    // no `vite.config.ts`. Sem ele, na maquina do dono -- que esta em SP --, o
    // formatador SEM `timeZone` produziria o mesmo texto esperado, e o teste
    // passaria sem o conserto (medido). Em Tokyo o formatador sem `timeZone`
    // diz 20/09/2026 11:30, e o teste reprova.
    //
    // Regex e nao texto exato: o separador entre data e hora (virgula,
    // espaco) muda entre versoes do ICU, e o que importa aqui e dia e hora.
    expect(formatDeadline('2026-09-20T02:30:00Z')).toMatch(/19\/09\/2026.*23:30/)
  })

  it('le o instante com qualquer offset', () => {
    expect(formatDeadline('2027-02-15T21:00:00-03:00')).toMatch(/15\/02\/2027.*21:00/)
  })
})
