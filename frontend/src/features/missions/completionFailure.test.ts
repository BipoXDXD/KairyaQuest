import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/client'
import { describeCompletionFailure } from './completionFailure'

// Escrita por extenso, e nao importada do modulo: se a mensagem generica
// mudasse por engano, um teste que a importasse concordaria com ela.
const UNCONFIRMED = {
  message:
    'Não foi possível confirmar a conclusão. Tentar de novo é seguro: a missão não será concluída duas vezes.',
  recovery: 'retry',
}

describe('describeCompletionFailure', () => {
  it.each([
    [
      'missao_nao_encontrada',
      {
        message:
          'Esta missão não está mais no quadro. Atualize o quadro para ver as missões atuais.',
        recovery: 'refresh',
      },
    ],
    [
      'transicao_ilegal',
      {
        message: 'Esta missão já estava concluída. Atualize o quadro para ver o estado atual.',
        recovery: 'refresh',
      },
    ],
    [
      'operacao_reutilizada',
      {
        message: 'Não foi possível registrar esta tentativa. Tente de novo.',
        recovery: 'retry-with-new-operation',
      },
    ],
    [
      'missao_expirada',
      {
        message:
          'O prazo desta missão já terminou e ela não pode mais ser concluída. Atualize para ver o estado atual.',
        recovery: 'refresh',
      },
    ],
  ])('traduz o code %s para a mensagem e a acao da tela', (code, esperado) => {
    const erro = new ApiError('O servidor respondeu 409.', 409, code)

    expect(describeCompletionFailure(erro)).toEqual(esperado)
  })

  it('nunca repete o detail nem a mensagem tecnica do erro', () => {
    // O cliente ja descarta o `detail`; esta e a segunda barreira. A mensagem
    // da tela sai do mapa, e nao de `error.message`.
    const erro = new ApiError('PROSA-QUE-NAO-PODE-APARECER', 409, 'transicao_ilegal')

    expect(describeCompletionFailure(erro).message).not.toContain('PROSA-QUE-NAO-PODE-APARECER')
  })

  it('cai na mensagem generica quando o code e desconhecido', () => {
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

  it('cai na mensagem generica quando nao ha code (rede, 5xx)', () => {
    expect(
      describeCompletionFailure(new ApiError('Não foi possível falar com o servidor.', null, null)),
    ).toEqual(UNCONFIRMED)
    expect(describeCompletionFailure(new ApiError('O servidor respondeu 500.', 500, null))).toEqual(
      UNCONFIRMED,
    )
  })

  it('um 422 nao e "tente de novo": a evidencia foi recusada, e a chave sai', () => {
    // O 422 prova que nada foi gravado, e repetir o mesmo pedido daria o mesmo
    // 422 para sempre. A recuperacao `retry-with-new-operation` libera a chave
    // (o hook so a retem em `retry`).
    const erro = new ApiError('O servidor respondeu 422.', 422, null)

    expect(describeCompletionFailure(erro)).toEqual({
      message: 'A evidência não foi aceita. Revise o texto e o link.',
      recovery: 'retry-with-new-operation',
    })
  })

  it('um 404 SEM code (rota ausente, deploy desencontrado) manda atualizar, nao "tente de novo"', () => {
    expect(describeCompletionFailure(new ApiError('x', 404, null))).toEqual({
      message: 'Esta missão não está mais no quadro. Atualize o quadro para ver as missões atuais.',
      recovery: 'refresh',
    })
  })

  it('um 404 com code DESCONHECIDO nao e tratado como 404 sem code', () => {
    expect(describeCompletionFailure(new ApiError('x', 404, 'codigo_futuro'))).toEqual(UNCONFIRMED)
  })

  it('um code conhecido vence o status 422', () => {
    const erro = new ApiError('x', 422, 'missao_expirada')

    expect(describeCompletionFailure(erro).recovery).toBe('refresh')
  })

  it('cai na mensagem generica quando a falha nao e um ApiError', () => {
    // Um 200 com corpo corrompido: o `response.json()` do cliente lanca
    // SyntaxError, que nao passa pela traducao em ApiError.
    expect(describeCompletionFailure(new SyntaxError('Unexpected token'))).toEqual(UNCONFIRMED)
  })
})
