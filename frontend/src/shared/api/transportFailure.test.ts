import { describe, expect, it } from 'vitest'

import { ApiError, ApiTimeoutError } from './client'
import { leadFor, transportFailureOf } from './transportFailure'

const DEMORA = 'A resposta demorou mais que o esperado.'
const REDE = 'Não foi possível conectar.'

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
  it('o prazo abre com a demora', () => {
    expect(leadFor(new ApiTimeoutError(), 'Outro.')).toBe(DEMORA)
  })

  it('a rede fora abre com a conexao', () => {
    expect(leadFor(new ApiError('x', null, null), 'Outro.')).toBe(REDE)
  })

  it('o resto usa a abertura do chamador', () => {
    expect(leadFor(new ApiError('x', 500, null), 'Outro.')).toBe('Outro.')
  })
})
