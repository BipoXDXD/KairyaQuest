import { describe, expect, it } from 'vitest'
import { ApiError, ApiTimeoutError } from '../../shared/api/client'
import { ptBR } from '../../shared/i18n/messages/pt-BR'
import { COMPLETION_FAILURE_BY_CODE, describeCompletionFailure } from './completionFailure'

// Escrita por extenso, e nao importada do modulo: se a falha generica
// mudasse por engano, um teste que a importasse concordaria com ela.
const UNCONFIRMED = {
  message: 'missions.completionFailure.unconfirmed.message',
  recovery: 'missions.completionFailure.unconfirmed.recovery',
  action: 'retry',
}

const NOT_FOUND = {
  message: 'missions.completionFailure.notFound.message',
  recovery: 'missions.completionFailure.notFound.recovery',
  action: 'refresh',
}

describe('describeCompletionFailure', () => {
  it.each([
    ['missao_nao_encontrada', NOT_FOUND],
    [
      'transicao_ilegal',
      {
        message: 'missions.completionFailure.alreadyCompleted.message',
        recovery: 'missions.completionFailure.alreadyCompleted.recovery',
        action: 'refresh',
      },
    ],
    [
      'operacao_reutilizada',
      {
        message: 'missions.failure.reusedOperation',
        recovery: 'missions.failure.tryAgain',
        action: 'retry-with-new-operation',
      },
    ],
    [
      'missao_expirada',
      {
        message: 'missions.completionFailure.expired.message',
        recovery: 'missions.failure.refresh',
        action: 'refresh',
      },
    ],
  ])('traduz o code %s para as chaves e a acao da tela', (code, esperado) => {
    const erro = new ApiError('O servidor respondeu 409.', 409, code)

    expect(describeCompletionFailure(erro)).toEqual(esperado)
  })

  it.each(Object.entries(COMPLETION_FAILURE_BY_CODE))(
    'as chaves de %s existem no catalogo',
    (_code, failure) => {
      expect(Object.hasOwn(ptBR, failure.message)).toBe(true)
      expect(Object.hasOwn(ptBR, failure.recovery)).toBe(true)
    },
  )

  it('cai na falha generica quando o code e desconhecido', () => {
    // Um code que a tela ainda nao conhece -- de um backend mais novo, por
    // exemplo -- nao pode virar texto cru nem tela quebrada.
    const erro = new ApiError('O servidor respondeu 409.', 409, 'codigo_futuro')

    expect(describeCompletionFailure(erro)).toEqual(UNCONFIRMED)
  })

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'nao confunde o code %s com uma chave herdada do prototipo',
    (code) => {
      // `code in mapa` diria sim para os quatro, porque o operador `in`
      // percorre o prototipo: a tela leria `Object.prototype.toString` como se
      // fosse a traducao. E a guarda que `Object.hasOwn` existe para fazer.
      const erro = new ApiError('O servidor respondeu 409.', 409, code)

      expect(describeCompletionFailure(erro)).toEqual(UNCONFIRMED)
    },
  )

  it('a rede fora nomeia a acao e diz que nao conectou, e repetir e seguro', () => {
    const failure = describeCompletionFailure(new ApiError('x', null, null))
    expect(failure).toEqual({
      ...UNCONFIRMED,
      message: 'missions.completionFailure.unconfirmed.network',
    })
    expect(`${ptBR[failure.message]} ${ptBR[failure.recovery]}`).toBe(
      'Não foi possível concluir a missão: sem conexão. Tentar de novo é seguro: nada será duplicado.',
    )
  })

  it('o prazo nomeia a acao e diz que a resposta demorou, e repetir e seguro', () => {
    const failure = describeCompletionFailure(new ApiTimeoutError())
    expect(failure).toEqual({
      ...UNCONFIRMED,
      message: 'missions.completionFailure.unconfirmed.timeout',
    })
    expect(`${ptBR[failure.message]} ${ptBR[failure.recovery]}`).toBe(
      'Não foi possível concluir a missão: o servidor demorou demais. Tentar de novo é seguro: nada será duplicado.',
    )
  })

  it('um 5xx sem code continua no texto generico', () => {
    expect(describeCompletionFailure(new ApiError('O servidor respondeu 500.', 500, null))).toEqual(
      UNCONFIRMED,
    )
  })

  it('um 422 nao e "tente de novo": a evidencia foi recusada, e a chave sai', () => {
    // O 422 prova que nada foi gravado, e repetir o mesmo pedido daria o mesmo
    // 422 para sempre. A acao `retry-with-new-operation` libera a chave
    // (o hook so a retem em `retry`).
    const erro = new ApiError('O servidor respondeu 422.', 422, null)

    expect(describeCompletionFailure(erro)).toEqual({
      message: 'missions.completionFailure.evidenceRejected.message',
      recovery: 'missions.completionFailure.evidenceRejected.recovery',
      action: 'retry-with-new-operation',
    })
  })

  it('um 404 SEM code (rota ausente, deploy desencontrado) manda atualizar, nao "tente de novo"', () => {
    expect(describeCompletionFailure(new ApiError('x', 404, null))).toEqual(NOT_FOUND)
  })

  it('um 404 com code DESCONHECIDO nao e tratado como 404 sem code', () => {
    expect(describeCompletionFailure(new ApiError('x', 404, 'codigo_futuro'))).toEqual(UNCONFIRMED)
  })

  it('um code conhecido vence o status 422', () => {
    const erro = new ApiError('x', 422, 'missao_expirada')

    expect(describeCompletionFailure(erro).action).toBe('refresh')
  })

  it('cai na falha generica quando a falha nao e um ApiError', () => {
    // Um 200 com corpo corrompido: o `response.json()` do cliente lanca
    // SyntaxError, que nao passa pela traducao em ApiError.
    expect(describeCompletionFailure(new SyntaxError('Unexpected token'))).toEqual(UNCONFIRMED)
  })
})
