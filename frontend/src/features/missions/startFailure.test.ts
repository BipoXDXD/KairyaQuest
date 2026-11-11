import { describe, expect, it } from 'vitest'
import { ApiError, ApiTimeoutError } from '../../shared/api/client'
import { ptBR } from '../../shared/i18n/messages/pt-BR'
import { describeStartFailure, START_FAILURE_BY_CODE } from './startFailure'

// Escrita por extenso, e nao importada do modulo: se a falha generica
// mudasse por engano, um teste que a importasse concordaria com ela.
const UNCONFIRMED = {
  message: 'missions.startFailure.unconfirmed.message',
  recovery: 'missions.startFailure.unconfirmed.recovery',
  action: 'retry',
}

const NOT_FOUND = {
  message: 'missions.failure.notAvailable',
  recovery: 'missions.failure.refresh',
  action: 'refresh',
}

describe('describeStartFailure', () => {
  it.each([
    [
      'transicao_ilegal',
      {
        message: 'missions.startFailure.alreadyStarted.message',
        recovery: 'missions.failure.refresh',
        action: 'refresh',
      },
    ],
    [
      'missao_expirada',
      {
        message: 'missions.startFailure.expired.message',
        recovery: 'missions.failure.refresh',
        action: 'refresh',
      },
    ],
    ['missao_nao_encontrada', NOT_FOUND],
    [
      'operacao_reutilizada',
      {
        message: 'missions.failure.reusedOperation',
        recovery: 'missions.failure.tryAgain',
        action: 'retry-with-new-operation',
      },
    ],
  ])('traduz o code %s para as chaves e a acao da tela', (code, esperado) => {
    expect(describeStartFailure(new ApiError('O servidor respondeu 409.', 409, code))).toEqual(
      esperado,
    )
  })

  it.each(Object.entries(START_FAILURE_BY_CODE))(
    'as chaves de %s existem no catalogo',
    (_code, failure) => {
      expect(Object.hasOwn(ptBR, failure.message)).toBe(true)
      expect(Object.hasOwn(ptBR, failure.recovery)).toBe(true)
    },
  )

  it('cai na falha generica quando o code e desconhecido', () => {
    expect(describeStartFailure(new ApiError('x', 409, 'codigo_futuro'))).toEqual(UNCONFIRMED)
  })

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'nao confunde o code %s com uma chave herdada do prototipo',
    (code) => {
      expect(describeStartFailure(new ApiError('x', 409, code))).toEqual(UNCONFIRMED)
    },
  )

  it('a rede fora diz que nao conectou, e repetir e seguro', () => {
    expect(describeStartFailure(new ApiError('x', null, null))).toEqual({
      ...UNCONFIRMED,
      message: 'shared.transportFailure.network',
    })
  })

  it('o prazo diz que a resposta demorou, e repetir e seguro', () => {
    expect(describeStartFailure(new ApiTimeoutError())).toEqual({
      ...UNCONFIRMED,
      message: 'shared.transportFailure.timeout',
    })
  })

  it('um 5xx sem code continua no texto generico', () => {
    expect(describeStartFailure(new ApiError('x', 500, null))).toEqual(UNCONFIRMED)
  })

  it('um 404 SEM code (rota ausente, deploy desencontrado) manda atualizar', () => {
    expect(describeStartFailure(new ApiError('x', 404, null))).toEqual(NOT_FOUND)
  })

  it('um 404 com code DESCONHECIDO nao e tratado como 404 sem code', () => {
    expect(describeStartFailure(new ApiError('x', 404, 'codigo_futuro'))).toEqual(UNCONFIRMED)
  })

  it('cai na falha generica quando a falha nao e um ApiError', () => {
    expect(describeStartFailure(new SyntaxError('Unexpected token'))).toEqual(UNCONFIRMED)
  })
})
