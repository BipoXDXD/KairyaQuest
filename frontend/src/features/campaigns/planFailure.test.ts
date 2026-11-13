import { describe, expect, it } from 'vitest'
import { ApiError, ApiTimeoutError } from '../../shared/api/client'
import { CATALOGS, translate, type MessageKey } from '../../shared/i18n/catalog'
import { LOCALES } from '../../shared/i18n/locale'
import { PLAN_FAILURE_BY_CODE, describePlanFailure, type PlanFailure } from './planFailure'

function textOf(failure: PlanFailure, locale: (typeof LOCALES)[number]): string {
  return [failure.message, failure.recovery]
    .filter((key): key is MessageKey => key !== undefined)
    .map((key) => translate(locale, key))
    .join(' ')
}

describe('describePlanFailure', () => {
  it('plano_existente na semana atual recarrega a trilha', () => {
    const failure = describePlanFailure(new ApiError('x', 409, 'plano_existente'), 'current')
    expect(failure).toEqual({
      message: 'campaigns.form.failure.plano_existente',
      action: 'refresh',
    })
    expect(textOf(failure, 'pt-BR')).toBe(
      'O plano não foi criado. Esta semana já tem um plano. Veja o plano abaixo.',
    )
    expect(textOf(failure, 'en')).toBe(
      'Plan not created. This week already has a plan. See it below.',
    )
  })

  it('plano_existente na semana seguinte nao manda ver um plano que a trilha nao mostra', () => {
    const failure = describePlanFailure(new ApiError('x', 409, 'plano_existente'), 'next')
    expect(failure.action).toBe('none')
    expect(textOf(failure, 'pt-BR')).toBe(
      'O plano não foi criado. A próxima semana já tem um plano.',
    )
  })

  it('semana_encerrada sugere a seguinte', () => {
    const failure = describePlanFailure(new ApiError('x', 409, 'semana_encerrada'), 'current')
    expect(failure.action).toBe('choose-next')
    expect(textOf(failure, 'pt-BR')).toBe(
      'O plano não foi criado. Esta semana já acabou. Escolha a próxima semana.',
    )
    expect(textOf(failure, 'en')).toBe(
      'Plan not created. This week has already ended. Choose next week.',
    )
  })

  it('semana_distante nao tem acao', () => {
    const failure = describePlanFailure(new ApiError('x', 409, 'semana_distante'), 'next')
    expect(failure.action).toBe('none')
    expect(textOf(failure, 'pt-BR')).toBe(
      'O plano não foi criado. Só dá para planejar esta semana ou a próxima.',
    )
  })

  it('422 sem code e o texto generico de dado invalido', () => {
    const failure = describePlanFailure(new ApiError('x', 422, null), 'current')
    expect(failure.action).toBe('none')
    expect(textOf(failure, 'pt-BR')).toBe(
      'O plano não foi criado. Algum dado ficou fora do esperado. Revise os campos e tente de novo.',
    )
    expect(textOf(failure, 'en')).toBe(
      "Plan not created. Some details didn't match what's expected. Review the fields and try again.",
    )
  })

  it.each([
    ['rede', new ApiError('x', null, null, { kind: 'network' }), 'sem conexão.', 'no connection.'],
    [
      'prazo',
      new ApiTimeoutError(),
      'o servidor demorou demais para responder.',
      'the server took too long to answer.',
    ],
    [
      '503',
      new ApiError('x', 503, null),
      'o servidor não conseguiu atender o pedido.',
      "the server couldn't handle the request.",
    ],
    [
      'code de um backend mais novo',
      new ApiError('x', 409, 'codigo_novo'),
      'o servidor não conseguiu atender o pedido.',
      "the server couldn't handle the request.",
    ],
    [
      'erro que nao e ApiError',
      new TypeError('defeito'),
      'o servidor não conseguiu atender o pedido.',
      "the server couldn't handle the request.",
    ],
    [
      'toString nao e code',
      new ApiError('x', 409, 'toString'),
      'o servidor não conseguiu atender o pedido.',
      "the server couldn't handle the request.",
    ],
  ])('%s: abertura de transporte e fim que diz que os dados ficam', (_name, error, pt, en) => {
    const failure = describePlanFailure(error, 'current')
    expect(failure.action).toBe('none')
    expect(textOf(failure, 'pt-BR')).toBe(
      `O plano não foi criado: ${pt} Seus dados continuam aqui. Tente de novo.`,
    )
    expect(textOf(failure, 'en')).toBe(
      `Plan not created: ${en} Your entries are still here. Try again.`,
    )
  })
})

describe('PLAN_FAILURE_BY_CODE', () => {
  it('cada chave existe nos dois catalogos', () => {
    for (const failure of Object.values(PLAN_FAILURE_BY_CODE)) {
      for (const locale of LOCALES) {
        expect(CATALOGS[locale][failure.message]).toBeTruthy()
      }
    }
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

describe('describePlanFailure com 503 banco_ocupado', () => {
  it('diz que o servidor esta ocupado, nos dois idiomas, sem acao fora do formulario', () => {
    const failure = describePlanFailure(BUSY_ERROR, 'current')
    expect(failure).toEqual({ ...SERVER_BUSY, action: 'none' })
    expect(textOf(failure, 'pt-BR')).toBe(
      'O servidor está ocupado agora. Tente de novo em alguns segundos.',
    )
    expect(textOf(failure, 'en')).toBe('The server is busy right now. Try again in a few seconds.')
  })
})
