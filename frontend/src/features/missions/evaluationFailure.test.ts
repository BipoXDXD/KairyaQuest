import { describe, expect, it } from 'vitest'
import { ApiError, ApiTimeoutError } from '../../shared/api/client'
import { ptBR } from '../../shared/i18n/messages/pt-BR'
import {
  describeEvaluationErrorCode,
  describeEvaluationFailure,
  EVALUATION_FAILURE_BY_CODE,
} from './evaluationFailure'

// Escrita por extenso, e nao importada do modulo: se a falha generica
// mudasse por engano, um teste que a importasse concordaria com ela.
const GENERIC = {
  message: 'missions.evaluationFailure.generic.message',
  recovery: 'missions.evaluationFailure.generic.recovery',
  action: 'retry',
}

const NOT_FOUND = {
  message: 'missions.failure.notAvailable',
  recovery: 'missions.failure.refresh',
  action: 'refresh',
}

const TIMEOUT = {
  message: 'missions.evaluationFailure.timeout.message',
  recovery: 'missions.failure.tryAgain',
  action: 'retry',
}

describe('describeEvaluationFailure', () => {
  it.each([
    [
      'sem_evidencia',
      {
        message: 'missions.evaluationFailure.noEvidence.message',
        recovery: 'missions.failure.refresh',
        action: 'refresh',
      },
    ],
    [
      'avaliacao_em_andamento',
      {
        message: 'missions.evaluationFailure.inProgress.message',
        recovery: 'missions.evaluationFailure.inProgress.recovery',
        action: 'retry',
      },
    ],
    [
      'provedor_nao_configurado',
      {
        message: 'missions.evaluationFailure.providerNotConfigured.message',
        recovery: 'missions.evaluationFailure.providerNotConfigured.recovery',
        action: 'unavailable',
      },
    ],
    [
      'provedor_indisponivel',
      {
        message: 'missions.evaluationFailure.providerUnavailable.message',
        recovery: 'missions.failure.tryAgain',
        action: 'retry',
      },
    ],
    ['tempo_esgotado', TIMEOUT],
    [
      'avaliacao_invalida',
      {
        message: 'missions.evaluationFailure.invalidEvaluation.message',
        recovery: 'missions.failure.tryAgain',
        action: 'retry',
      },
    ],
    ['missao_nao_encontrada', NOT_FOUND],
  ])('traduz %s', (code, esperado) => {
    expect(describeEvaluationFailure(new ApiError('x', 409, code))).toEqual(esperado)
  })

  it.each(Object.entries(EVALUATION_FAILURE_BY_CODE))(
    'as chaves de %s existem no catalogo',
    (_code, failure) => {
      expect(Object.hasOwn(ptBR, failure.message)).toBe(true)
      expect(Object.hasOwn(ptBR, failure.recovery)).toBe(true)
    },
  )

  it('code desconhecido cai no generico', () => {
    expect(describeEvaluationFailure(new ApiError('x', 500, 'novo_code'))).toEqual(GENERIC)
  })

  it('erro sem code (5xx, corpo que nao e JSON) cai no generico', () => {
    expect(describeEvaluationFailure(new ApiError('x', 500, null))).toEqual(GENERIC)
  })

  it('a rede fora diz que nao conectou, e repetir e seguro', () => {
    expect(describeEvaluationFailure(new ApiError('x', null, null))).toEqual({
      message: 'shared.transport.network.lead',
      recovery: 'missions.evaluationFailure.generic.recovery',
      action: 'retry',
    })
  })

  it('o prazo diz que a resposta demorou, e repetir e seguro', () => {
    expect(describeEvaluationFailure(new ApiTimeoutError())).toEqual({
      message: 'shared.transport.timeout.lead',
      recovery: 'missions.evaluationFailure.generic.recovery',
      action: 'retry',
    })
  })

  it('um 404 SEM code (rota ausente, deploy desencontrado) manda atualizar, nao "tente de novo"', () => {
    expect(describeEvaluationFailure(new ApiError('x', 404, null))).toEqual(NOT_FOUND)
  })

  it('um 404 com code DESCONHECIDO nao e tratado como 404 sem code', () => {
    expect(describeEvaluationFailure(new ApiError('x', 404, 'codigo_futuro'))).toEqual(GENERIC)
  })

  it('um 422 e o id do caminho fora da faixa: missao que nao existe, entao manda atualizar', () => {
    // `POST /evaluation` nao tem corpo: o unico 422 possivel e o do id.
    expect(describeEvaluationFailure(new ApiError('x', 422, null))).toEqual(NOT_FOUND)
  })

  it('um 422 com code DESCONHECIDO tambem manda atualizar (nao "tente de novo")', () => {
    expect(describeEvaluationFailure(new ApiError('x', 422, 'codigo_futuro')).action).toBe(
      'refresh',
    )
  })

  it('um code conhecido vence o status 422', () => {
    expect(describeEvaluationFailure(new ApiError('x', 422, 'sem_evidencia')).action).toBe(
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
  // passa pelo MESMO mapa do erro HTTP: o texto nao pode depender de a
  // pessoa ter visto a falha ao vivo ou depois.
  it('traduz o code gravado pelo mesmo mapa do erro HTTP', () => {
    expect(describeEvaluationErrorCode('tempo_esgotado')).toEqual(TIMEOUT)
  })

  it('code desconhecido, nulo ou do prototipo cai no generico', () => {
    expect(describeEvaluationErrorCode('novo_code')).toEqual(GENERIC)
    expect(describeEvaluationErrorCode(null)).toEqual(GENERIC)
    expect(describeEvaluationErrorCode('constructor')).toEqual(GENERIC)
  })
})
