import { describe, expect, it } from 'vitest'
import { ApiError, type ApiErrorKind } from '../api/client'
import { apiErrorText, dailyLimitText, loadFailureFor, serverBusyText } from './failureText'
import { en } from './messages/en'
import { ptBR } from './messages/pt-BR'

/** O texto da 1.3 (`messageFailure.ts` antes deste PR), copiado sem reescrita. */
const TEXTO_DA_1_3 = 'Você chegou ao limite de conversas de hoje. A Kairya volta à meia-noite.'

describe('apiErrorText', () => {
  it.each([
    ['network', 'shared.apiError.network.message', 'shared.apiError.network.recovery'],
    ['timeout', 'shared.apiError.timeout.message', 'shared.apiError.timeout.recovery'],
    ['http', 'shared.apiError.http.message', 'shared.apiError.http.recovery'],
    ['format', 'shared.apiError.format.message', 'shared.apiError.format.recovery'],
    ['interrupted', 'shared.apiError.interrupted.message', 'shared.apiError.interrupted.recovery'],
  ] as const)('%s', (kind: ApiErrorKind, message, recovery) => {
    expect(apiErrorText(new ApiError('x', 500, null, { kind }))).toEqual({ message, recovery })
  })

  it('nao usa a message de depuracao do erro', () => {
    const text = apiErrorText(new ApiError('O servidor respondeu 500.', 500, null))
    expect(Object.values(text)).not.toContain('O servidor respondeu 500.')
  })
})

describe('dailyLimitText', () => {
  it('com Retry-After, a Kairya volta a meia-noite', () => {
    const error = new ApiError('x', 429, 'limite_diario_da_tutoria', { retryAfterSeconds: 3600 })

    expect(dailyLimitText(error)).toEqual({
      message: 'tutoring.messageFailure.dailyLimit.message',
      recovery: 'tutoring.messageFailure.dailyLimit.backAtMidnight',
    })
  })

  it('com Retry-After 0 continua sendo a meia-noite (0 nao e ausencia)', () => {
    const error = new ApiError('x', 429, 'limite_diario_da_tutoria', { retryAfterSeconds: 0 })

    expect(dailyLimitText(error).recovery).toBe('tutoring.messageFailure.dailyLimit.backAtMidnight')
  })

  it('sem Retry-After, a variante pede para voltar amanha', () => {
    const error = new ApiError('x', 429, 'limite_diario_da_tutoria', { retryAfterSeconds: null })

    expect(dailyLimitText(error)).toEqual({
      message: 'tutoring.messageFailure.dailyLimit.message',
      recovery: 'tutoring.messageFailure.dailyLimit.backTomorrow',
    })
  })

  it('o PT da meia-noite e o texto da 1.3, sem reescrita', () => {
    const { message, recovery } = dailyLimitText(
      new ApiError('x', 429, 'limite_diario_da_tutoria', { retryAfterSeconds: 60 }),
    )

    expect(ptBR[recovery]).toBe('A Kairya volta à meia-noite.')
    expect(`${ptBR[message]} ${ptBR[recovery]}`).toBe(TEXTO_DA_1_3)
  })

  it('o EN da meia-noite diz o fuso de Brasilia', () => {
    expect(en['tutoring.messageFailure.dailyLimit.backAtMidnight']).toBe(
      'Kairya is back at midnight (Brasília time).',
    )
  })
})

describe('loadFailureFor', () => {
  it('um ApiError vira o texto do catalogo pelo kind, sem a message de depuracao', () => {
    const error = new ApiError('O servidor respondeu 503.', 503, null)

    expect(loadFailureFor(error)).toEqual({
      kind: 'api',
      text: { message: 'shared.apiError.http.message', recovery: 'shared.apiError.http.recovery' },
    })
  })

  it('o que nao e ApiError e defeito nosso, sem texto: quem traduz e a tela', () => {
    expect(loadFailureFor(new SyntaxError('Unexpected token'))).toEqual({ kind: 'unexpected' })
  })
})

describe('banco_ocupado (503, issue #176)', () => {
  const busy = new ApiError('O servidor respondeu 503.', 503, 'banco_ocupado', {
    retryAfterSeconds: 2,
  })
  const SERVER_BUSY = {
    message: 'shared.apiError.serverBusy.message',
    recovery: 'shared.apiError.serverBusy.recovery',
  }

  it('apiErrorText decide pelo code antes do kind', () => {
    expect(apiErrorText(busy)).toEqual(SERVER_BUSY)
  })

  it('loadFailureFor de uma carga de tela usa o mesmo texto', () => {
    expect(loadFailureFor(busy)).toEqual({ kind: 'api', text: SERVER_BUSY })
  })

  it('serverBusyText reconhece so o banco_ocupado', () => {
    expect(serverBusyText(busy)).toEqual(SERVER_BUSY)
    expect(serverBusyText(new ApiError('x', 503, null))).toBeNull()
    expect(serverBusyText(new ApiError('x', 409, 'operacao_reutilizada'))).toBeNull()
    expect(serverBusyText(new Error('banco_ocupado'))).toBeNull()
  })

  it.each([
    [ptBR, 'O servidor está ocupado agora.', 'Tente de novo em alguns segundos.'],
    [en, 'The server is busy right now.', 'Try again in a few seconds.'],
  ])('o texto e transitorio e nao culpa a pessoa', (catalog, message, recovery) => {
    expect(catalog['shared.apiError.serverBusy.message']).toBe(message)
    expect(catalog['shared.apiError.serverBusy.recovery']).toBe(recovery)
  })
})
