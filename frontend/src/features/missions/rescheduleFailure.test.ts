import { describe, expect, it } from 'vitest'
import { ApiError, ApiTimeoutError } from '../../shared/api/client'
import { describeRescheduleFailure } from './rescheduleFailure'

// Escrita por extenso, e nao importada do modulo (mesmo motivo de
// `startFailure.test.ts`).
const UNCONFIRMED = {
  message:
    'Não foi possível confirmar o reagendamento. Tentar de novo é seguro: o prazo não mudará duas vezes.',
  recovery: 'retry',
}

const NOT_FOUND = {
  message: 'Esta missão não está mais disponível. Atualize para ver o estado atual.',
  recovery: 'refresh',
}

const NOT_ACCEPTED = {
  message: 'O novo prazo não foi aceito. Revise a data e o motivo.',
  recovery: 'edit',
}

describe('describeRescheduleFailure', () => {
  it.each([
    ['prazo_expirado', 422, { message: 'O novo prazo precisa estar no futuro.', recovery: 'edit' }],
    [
      'prazo_fora_do_limite',
      422,
      {
        message: 'O novo prazo pode ser no máximo 365 dias a partir de agora.',
        recovery: 'edit',
      },
    ],
    [
      'prazo_inalterado',
      409,
      {
        message: 'O novo prazo é igual ao atual. Escolha outro horário.',
        recovery: 'edit',
      },
    ],
    [
      'transicao_ilegal',
      409,
      {
        message:
          'Esta missão já foi concluída e não pode ser reagendada. Atualize para ver o estado atual.',
        recovery: 'refresh',
      },
    ],
    [
      'prazo_derivado',
      409,
      {
        message: 'O prazo desta missão vem do plano da semana e não pode ser reagendado.',
        recovery: 'refresh',
      },
    ],
    ['missao_nao_encontrada', 404, NOT_FOUND],
    [
      'operacao_reutilizada',
      409,
      {
        message: 'Não foi possível registrar esta tentativa. Tente de novo.',
        recovery: 'retry-with-new-operation',
      },
    ],
  ])('traduz o code %s (status %i) para a mensagem e a acao da tela', (code, status, esperado) => {
    expect(describeRescheduleFailure(new ApiError('x', status, code))).toEqual(esperado)
  })

  it('nunca repete o detail nem a mensagem tecnica do erro', () => {
    const erro = new ApiError('PROSA-QUE-NAO-PODE-APARECER', 409, 'prazo_inalterado')

    expect(describeRescheduleFailure(erro).message).not.toContain('PROSA-QUE-NAO-PODE-APARECER')
  })

  it('um 422 SEM code (corpo recusado pelo Pydantic) manda corrigir o formulario', () => {
    expect(describeRescheduleFailure(new ApiError('x', 422, null))).toEqual(NOT_ACCEPTED)
  })

  it('um 422 com code DESCONHECIDO tambem manda corrigir', () => {
    expect(describeRescheduleFailure(new ApiError('x', 422, 'codigo_futuro'))).toEqual(NOT_ACCEPTED)
  })

  it('um code conhecido vence o status 422', () => {
    expect(describeRescheduleFailure(new ApiError('x', 422, 'prazo_derivado')).recovery).toBe(
      'refresh',
    )
  })

  it('cai na mensagem generica, com a mesma chave, quando o code e desconhecido', () => {
    expect(describeRescheduleFailure(new ApiError('x', 409, 'codigo_futuro'))).toEqual(UNCONFIRMED)
  })

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'nao confunde o code %s com uma chave herdada do prototipo',
    (code) => {
      expect(describeRescheduleFailure(new ApiError('x', 409, code))).toEqual(UNCONFIRMED)
    },
  )

  it('a rede fora diz que nao conectou, e repetir e seguro', () => {
    expect(describeRescheduleFailure(new ApiError('x', null, null))).toEqual({
      message: 'Não foi possível conectar. Tentar de novo é seguro: o prazo não mudará duas vezes.',
      recovery: 'retry',
    })
  })

  it('o prazo diz que a resposta demorou, e repetir e seguro', () => {
    expect(describeRescheduleFailure(new ApiTimeoutError())).toEqual({
      message:
        'A resposta demorou mais que o esperado. Tentar de novo é seguro: o prazo não mudará duas vezes.',
      recovery: 'retry',
    })
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

  it('cai na mensagem generica quando a falha nao e um ApiError', () => {
    expect(describeRescheduleFailure(new SyntaxError('Unexpected token'))).toEqual(UNCONFIRMED)
  })
})
