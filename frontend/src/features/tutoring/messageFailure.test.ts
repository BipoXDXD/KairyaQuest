import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/client'
import { en } from '../../shared/i18n/messages/en'
import { ptBR } from '../../shared/i18n/messages/pt-BR'
import {
  describePreStreamFailure,
  describeStreamErrorEvent,
  describeStreamFailure,
  PRE_STREAM_FAILURE_BY_CODE,
  STREAM_FAILURE_BY_CODE,
  UNKNOWN_RESULT,
  UNRECOGNIZED_FAILURE,
} from './messageFailure'

describe('describePreStreamFailure', () => {
  it.each([
    [
      'provedor_nao_configurado',
      503,
      {
        message: 'tutoring.messageFailure.providerNotConfigured.message',
        recovery: 'tutoring.messageFailure.providerNotConfigured.recovery',
        action: 'unavailable',
      },
    ],
    [
      'mensagem_em_andamento',
      409,
      {
        message: 'tutoring.messageFailure.inProgress.message',
        recovery: 'tutoring.messageFailure.inProgress.recovery',
        action: 'retry',
      },
    ],
    [
      'operacao_reutilizada',
      409,
      {
        message: 'tutoring.messageFailure.reusedOperation.message',
        recovery: 'tutoring.messageFailure.tryAgain',
        action: 'retry-with-new-id',
      },
    ],
  ])('traduz %s', (code, status, esperado) => {
    expect(describePreStreamFailure(new ApiError('x', status, code))).toEqual(esperado)
  })

  it('o teto diario com Retry-After diz que a Kairya volta a meia-noite', () => {
    const error = new ApiError('x', 429, 'limite_diario_da_tutoria', { retryAfterSeconds: 3600 })

    expect(describePreStreamFailure(error)).toEqual({
      message: 'tutoring.messageFailure.dailyLimit.message',
      recovery: 'tutoring.messageFailure.dailyLimit.backAtMidnight',
      action: 'daily-limit',
    })
  })

  it('o teto diario sem Retry-After pede para voltar amanha', () => {
    const error = new ApiError('x', 429, 'limite_diario_da_tutoria')

    expect(describePreStreamFailure(error)).toEqual({
      message: 'tutoring.messageFailure.dailyLimit.message',
      recovery: 'tutoring.messageFailure.dailyLimit.backTomorrow',
      action: 'daily-limit',
    })
  })

  it.each(Object.entries(PRE_STREAM_FAILURE_BY_CODE))(
    'as chaves de %s existem no catalogo',
    (_code, failure) => {
      expect(Object.hasOwn(ptBR, failure.message)).toBe(true)
      expect(Object.hasOwn(ptBR, failure.recovery)).toBe(true)
    },
  )

  it('o 422 sem code pede para editar, e nao para repetir', () => {
    // Repetir o mesmo corpo daria o mesmo 422; so mudar o texto resolve.
    expect(describePreStreamFailure(new ApiError('x', 422, null))).toEqual({
      message: 'tutoring.messageFailure.rejectedBody.message',
      recovery: 'tutoring.messageFailure.rejectedBody.recovery',
      action: 'edit',
    })
  })

  it.each([
    ['rede fora', new ApiError('x', null, null)],
    ['500 sem code', new ApiError('x', 500, null)],
    ['code de um backend mais novo', new ApiError('x', 409, 'code_novo')],
    ['422 com code desconhecido', new ApiError('x', 422, 'code_novo')],
    ['erro que nao e ApiError', new TypeError('defeito nosso')],
  ])('%s cai no resultado desconhecido', (_caso, error) => {
    expect(describePreStreamFailure(error)).toBe(UNKNOWN_RESULT)
  })

  it('nao le a propriedade herdada do prototipo como traducao', () => {
    // `'toString' in MAPA` e true; `Object.hasOwn(MAPA, 'toString')` e false.
    expect(describePreStreamFailure(new ApiError('x', 409, 'toString'))).toBe(UNKNOWN_RESULT)
  })

  it('o resultado desconhecido diz que repetir e seguro', () => {
    expect(UNKNOWN_RESULT).toEqual({
      message: 'tutoring.messageFailure.unknownResult.message',
      recovery: 'tutoring.messageFailure.safeRetry',
      action: 'retry',
    })
  })
})

describe('describeStreamFailure', () => {
  it.each([
    ['provedor_indisponivel', 'tutoring.messageFailure.providerUnavailable.message'],
    ['tempo_esgotado', 'tutoring.messageFailure.timeout.message'],
  ])('traduz %s, sempre com reenvio pelo mesmo id', (code, message) => {
    expect(describeStreamFailure(code)).toEqual({
      message,
      recovery: 'tutoring.messageFailure.safeRetry',
      action: 'retry',
    })
  })

  it('a proposta invalida sugere pedir de outro jeito', () => {
    expect(describeStreamFailure('proposta_invalida')).toEqual({
      message: 'tutoring.messageFailure.invalidProposal.message',
      recovery: 'tutoring.messageFailure.invalidProposal.recovery',
      action: 'retry',
    })
  })

  it('a recusa orienta a perguntar de outro jeito e descarta o parcial (pendencia 120)', () => {
    // A orientacao da API: o texto que veio antes da recusa nao e resposta.
    expect(describeStreamFailure('resposta_recusada')).toEqual({
      message: 'tutoring.messageFailure.refused.message',
      recovery: 'tutoring.messageFailure.refused.recovery',
      action: 'retry',
      discardsPartial: true,
    })
  })

  it.each(Object.entries(STREAM_FAILURE_BY_CODE))(
    'as chaves de %s existem no catalogo',
    (_code, failure) => {
      expect(Object.hasOwn(ptBR, failure.message)).toBe(true)
      expect(Object.hasOwn(ptBR, failure.recovery)).toBe(true)
    },
  )

  // O evento `error` so chega com a falha JA gravada pelo backend: um code que
  // a tela nao conhece e falha de verdade, nao "resultado desconhecido".
  it.each(['code_novo', 'constructor'])(
    '%s cai na falha generica, nao no resultado desconhecido',
    (code) => {
      const failure = describeStreamFailure(code)
      expect(failure).toBe(UNRECOGNIZED_FAILURE)
      expect(failure).not.toBe(UNKNOWN_RESULT)
    },
  )

  it('a falha generica diz que a pergunta nao foi respondida e permite reenviar pelo mesmo id', () => {
    expect(UNRECOGNIZED_FAILURE).toEqual({
      message: 'tutoring.messageFailure.unrecognizedFailure.message',
      recovery: 'tutoring.messageFailure.safeRetry',
      action: 'retry',
    })
    // O que a pessoa le: o texto resolvido, nos dois idiomas, mais o recovery
    // compartilhado que garante que reenviar nao duplica a pergunta.
    expect(ptBR[UNRECOGNIZED_FAILURE.message as keyof typeof ptBR]).toBe(
      'A Kairya não conseguiu responder a esta pergunta.',
    )
    expect(en[UNRECOGNIZED_FAILURE.message as keyof typeof en]).toBe(
      "Kairya couldn't answer this question. The reply wasn't completed.",
    )
    expect(ptBR[UNRECOGNIZED_FAILURE.recovery as keyof typeof ptBR]).toBe(
      'Tentar de novo é seguro: a pergunta não será duplicada.',
    )
    expect(en[UNRECOGNIZED_FAILURE.recovery as keyof typeof en]).toBe(
      "Retrying is safe: your question won't repeat.",
    )
  })
})

describe('describeStreamErrorEvent', () => {
  it('um code conhecido usa o mapa', () => {
    expect(describeStreamErrorEvent({ code: 'tempo_esgotado' })).toBe(
      STREAM_FAILURE_BY_CODE.tempo_esgotado,
    )
  })

  it.each([
    ['um code desconhecido', { code: 'code_novo' }],
    ['um objeto sem code', {}],
    ['um code nulo', { code: null }],
    ['um code que nao e texto', { code: 5 }],
    ['um corpo nulo', null],
    ['um corpo ausente', undefined],
    ['um corpo que nao e objeto', 'tempo_esgotado'],
  ])('%s cai na falha generica', (_caso, data) => {
    expect(describeStreamErrorEvent(data)).toBe(UNRECOGNIZED_FAILURE)
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

describe('banco_ocupado na tutoria (issues #176 e #177)', () => {
  it('antes do stream: nada foi gravado, e repetir usa o mesmo id', () => {
    expect(describePreStreamFailure(BUSY_ERROR)).toEqual({ ...SERVER_BUSY, action: 'retry' })
  })

  it('no evento error do stream: a falha foi gravada, e repetir usa o mesmo id', () => {
    expect(describeStreamErrorEvent({ code: 'banco_ocupado' })).toEqual({
      ...SERVER_BUSY,
      action: 'retry',
    })
  })
})
