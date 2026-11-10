import { describe, expect, it } from 'vitest'
import { ApiError, ApiTimeoutError } from '../../shared/api/client'
import { describeActionFailure, failedActionText } from './actionFailure'

describe('describeActionFailure', () => {
  it.each([
    [
      'operacao_reutilizada',
      409,
      'retry-with-new-operation',
      'Não foi possível registrar esta tentativa. Tente de novo.',
    ],
    [
      'transicao_ilegal',
      409,
      'refresh',
      'Esta proposta já foi decidida. Atualize a conversa para ver o estado atual.',
    ],
    [
      'acao_nao_encontrada',
      404,
      'refresh',
      'Esta proposta não existe mais. Atualize a conversa para ver o estado atual.',
    ],
    [
      'prazo_expirado',
      422,
      'expired',
      'O prazo desta proposta já passou. Peça à Kairya uma nova proposta.',
    ],
    [
      'estimativa_fora_do_limite',
      422,
      'out-of-bounds',
      'A estimativa desta proposta precisa ficar entre 1 e 1440 minutos. Peça à Kairya uma nova proposta.',
    ],
    [
      'prazo_fora_do_limite',
      422,
      'out-of-bounds',
      'O prazo desta proposta passa de 365 dias a partir de agora. Peça à Kairya uma nova proposta.',
    ],
  ])('traduz %s', (code, status, recovery, message) => {
    for (const attempted of ['confirm', 'reject'] as const) {
      for (const kind of ['create_mission', 'reschedule_mission'] as const) {
        expect(describeActionFailure(new ApiError('x', status, code), attempted, kind)).toEqual({
          message,
          recovery,
        })
      }
    }
  })

  it.each([
    ['5xx sem code', new ApiError('x', 500, null)],
    ['422 sem code', new ApiError('x', 422, null)],
    ['code desconhecido', new ApiError('x', 409, 'code_novo')],
    ['herdado do prototipo', new ApiError('x', 409, 'hasOwnProperty')],
    ['erro que nao e ApiError', new Error('x')],
  ])('%s: confirmar diz que repetir nao cria duas missoes', (_caso, error) => {
    expect(describeActionFailure(error, 'confirm', 'create_mission')).toEqual({
      message:
        'Não foi possível confirmar a missão. Tentar de novo é seguro: a missão não será criada duas vezes.',
      recovery: 'retry',
    })
  })

  it.each([
    [
      'rede fora',
      new ApiError('x', null, null),
      'Não foi possível conectar. Tentar de novo é seguro: a missão não será criada duas vezes.',
    ],
    [
      'prazo',
      new ApiTimeoutError(),
      'A resposta demorou mais que o esperado. Tentar de novo é seguro: a missão não será criada duas vezes.',
    ],
  ])(
    '%s: confirmar abre com a causa e diz que repetir nao cria duas missoes',
    (_caso, error, message) => {
      expect(describeActionFailure(error, 'confirm', 'create_mission')).toEqual({
        message,
        recovery: 'retry',
      })
    },
  )

  it('recusar tem o proprio texto generico', () => {
    expect(describeActionFailure(new ApiError('x', 500, null), 'reject', 'create_mission')).toEqual(
      {
        message: 'Não foi possível recusar a proposta. Tentar de novo é seguro.',
        recovery: 'retry',
      },
    )
  })

  it.each([
    [
      'rede fora',
      new ApiError('x', null, null),
      'Não foi possível conectar. Tentar de novo é seguro.',
    ],
    [
      'prazo',
      new ApiTimeoutError(),
      'A resposta demorou mais que o esperado. Tentar de novo é seguro.',
    ],
  ])('%s: recusar abre com a causa', (_caso, error, message) => {
    for (const kind of ['create_mission', 'reschedule_mission'] as const) {
      expect(describeActionFailure(error, 'reject', kind)).toEqual({ message, recovery: 'retry' })
    }
  })

  it('reagendamento_invalido: a acao foi gravada falhou, e o cartao passa a esse estado', () => {
    for (const attempted of ['confirm', 'reject'] as const) {
      expect(
        describeActionFailure(
          new ApiError('x', 409, 'reagendamento_invalido'),
          attempted,
          'reschedule_mission',
        ),
      ).toEqual({
        message:
          'A missão mudou desde a proposta e não pôde ser reagendada. Peça à Kairya uma nova proposta.',
        recovery: 'invalidated',
      })
    }
  })

  it('confirmar um reagendamento sem resposta diz que o prazo nao muda duas vezes', () => {
    expect(
      describeActionFailure(new ApiError('x', 500, null), 'confirm', 'reschedule_mission'),
    ).toEqual({
      message:
        'Não foi possível confirmar o reagendamento. Tentar de novo é seguro: o prazo não mudará duas vezes.',
      recovery: 'retry',
    })
  })

  it.each([
    [
      'rede fora',
      new ApiError('x', null, null),
      'Não foi possível conectar. Tentar de novo é seguro: o prazo não mudará duas vezes.',
    ],
    [
      'prazo',
      new ApiTimeoutError(),
      'A resposta demorou mais que o esperado. Tentar de novo é seguro: o prazo não mudará duas vezes.',
    ],
  ])('%s: confirmar um reagendamento abre com a causa', (_caso, error, message) => {
    expect(describeActionFailure(error, 'confirm', 'reschedule_mission')).toEqual({
      message,
      recovery: 'retry',
    })
  })

  it('recusar um reagendamento tem o mesmo texto generico da criacao', () => {
    expect(
      describeActionFailure(new ApiError('x', 500, null), 'reject', 'reschedule_mission'),
    ).toEqual({
      message: 'Não foi possível recusar a proposta. Tentar de novo é seguro.',
      recovery: 'retry',
    })
  })

  it('o code conhecido vale para os dois tipos de acao', () => {
    expect(
      describeActionFailure(
        new ApiError('x', 409, 'transicao_ilegal'),
        'confirm',
        'reschedule_mission',
      ),
    ).toEqual({
      message: 'Esta proposta já foi decidida. Atualize a conversa para ver o estado atual.',
      recovery: 'refresh',
    })
  })
})

describe('failedActionText', () => {
  it.each([
    ['prazo_expirado', 'O prazo desta proposta já passou. Peça à Kairya uma nova proposta.'],
    [
      'reagendamento_invalido',
      'A missão mudou desde a proposta e não pôde ser reagendada. Peça à Kairya uma nova proposta.',
    ],
    [
      'estimativa_fora_do_limite',
      'A estimativa desta proposta precisa ficar entre 1 e 1440 minutos. Peça à Kairya uma nova proposta.',
    ],
    [
      'prazo_fora_do_limite',
      'O prazo desta proposta passa de 365 dias a partir de agora. Peça à Kairya uma nova proposta.',
    ],
    ['proposta_invalida', 'Esta proposta não pôde ser executada. Peça à Kairya uma nova proposta.'],
    // Um code que existe no mapa mas nao e gravado na acao cai no generico.
    ['transicao_ilegal', 'Esta proposta não pôde ser executada. Peça à Kairya uma nova proposta.'],
    ['toString', 'Esta proposta não pôde ser executada. Peça à Kairya uma nova proposta.'],
    [null, 'Esta proposta não pôde ser executada. Peça à Kairya uma nova proposta.'],
  ])('a acao gravada falhou com %s', (code, text) => {
    expect(failedActionText(code)).toBe(text)
  })
})
