import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/client'
import { describeEvaluationErrorCode, describeEvaluationFailure } from './evaluationFailure'

// Escrita por extenso, e nao importada do modulo: se a mensagem generica
// mudasse por engano, um teste que a importasse concordaria com ela.
const GENERIC = {
  message:
    'Não foi possível pedir a avaliação. Tentar de novo é seguro: o bônus nunca é concedido duas vezes.',
  recovery: 'retry',
}

describe('describeEvaluationFailure', () => {
  it.each([
    [
      'sem_evidencia',
      {
        message:
          'Esta missão não tem evidência para a Tifa avaliar. Atualize para ver o estado atual.',
        recovery: 'refresh',
      },
    ],
    [
      'avaliacao_em_andamento',
      {
        message: 'A Tifa já está avaliando esta entrega. Tente de novo em instantes.',
        recovery: 'retry',
      },
    ],
    [
      'provedor_nao_configurado',
      { message: 'A Tifa está fora do ar: falta configurar o provedor.', recovery: 'unavailable' },
    ],
    [
      'provedor_indisponivel',
      { message: 'A Tifa não conseguiu avaliar agora. Tente de novo.', recovery: 'retry' },
    ],
    [
      'tempo_esgotado',
      { message: 'A avaliação demorou demais. Tente de novo.', recovery: 'retry' },
    ],
    [
      'avaliacao_invalida',
      { message: 'A Tifa respondeu fora da rubrica. Tente de novo.', recovery: 'retry' },
    ],
    [
      'missao_nao_encontrada',
      {
        message: 'Esta missão não está mais disponível. Atualize para ver o estado atual.',
        recovery: 'refresh',
      },
    ],
  ])('traduz %s', (code, esperado) => {
    expect(describeEvaluationFailure(new ApiError('x', 409, code))).toEqual(esperado)
  })

  it('code desconhecido cai no generico', () => {
    expect(describeEvaluationFailure(new ApiError('x', 500, 'novo_code'))).toEqual(GENERIC)
  })

  it('erro sem code (5xx, corpo que nao e JSON) cai no generico', () => {
    expect(describeEvaluationFailure(new ApiError('x', 500, null))).toEqual(GENERIC)
    expect(describeEvaluationFailure(new ApiError('x', null, null))).toEqual(GENERIC)
  })

  it('um 422 nao e "tente de novo": a evidencia foi recusada, e repetir nao adianta', () => {
    expect(describeEvaluationFailure(new ApiError('x', 422, null))).toEqual({
      message: 'A evidência não foi aceita. Revise o texto e o link.',
      recovery: 'unavailable',
    })
  })

  it('um code conhecido vence o status 422', () => {
    expect(describeEvaluationFailure(new ApiError('x', 422, 'sem_evidencia')).recovery).toBe(
      'refresh',
    )
  })

  it('erro de rede que nao e ApiError cai no generico', () => {
    expect(describeEvaluationFailure(new TypeError('Failed to fetch'))).toEqual(GENERIC)
  })

  it('um code herdado do prototipo nao vira traducao', () => {
    expect(describeEvaluationFailure(new ApiError('x', 500, 'toString'))).toEqual(GENERIC)
  })
})

describe('describeEvaluationErrorCode', () => {
  // O `error_code` de uma avaliacao `falhou` vinda da API (a pagina recarregou)
  // passa pelo MESMO mapa do erro HTTP: a mensagem nao pode depender de a
  // pessoa ter visto a falha ao vivo ou depois.
  it('traduz o code gravado pelo mesmo mapa do erro HTTP', () => {
    expect(describeEvaluationErrorCode('tempo_esgotado')).toEqual({
      message: 'A avaliação demorou demais. Tente de novo.',
      recovery: 'retry',
    })
  })

  it('code desconhecido, nulo ou do prototipo cai no generico', () => {
    expect(describeEvaluationErrorCode('novo_code')).toEqual(GENERIC)
    expect(describeEvaluationErrorCode(null)).toEqual(GENERIC)
    expect(describeEvaluationErrorCode('constructor')).toEqual(GENERIC)
  })
})
