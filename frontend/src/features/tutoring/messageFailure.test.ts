import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/client'
import { describePreStreamFailure, describeStreamFailure, UNKNOWN_RESULT } from './messageFailure'

describe('describePreStreamFailure', () => {
  it.each([
    [
      'provedor_nao_configurado',
      503,
      'unavailable',
      'A Tifa está fora do ar: falta configurar o provedor.',
    ],
    [
      'mensagem_em_andamento',
      409,
      'retry',
      'A Tifa ainda está respondendo a pergunta anterior. Espere um instante e tente de novo.',
    ],
    [
      'operacao_reutilizada',
      409,
      'retry-with-new-id',
      'Não foi possível registrar esta pergunta. Tente de novo.',
    ],
  ])('traduz %s', (code, status, recovery, message) => {
    expect(describePreStreamFailure(new ApiError('x', status, code))).toEqual({ message, recovery })
  })

  it('o 422 sem code pede para editar, e nao para repetir', () => {
    // Repetir o mesmo corpo daria o mesmo 422; so mudar o texto resolve.
    expect(describePreStreamFailure(new ApiError('x', 422, null))).toEqual({
      message: 'A pergunta não foi aceita. Confira o texto e envie de novo.',
      recovery: 'edit',
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
      message:
        'Não deu para saber se a resposta chegou inteira. Tentar de novo é seguro: a pergunta não será duplicada.',
      recovery: 'retry',
    })
  })
})

describe('describeStreamFailure', () => {
  it.each([
    [
      'provedor_indisponivel',
      'A Tifa não conseguiu responder agora. Tentar de novo é seguro: a pergunta não será duplicada.',
    ],
    [
      'tempo_esgotado',
      'A resposta da Tifa demorou demais. Tentar de novo é seguro: a pergunta não será duplicada.',
    ],
    [
      'proposta_invalida',
      'A Tifa tentou propor uma missão que não passou na validação. Tente de novo ou peça de outro jeito.',
    ],
  ])('traduz %s, sempre com reenvio pelo mesmo id', (code, message) => {
    expect(describeStreamFailure(code)).toEqual({ message, recovery: 'retry' })
  })

  it('a recusa orienta a perguntar de outro jeito e descarta o parcial (pendencia 120)', () => {
    // A orientacao da API: o texto que veio antes da recusa nao e resposta.
    expect(describeStreamFailure('resposta_recusada')).toEqual({
      message:
        'A Tifa não pôde responder a esta pergunta. Tentar de novo tende a dar o mesmo resultado: pergunte de outro jeito.',
      recovery: 'retry',
      discardsPartial: true,
    })
  })

  it.each(['code_novo', 'constructor'])('%s cai no resultado desconhecido', (code) => {
    expect(describeStreamFailure(code)).toBe(UNKNOWN_RESULT)
  })
})
