import { describe, expect, it } from 'vitest'
import { formatDeadline, isoToSaoPauloCivil, saoPauloCivilToIso } from './deadline'

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

// A conversao roda com o processo em `Asia/Tokyo` (vite.config.ts): o fuso do
// navegador nunca e o de SP, e e isso que da dente aos testes abaixo -- uma
// implementacao que usasse o fuso do processo (`new Date(y, m, d, h, mi)`)
// reprovaria todos.
describe('saoPauloCivilToIso', () => {
  it.each([
    // Sem horario de verao (SP abandonou o horario de verao em 2019): -03:00.
    ['2026-10-02T18:00', '2026-10-02T21:00:00.000Z'],
    // Com horario de verao (dezembro de 2018): -02:00. Um deslocamento fixo de
    // -03:00 daria 15:00Z e reprovaria aqui.
    ['2018-12-01T12:00', '2018-12-01T14:00:00.000Z'],
    // Inverno de 2018, sem horario de verao: -03:00 no mesmo ano.
    ['2018-06-01T12:00', '2018-06-01T15:00:00.000Z'],
    // As duas bordas do inicio do horario de verao de 2018 (00:00 de
    // 04/11 vira 01:00): 23:59 ainda e -03:00 e 01:00 ja e -02:00.
    ['2018-11-03T23:59', '2018-11-04T02:59:00.000Z'],
    ['2018-11-04T01:00', '2018-11-04T03:00:00.000Z'],
    // A borda do fim do horario de verao de 2019 (00:00 de 17/02 volta para
    // 23:00 de 16/02): 22:59 de 16/02 ainda e -02:00 (22:59 + 2h = 00:59Z) e
    // 00:00 de 17/02 ja e -03:00.
    ['2019-02-16T22:59', '2019-02-17T00:59:00.000Z'],
    ['2019-02-17T00:00', '2019-02-17T03:00:00.000Z'],
    // Meia-noite e virada de ano: `hourCycle: h23`, nunca "24:00".
    ['2026-12-31T00:00', '2026-12-31T03:00:00.000Z'],
    ['2027-01-01T00:00', '2027-01-01T03:00:00.000Z'],
    // Ano bissexto.
    ['2028-02-29T09:15', '2028-02-29T12:15:00.000Z'],
  ])('%s em Sao Paulo e o instante %s', (civil, iso) => {
    expect(saoPauloCivilToIso(civil)).toBe(iso)
  })

  it('na hora repetida do fim do horario de verao, fica com a primeira ocorrencia', () => {
    // 23:30 de 16/02/2019 acontece duas vezes (-02:00 e depois -03:00). O
    // `datetime-local` nao tem como dizer qual; a primeira (a do horario de
    // verao, uma hora antes) e a decisao, e e a que a volta reconhece.
    expect(saoPauloCivilToIso('2019-02-16T23:30')).toBe('2019-02-17T01:30:00.000Z')
  })

  it.each([
    // A hora pulada no inicio do horario de verao de 2018: 00:00 a 00:59 de
    // 04/11 nao existiram no relogio de SP.
    ['2018-11-04T00:00'],
    ['2018-11-04T00:30'],
    ['2018-11-04T00:59'],
    // Data inexistente no calendario.
    ['2026-02-31T10:00'],
    ['2026-13-01T10:00'],
    ['2026-04-31T10:00'],
    // Hora e minuto fora da faixa.
    ['2026-10-02T24:00'],
    ['2026-10-02T18:60'],
    // 29/02 num ano que nao e bissexto.
    ['2027-02-29T10:00'],
    // Ano de menos de quatro digitos significativos: `Date.UTC` o trataria
    // como 19xx, e a volta desmente.
    ['0026-10-02T18:00'],
    // Nao e o formato do `datetime-local`.
    ['amanhã'],
    [''],
    ['2026-10-02'],
    ['2026-10-02 18:00'],
    ['2026-10-02T18:00:30'],
    ['2026-10-02T18:00-03:00'],
    ['2026-10-02T18:00Z'],
    [' 2026-10-02T18:00'],
  ])('recusa %j com null', (civil) => {
    expect(saoPauloCivilToIso(civil)).toBeNull()
  })
})

describe('isoToSaoPauloCivil', () => {
  it('escreve o instante como o datetime-local, no relogio de Sao Paulo', () => {
    expect(isoToSaoPauloCivil('2026-10-02T21:00:00Z')).toBe('2026-10-02T18:00')
  })

  it('corta os segundos, como o formatDeadline', () => {
    expect(isoToSaoPauloCivil('2026-10-02T21:00:59Z')).toBe('2026-10-02T18:00')
  })

  it('cai no dia anterior quando SP e UTC discordam da data', () => {
    expect(isoToSaoPauloCivil('2026-09-20T02:30:00Z')).toBe('2026-09-19T23:30')
  })

  it('le o instante com qualquer offset e usa o horario de verao historico', () => {
    expect(isoToSaoPauloCivil('2018-12-01T12:00:00+09:00')).toBe('2018-12-01T01:00')
  })

  it('escreve a meia-noite como 00:00, e nao 24:00', () => {
    expect(isoToSaoPauloCivil('2026-12-31T03:00:00Z')).toBe('2026-12-31T00:00')
  })
})

describe('ida e volta entre o instante e a hora civil de Sao Paulo', () => {
  it.each([
    '2026-01-01T03:00:00.000Z',
    '2026-02-15T14:30:00.000Z',
    '2026-03-31T02:59:00.000Z',
    '2026-06-15T15:00:00.000Z',
    '2026-09-29T20:45:00.000Z',
    '2026-10-02T21:00:00.000Z',
    '2026-11-08T12:00:00.000Z',
    '2026-12-31T02:59:00.000Z',
    '2018-11-04T02:59:00.000Z',
    '2018-11-04T03:00:00.000Z',
    // Ultimo minuto da primeira ocorrencia da hora repetida (23:59 em -02:00).
    '2019-02-17T01:59:00.000Z',
    '2019-02-17T03:00:00.000Z',
  ])('%s volta ao mesmo instante', (iso) => {
    const civil = isoToSaoPauloCivil(iso)

    expect(saoPauloCivilToIso(civil)).toBe(iso)
  })
})
