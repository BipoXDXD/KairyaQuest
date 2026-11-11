// @vitest-environment node
/**
 * As datas relativas dos cenarios E2E (pendencia 207).
 *
 * Mora fora de `tests/e2e/` pelo mesmo motivo de `servers.test.ts`: la dentro
 * o Playwright a coletaria como cenario. Aqui o relogio e um `agora` fixo,
 * passado por parametro -- as datas literais deste arquivo nao vencem, porque
 * nada aqui as compara com o relogio real.
 */
import { describe, expect, it } from 'vitest'
import {
  campoDeHorario,
  diaCivil,
  diaEMes,
  diaRelativo,
  diasEntre,
  instanteRelativo,
  isoSaoPaulo,
  isoUtc,
  prazoNaTela,
  segundaDaSemana,
  somarDias,
} from '../e2e/datas'

const MS_POR_DIA = 86_400_000

describe('diaCivil', () => {
  it('e o dia em Sao Paulo, e nao em UTC: 02:59Z ainda e a vespera', () => {
    expect(diaCivil(new Date('2026-11-10T02:59:00Z'))).toBe('2026-11-09')
    expect(diaCivil(new Date('2026-11-10T03:00:00Z'))).toBe('2026-11-10')
  })
})

describe('somarDias e diaRelativo', () => {
  it('atravessam mes, ano e 29 de fevereiro', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(somarDias('2027-01-01', -1)).toBe('2026-12-31')
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29')
    expect(somarDias('2026-11-10', 0)).toBe('2026-11-10')
  })

  it('contam a partir de hoje em Sao Paulo', () => {
    const agora = new Date('2026-11-10T01:00:00Z')
    expect(diaRelativo(0, agora)).toBe('2026-11-09')
    expect(diaRelativo(1, agora)).toBe('2026-11-10')
    expect(diaRelativo(-6, agora)).toBe('2026-11-03')
  })
})

describe('segundaDaSemana', () => {
  // 2026-11-09 e segunda-feira; o plano semanal do backend sempre comeca numa.
  it.each([
    ['2026-11-09', '2026-11-09'],
    ['2026-11-10', '2026-11-09'],
    ['2026-11-14', '2026-11-09'],
    ['2026-11-15', '2026-11-09'],
    ['2026-11-16', '2026-11-16'],
  ])('a semana de %s comeca em %s', (dia, segunda) => {
    expect(segundaDaSemana(dia)).toBe(segunda)
  })

  it('atravessa a virada do ano', () => {
    expect(segundaDaSemana('2027-01-01')).toBe('2026-12-28')
  })
})

describe('diasEntre', () => {
  it('conta os dias civis de um dia ate outro', () => {
    expect(diasEntre('2026-11-09', '2026-11-09')).toBe(0)
    expect(diasEntre('2026-11-09', '2026-11-15')).toBe(6)
    expect(diasEntre('2026-12-28', '2027-01-01')).toBe(4)
    expect(diasEntre('2026-11-10', '2026-11-09')).toBe(-1)
  })
})

describe('instanteRelativo', () => {
  it('fixa a hora de Sao Paulo no dia relativo', () => {
    const agora = new Date('2026-11-10T15:00:00Z')
    const instante = instanteRelativo(60, 21, 0, agora)
    expect(isoSaoPaulo(instante)).toBe('2027-01-09T21:00:00-03:00')
    expect(isoUtc(instante)).toBe('2027-01-10T00:00:00Z')
    expect(Date.parse(isoSaoPaulo(instante))).toBe(Date.parse(isoUtc(instante)))
  })

  it('volta ao passado com dias negativos', () => {
    const agora = new Date('2026-11-10T15:00:00Z')
    expect(isoUtc(instanteRelativo(-70, 8, 0, agora))).toBe('2026-09-01T11:00:00Z')
  })

  // A janela do backend para prazo e (agora, agora + 365 d]: com 1 <= dias <=
  // 364, qualquer hora do dia cai dentro dela, seja qual for a hora de agora.
  it.each([
    '2026-11-10T00:00:00Z',
    '2026-11-10T02:59:59Z',
    '2026-11-10T03:00:00Z',
    '2026-11-10T23:59:59Z',
  ])('com agora = %s, 1 dia as 00:00 e futuro e 364 dias as 23:59 cabe em 365 d', (texto) => {
    const agora = new Date(texto)
    expect(instanteRelativo(1, 0, 0, agora).getTime()).toBeGreaterThan(agora.getTime())
    expect(instanteRelativo(364, 23, 59, agora).getTime()).toBeLessThanOrEqual(
      agora.getTime() + 365 * MS_POR_DIA,
    )
  })

  it('sem agora explicito, usa o relogio real: 1 dia a frente e futuro', () => {
    expect(instanteRelativo(1, 0).getTime()).toBeGreaterThan(Date.now())
  })
})

describe('as grafias do mesmo instante', () => {
  const instante = new Date('2027-04-10T15:00:00Z')

  it('isoUtc sem milissegundos, como a API devolve', () => {
    expect(isoUtc(instante)).toBe('2027-04-10T15:00:00Z')
  })

  it('isoSaoPaulo com o deslocamento -03:00', () => {
    expect(isoSaoPaulo(instante)).toBe('2027-04-10T12:00:00-03:00')
  })

  it('campoDeHorario e o valor do datetime-local em Sao Paulo', () => {
    expect(campoDeHorario(instante)).toBe('2027-04-10T12:00')
  })
})

describe('prazoNaTela', () => {
  const instante = new Date('2027-02-16T00:00:00Z')

  it('casa o texto em Sao Paulo com qualquer separador do ICU', () => {
    expect('15/02/2027 21:00').toMatch(prazoNaTela(instante))
    expect('15/02/2027, 21:00').toMatch(prazoNaTela(instante))
  })

  it('nao casa o mesmo instante escrito em outro fuso', () => {
    expect('16/02/2027 09:00').not.toMatch(prazoNaTela(instante))
    expect('16/02/2027 00:00').not.toMatch(prazoNaTela(instante))
  })
})

describe('diaEMes', () => {
  it('e o DD/MM do dia civil', () => {
    expect(diaEMes('2026-10-05')).toBe('05/10')
  })
})
