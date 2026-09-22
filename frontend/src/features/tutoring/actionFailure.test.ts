import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/client'
import { describeActionFailure } from './actionFailure'

describe('describeActionFailure', () => {
  it.each([
    [
      'operacao_reutilizada',
      409,
      'retry-with-new-operation',
      'Não foi possível registrar esta tentativa. Tente de novo.',
    ],
    [
      'transicao_ilegal',
      409,
      'refresh',
      'Esta proposta já foi decidida. Atualize a conversa para ver o estado atual.',
    ],
    [
      'acao_nao_encontrada',
      404,
      'refresh',
      'Esta proposta não existe mais. Atualize a conversa para ver o estado atual.',
    ],
    [
      'prazo_expirado',
      422,
      'expired',
      'O prazo desta proposta já passou. Peça à Tifa uma nova proposta.',
    ],
  ])('traduz %s', (code, status, recovery, message) => {
    for (const attempted of ['confirm', 'reject'] as const) {
      expect(describeActionFailure(new ApiError('x', status, code), attempted)).toEqual({
        message,
        recovery,
      })
    }
  })

  it.each([
    ['rede fora', new ApiError('x', null, null)],
    ['422 sem code', new ApiError('x', 422, null)],
    ['code desconhecido', new ApiError('x', 409, 'code_novo')],
    ['herdado do prototipo', new ApiError('x', 409, 'hasOwnProperty')],
    ['erro que nao e ApiError', new Error('x')],
  ])('%s: confirmar diz que repetir nao cria duas missoes', (_caso, error) => {
    expect(describeActionFailure(error, 'confirm')).toEqual({
      message:
        'Não foi possível confirmar a missão. Tentar de novo é seguro: a missão não será criada duas vezes.',
      recovery: 'retry',
    })
  })

  it('recusar tem o proprio texto generico', () => {
    expect(describeActionFailure(new ApiError('x', null, null), 'reject')).toEqual({
      message: 'Não foi possível recusar a proposta. Tentar de novo é seguro.',
      recovery: 'retry',
    })
  })
})
