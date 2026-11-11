import { ApiError } from '../../shared/api/client'
import { type FailureLead, leadFor } from '../../shared/api/transportFailure'
import type { RescheduleErrorCode } from './types'

/**
 * O que a tela oferece depois de um Reagendar que falhou.
 *
 * - `retry`: tentar de novo com o MESMO `operation_id`. Rede, 5xx, `code`
 *   desconhecido: nao se sabe se o prazo mudou, e o reenvio com a mesma chave e
 *   o mesmo conteudo e idempotente (F13) -- nunca grava dois elos.
 * - `retry-with-new-operation`: `operacao_reutilizada`; a chave sai.
 * - `edit`: o servidor leu o pedido e o recusou por causa do que a pessoa
 *   escolheu (prazo no passado, igual ao atual, corpo invalido). Nada foi
 *   gravado: a chave SAI, e o formulario fica com o que foi digitado, para
 *   corrigir.
 * - `refresh`: nao ha o que corrigir. A missao mudou de estado, nao aceita
 *   reagendamento ou nao existe mais; recarregar mostra a verdade.
 */
export type RescheduleRecovery = 'retry' | 'retry-with-new-operation' | 'edit' | 'refresh'

export interface RescheduleFailure {
  /** Texto para a pessoa, em pt-BR. Nunca e o `detail` do backend. */
  message: string
  recovery: RescheduleRecovery
}

/** A traducao de cada `code` conhecido, EXAUSTIVA sobre o tipo. */
const FAILURE_BY_CODE: Record<RescheduleErrorCode, RescheduleFailure> = {
  prazo_expirado: {
    message: 'O novo prazo precisa estar no futuro.',
    recovery: 'edit',
  },
  prazo_fora_do_limite: {
    message: 'O novo prazo pode ser no máximo 365 dias a partir de agora.',
    recovery: 'edit',
  },
  prazo_inalterado: {
    message: 'O novo prazo é igual ao atual. Escolha outro horário.',
    recovery: 'edit',
  },
  transicao_ilegal: {
    message:
      'Esta missão já foi concluída e não pode ser reagendada. Atualize para ver o estado atual.',
    recovery: 'refresh',
  },
  prazo_derivado: {
    message: 'O prazo desta missão vem do plano da semana e não pode ser reagendado.',
    recovery: 'refresh',
  },
  missao_nao_encontrada: {
    message: 'Esta missão não está mais disponível. Atualize para ver o estado atual.',
    recovery: 'refresh',
  },
  operacao_reutilizada: {
    message: 'Não foi possível registrar esta tentativa. Tente de novo.',
    recovery: 'retry-with-new-operation',
  },
}

const UNCONFIRMED_LEAD: FailureLead = {
  action: 'reagendar a missão',
  fallback: 'Não foi possível confirmar o reagendamento.',
}
const RETRY_IS_SAFE = 'Tentar de novo é seguro: o prazo não mudará duas vezes.'

/**
 * A falha sem `code` conhecido: rede fora, prazo, 5xx, code de um backend mais
 * novo. A abertura diz a causa quando ela e de transporte (`leadFor`).
 */
function unconfirmed(error: unknown): RescheduleFailure {
  return { message: `${leadFor(error, UNCONFIRMED_LEAD)} ${RETRY_IS_SAFE}`, recovery: 'retry' }
}

/**
 * O 422 sem `code` conhecido: o Pydantic recusou o corpo (prazo sem fuso, motivo
 * fora do enum). Nada foi gravado, e repetir o MESMO pedido daria o mesmo 422
 * para sempre. O `operation_id` e gerado pelo cliente, entao o que o servidor
 * pode recusar e o prazo ou o motivo.
 */
const NOT_ACCEPTED: RescheduleFailure = {
  message: 'O novo prazo não foi aceito. Revise a data e o motivo.',
  recovery: 'edit',
}

/** Se `code` e um dos codes que este mapa traduz (`Object.hasOwn`, nao `in`). */
function isRescheduleErrorCode(code: string): code is RescheduleErrorCode {
  return Object.hasOwn(FAILURE_BY_CODE, code)
}

/**
 * A mensagem e a acao da tela para um Reagendar que falhou. Decide pelo `code`
 * e, sem `code`, pelo status (404 e 422); a `message` do `ApiError` e tecnica e
 * o `detail` nem chega aqui.
 */
export function describeRescheduleFailure(error: unknown): RescheduleFailure {
  if (error instanceof ApiError && error.code !== null && isRescheduleErrorCode(error.code)) {
    return FAILURE_BY_CODE[error.code]
  }
  // Um 404 SEM `code`: rota ausente ou deploy desencontrado (RE20 do E).
  if (error instanceof ApiError && error.status === 404 && error.code === null) {
    return FAILURE_BY_CODE.missao_nao_encontrada
  }
  if (error instanceof ApiError && error.status === 422) {
    return NOT_ACCEPTED
  }
  return unconfirmed(error)
}
