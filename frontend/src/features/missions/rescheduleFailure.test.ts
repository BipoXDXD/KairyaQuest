import { describe, expect, it } from 'vitest'
import { ApiError, ApiTimeoutError } from '../../shared/api/client'
import { ptBR } from '../../shared/i18n/messages/pt-BR'
import { describeRescheduleFailure, RESCHEDULE_FAILURE_BY_CODE } from './rescheduleFailure'

// Escrita por extenso, e nao importada do modulo (mesmo motivo de
// `startFailure.test.ts`).
const UNCONFIRMED = {
  message: 'missions.rescheduleFailure.unconfirmed.message',
  recovery: 'missions.rescheduleFailure.unconfirmed.recovery',
  action: 'retry',
}

const NOT_FOUND = {
  message: 'missions.failure.notAvailable',
  recovery: 'missions.failure.refresh',
  action: 'refresh',
}

const NOT_ACCEPTED = {
  message: 'missions.rescheduleFailure.notAccepted.message',
  recovery: 'missions.rescheduleFailure.notAccepted.recovery',
  action: 'edit',
}

describe('describeRescheduleFailure', () => {
  it.each([
    [
      'prazo_expirado',
      422,
      {
        message: 'missions.rescheduleFailure.deadlinePassed.message',
        recovery: 'missions.rescheduleFailure.deadlinePassed.recovery',
        action: 'edit',
      },
    ],
    [
      'prazo_fora_do_limite',
      422,
      {
        message: 'missions.rescheduleFailure.tooFar.message',
        recovery: 'missions.rescheduleFailure.tooFar.recovery',
        action: 'edit',
      },
    ],
    [
      'prazo_inalterado',
      409,
      {
        message: 'missions.rescheduleFailure.unchanged.message',
        recovery: 'missions.rescheduleFailure.unchanged.recovery',
        action: 'edit',
      },
    ],
    [
      'transicao_ilegal',
      409,
      {
        message: 'missions.rescheduleFailure.alreadyCompleted.message',
        recovery: 'missions.failure.refresh',
        action: 'refresh',
      },
    ],
    [
      'prazo_derivado',
      409,
      {
        message: 'missions.rescheduleFailure.derivedDeadline.message',
        recovery: 'missions.failure.refresh',
        action: 'refresh',
      },
    ],
    ['missao_nao_encontrada', 404, NOT_FOUND],
    [
      'operacao_reutilizada',
      409,
      {
        message: 'missions.failure.reusedOperation',
        recovery: 'missions.failure.tryAgain',
        action: 'retry-with-new-operation',
      },
    ],
  ])('traduz o code %s (status %i) para as chaves e a acao da tela', (code, status, esperado) => {
    expect(describeRescheduleFailure(new ApiError('x', status, code))).toEqual(esperado)
  })

  it.each(Object.entries(RESCHEDULE_FAILURE_BY_CODE))(
    'as chaves de %s existem no catalogo',
    (_code, failure) => {
      expect(Object.hasOwn(ptBR, failure.message)).toBe(true)
      expect(Object.hasOwn(ptBR, failure.recovery)).toBe(true)
    },
  )

  it('um 422 SEM code (corpo recusado pelo Pydantic) manda corrigir o formulario', () => {
    expect(describeRescheduleFailure(new ApiError('x', 422, null))).toEqual(NOT_ACCEPTED)
  })

  it('um 422 com code DESCONHECIDO tambem manda corrigir', () => {
    expect(describeRescheduleFailure(new ApiError('x', 422, 'codigo_futuro'))).toEqual(NOT_ACCEPTED)
  })

  it('um code conhecido vence o status 422', () => {
    expect(describeRescheduleFailure(new ApiError('x', 422, 'prazo_derivado')).action).toBe(
      'refresh',
    )
  })

  it('cai na falha generica, com a mesma chave, quando o code e desconhecido', () => {
    expect(describeRescheduleFailure(new ApiError('x', 409, 'codigo_futuro'))).toEqual(UNCONFIRMED)
  })

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'nao confunde o code %s com uma chave herdada do prototipo',
    (code) => {
      expect(describeRescheduleFailure(new ApiError('x', 409, code))).toEqual(UNCONFIRMED)
    },
  )

  it('a rede fora nomeia a acao e diz que nao conectou, e repetir e seguro', () => {
    const failure = describeRescheduleFailure(new ApiError('x', null, null))
    expect(failure).toEqual({
      ...UNCONFIRMED,
      message: 'missions.rescheduleFailure.unconfirmed.network',
    })
    expect(`${ptBR[failure.message]} ${ptBR[failure.recovery]}`).toBe(
      'Não foi possível reagendar a missão: sem conexão. Tentar de novo é seguro: nada será duplicado.',
    )
  })

  it('o prazo nomeia a acao e diz que a resposta demorou, e repetir e seguro', () => {
    const failure = describeRescheduleFailure(new ApiTimeoutError())
    expect(failure).toEqual({
      ...UNCONFIRMED,
      message: 'missions.rescheduleFailure.unconfirmed.timeout',
    })
    expect(`${ptBR[failure.message]} ${ptBR[failure.recovery]}`).toBe(
      'Não foi possível reagendar a missão: o servidor demorou demais. Tentar de novo é seguro: nada será duplicado.',
    )
  })

  it('um 5xx sem code continua no texto generico', () => {
    expect(describeRescheduleFailure(new ApiError('x', 500, null))).toEqual(UNCONFIRMED)
  })

  it('um 404 SEM code (rota ausente, deploy desencontrado) manda atualizar', () => {
    expect(describeRescheduleFailure(new ApiError('x', 404, null))).toEqual(NOT_FOUND)
  })

  it('um 404 com code DESCONHECIDO nao e tratado como 404 sem code', () => {
    expect(describeRescheduleFailure(new ApiError('x', 404, 'codigo_futuro'))).toEqual(UNCONFIRMED)
  })

  it('cai na falha generica quando a falha nao e um ApiError', () => {
    expect(describeRescheduleFailure(new SyntaxError('Unexpected token'))).toEqual(UNCONFIRMED)
  })
})

// 503 `banco_ocupado` (issue #176): o banco cortou uma espera e a transacao foi
// revertida. Chaves escritas por extenso, e nao importadas do modulo.
const BUSY_ERROR = new ApiError('O servidor respondeu 503.', 503, 'banco_ocupado', {
  retryAfterSeconds: 2,
})
const SERVER_BUSY = {
  message: 'shared.apiError.serverBusy.message',
  recovery: 'shared.apiError.serverBusy.recovery',
}

describe('describeRescheduleFailure com 503 banco_ocupado', () => {
  it('diz que o servidor esta ocupado e oferece tentar de novo', () => {
    expect(describeRescheduleFailure(BUSY_ERROR)).toEqual({ ...SERVER_BUSY, action: 'retry' })
  })
})
