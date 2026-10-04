import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/client'
import { describeStartFailure } from './startFailure'

// Escrita por extenso, e nao importada do modulo: se a mensagem generica
// mudasse por engano, um teste que a importasse concordaria com ela.
const UNCONFIRMED = {
  message:
    'Não foi possível confirmar o início. Tentar de novo é seguro: a missão não será iniciada duas vezes.',
  recovery: 'retry',
}

const NOT_FOUND = {
  message: 'Esta missão não está mais disponível. Atualize para ver o estado atual.',
  recovery: 'refresh',
}

describe('describeStartFailure', () => {
  it.each([
    [
      'transicao_ilegal',
      {
        message: 'Esta missão já foi iniciada ou concluída. Atualize para ver o estado atual.',
        recovery: 'refresh',
      },
    ],
    [
      'missao_expirada',
      {
        message:
          'O prazo desta missão já terminou e ela não pode mais ser iniciada. Atualize para ver o estado atual.',
        recovery: 'refresh',
      },
    ],
    ['missao_nao_encontrada', NOT_FOUND],
    [
      'operacao_reutilizada',
      {
        message: 'Não foi possível registrar esta tentativa. Tente de novo.',
        recovery: 'retry-with-new-operation',
      },
    ],
  ])('traduz o code %s para a mensagem e a acao da tela', (code, esperado) => {
    expect(describeStartFailure(new ApiError('O servidor respondeu 409.', 409, code))).toEqual(
      esperado,
    )
  })

  it('nunca repete o detail nem a mensagem tecnica do erro', () => {
    const erro = new ApiError('PROSA-QUE-NAO-PODE-APARECER', 409, 'transicao_ilegal')

    expect(describeStartFailure(erro).message).not.toContain('PROSA-QUE-NAO-PODE-APARECER')
  })

  it('cai na mensagem generica quando o code e desconhecido', () => {
    expect(describeStartFailure(new ApiError('x', 409, 'codigo_futuro'))).toEqual(UNCONFIRMED)
  })

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'nao confunde o code %s com uma chave herdada do prototipo',
    (code) => {
      expect(describeStartFailure(new ApiError('x', 409, code))).toEqual(UNCONFIRMED)
    },
  )

  it('cai na mensagem generica quando nao ha code (rede, 5xx)', () => {
    expect(describeStartFailure(new ApiError('x', null, null))).toEqual(UNCONFIRMED)
    expect(describeStartFailure(new ApiError('x', 500, null))).toEqual(UNCONFIRMED)
  })

  it('um 404 SEM code (rota ausente, deploy desencontrado) manda atualizar', () => {
    expect(describeStartFailure(new ApiError('x', 404, null))).toEqual(NOT_FOUND)
  })

  it('um 404 com code DESCONHECIDO nao e tratado como 404 sem code', () => {
    expect(describeStartFailure(new ApiError('x', 404, 'codigo_futuro'))).toEqual(UNCONFIRMED)
  })

  it('cai na mensagem generica quando a falha nao e um ApiError', () => {
    expect(describeStartFailure(new SyntaxError('Unexpected token'))).toEqual(UNCONFIRMED)
  })
})
