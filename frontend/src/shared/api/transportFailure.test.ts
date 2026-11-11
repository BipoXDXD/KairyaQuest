import { describe, expect, it } from 'vitest'

import { ApiError, ApiTimeoutError } from './client'
import { translate } from '../i18n/catalog'
import { leadFor, transportFailureOf } from './transportFailure'

describe('transportFailureOf', () => {
  it.each([
    ['o prazo', new ApiTimeoutError(), 'timeout'],
    [
      'o kind timeout, sem o subtipo',
      new ApiError('x', null, null, { kind: 'timeout' }),
      'timeout',
    ],
    ['a rede fora', new ApiError('x', null, null), 'network'],
    ['um status recebido', new ApiError('x', 409, null), null],
    ['um 5xx', new ApiError('x', 503, null), null],
    // Um TypeError cru (por exemplo de JSON.parse) nao e rede: so o cliente
    // sabe que nao houve resposta, e ele sempre o diz com um ApiError.
    ['um erro que nao e ApiError', new TypeError('Failed to fetch'), null],
    ['um valor que nem e erro', 'falhou', null],
  ])('%s', (_caso, erro, esperado) => {
    expect(transportFailureOf(erro)).toBe(esperado)
  })
})

describe('leadFor', () => {
  const lead = {
    fallback: 'shared.apiError.http.message',
    timeout: 'missions.completionFailure.unconfirmed.timeout',
    network: 'missions.completionFailure.unconfirmed.network',
  } as const

  it('o prazo abre com a acao e a demora do servidor', () => {
    expect(leadFor(new ApiTimeoutError(), lead)).toBe(lead.timeout)
  })

  it('a rede fora abre com a acao e a falta de conexao', () => {
    expect(leadFor(new ApiError('x', null, null), lead)).toBe(lead.network)
  })

  it('o resto usa a abertura do chamador', () => {
    expect(leadFor(new ApiError('x', 500, null), lead)).toBe(lead.fallback)
  })
})

describe('o texto das aberturas de transporte', () => {
  it.each([
    [
      'missions.completionFailure.unconfirmed.timeout',
      'Não foi possível concluir a missão: o servidor demorou demais para responder.',
    ],
    [
      'missions.completionFailure.unconfirmed.network',
      'Não foi possível concluir a missão: sem conexão com o servidor.',
    ],
  ] as const)('%s em pt-BR', (key, esperado) => {
    expect(translate('pt-BR', key)).toBe(esperado)
  })
})
