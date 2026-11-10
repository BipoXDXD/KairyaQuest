import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/client'
import { ptBR } from '../../shared/i18n/messages/pt-BR'
import { ACTION_FAILURE_BY_CODE, describeActionFailure, failedActionText } from './actionFailure'

const FAILED = {
  message: 'tutoring.actionFailure.failed.message',
  recovery: 'tutoring.actionFailure.askNewProposal',
}

const EXPIRED = {
  message: 'tutoring.actionFailure.expired.message',
  recovery: 'tutoring.actionFailure.askNewProposal',
}

const INVALIDATED = {
  message: 'tutoring.actionFailure.rescheduleInvalid.message',
  recovery: 'tutoring.actionFailure.askNewProposal',
}

const ALREADY_DECIDED = {
  message: 'tutoring.actionFailure.alreadyDecided.message',
  recovery: 'tutoring.actionFailure.refreshConversation',
  action: 'refresh',
}

const UNCONFIRMED_REJECT = {
  message: 'tutoring.actionFailure.unconfirmedReject.message',
  recovery: 'tutoring.actionFailure.unconfirmedReject.recovery',
  action: 'retry',
}

describe('describeActionFailure', () => {
  it.each([
    [
      'operacao_reutilizada',
      409,
      {
        message: 'tutoring.actionFailure.reusedOperation.message',
        recovery: 'tutoring.actionFailure.reusedOperation.recovery',
        action: 'retry-with-new-operation',
      },
    ],
    ['transicao_ilegal', 409, ALREADY_DECIDED],
    [
      'acao_nao_encontrada',
      404,
      {
        message: 'tutoring.actionFailure.notFound.message',
        recovery: 'tutoring.actionFailure.refreshConversation',
        action: 'refresh',
      },
    ],
    ['prazo_expirado', 422, { ...EXPIRED, action: 'expired' }],
  ])('traduz %s', (code, status, esperado) => {
    for (const attempted of ['confirm', 'reject'] as const) {
      for (const kind of ['create_mission', 'reschedule_mission'] as const) {
        expect(describeActionFailure(new ApiError('x', status, code), attempted, kind)).toEqual(
          esperado,
        )
      }
    }
  })

  it.each(Object.entries(ACTION_FAILURE_BY_CODE))(
    'as chaves de %s existem no catalogo',
    (_code, failure) => {
      expect(Object.hasOwn(ptBR, failure.message)).toBe(true)
      expect(Object.hasOwn(ptBR, failure.recovery)).toBe(true)
    },
  )

  it.each([
    ['rede fora', new ApiError('x', null, null)],
    ['422 sem code', new ApiError('x', 422, null)],
    ['code desconhecido', new ApiError('x', 409, 'code_novo')],
    ['herdado do prototipo', new ApiError('x', 409, 'hasOwnProperty')],
    ['erro que nao e ApiError', new Error('x')],
  ])('%s: confirmar diz que repetir nao cria duas missoes', (_caso, error) => {
    expect(describeActionFailure(error, 'confirm', 'create_mission')).toEqual({
      message: 'tutoring.actionFailure.unconfirmedCreate.message',
      recovery: 'tutoring.actionFailure.unconfirmedCreate.recovery',
      action: 'retry',
    })
  })

  it('recusar tem o proprio texto generico', () => {
    expect(
      describeActionFailure(new ApiError('x', null, null), 'reject', 'create_mission'),
    ).toEqual(UNCONFIRMED_REJECT)
  })

  it('reagendamento_invalido: a acao foi gravada falhou, e o cartao passa a esse estado', () => {
    for (const attempted of ['confirm', 'reject'] as const) {
      expect(
        describeActionFailure(
          new ApiError('x', 409, 'reagendamento_invalido'),
          attempted,
          'reschedule_mission',
        ),
      ).toEqual({ ...INVALIDATED, action: 'invalidated' })
    }
  })

  it('confirmar um reagendamento sem resposta diz que o prazo nao muda duas vezes', () => {
    expect(
      describeActionFailure(new ApiError('x', null, null), 'confirm', 'reschedule_mission'),
    ).toEqual({
      message: 'tutoring.actionFailure.unconfirmedReschedule.message',
      recovery: 'tutoring.actionFailure.unconfirmedReschedule.recovery',
      action: 'retry',
    })
  })

  it('recusar um reagendamento tem o mesmo texto generico da criacao', () => {
    expect(
      describeActionFailure(new ApiError('x', null, null), 'reject', 'reschedule_mission'),
    ).toEqual(UNCONFIRMED_REJECT)
  })

  it('o code conhecido vale para os dois tipos de acao', () => {
    expect(
      describeActionFailure(
        new ApiError('x', 409, 'transicao_ilegal'),
        'confirm',
        'reschedule_mission',
      ),
    ).toEqual(ALREADY_DECIDED)
  })
})

describe('failedActionText', () => {
  it.each([
    ['prazo_expirado', EXPIRED],
    ['reagendamento_invalido', INVALIDATED],
    ['proposta_invalida', FAILED],
    // Um code que existe no mapa mas nao e gravado na acao cai no generico.
    ['transicao_ilegal', FAILED],
    ['toString', FAILED],
    [null, FAILED],
  ])('a acao gravada falhou com %s', (code, text) => {
    expect(failedActionText(code)).toEqual(text)
  })

  it('o texto generico tem as chaves no catalogo', () => {
    expect(Object.hasOwn(ptBR, FAILED.message)).toBe(true)
    expect(Object.hasOwn(ptBR, FAILED.recovery)).toBe(true)
  })
})
