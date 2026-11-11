import { describe, expect, it } from 'vitest'

import { ApiError, ApiTimeoutError } from './client'
import { leadFor, transportFailureOf } from './transportFailure'

describe('transportFailureOf', () => {
  it.each([
    ['o prazo', new ApiTimeoutError(), 'timeout'],
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
  const lead = { action: 'concluir a missão', fallback: 'Outro.' }

  it('o prazo nomeia a acao e a demora do servidor', () => {
    expect(leadFor(new ApiTimeoutError(), lead)).toBe(
      'Não foi possível concluir a missão: o servidor demorou demais para responder.',
    )
  })

  it('a rede fora nomeia a acao e a falta de conexao', () => {
    expect(leadFor(new ApiError('x', null, null), lead)).toBe(
      'Não foi possível concluir a missão: sem conexão com o servidor.',
    )
  })

  it('o resto usa a abertura do chamador', () => {
    expect(leadFor(new ApiError('x', 500, null), lead)).toBe('Outro.')
  })
})
