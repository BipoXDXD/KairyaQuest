import { ApiError } from '../../shared/api/client'
import type { FailureText } from '../../shared/i18n/failureText'
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
export type RescheduleAction = 'retry' | 'retry-with-new-operation' | 'edit' | 'refresh'

/** O texto (chaves do catalogo) e a acao que decide o botao. */
export type RescheduleFailure = FailureText & { action: RescheduleAction }

/**
 * A traducao de cada `code` conhecido, EXAUSTIVA sobre o tipo. Exportada so
 * para o teste conferir as chaves no catalogo.
 */
export const RESCHEDULE_FAILURE_BY_CODE: Readonly<Record<RescheduleErrorCode, RescheduleFailure>> =
  {
    prazo_expirado: {
      message: 'missions.rescheduleFailure.deadlinePassed.message',
      recovery: 'missions.rescheduleFailure.deadlinePassed.recovery',
      action: 'edit',
    },
    prazo_fora_do_limite: {
      message: 'missions.rescheduleFailure.tooFar.message',
      recovery: 'missions.rescheduleFailure.tooFar.recovery',
      action: 'edit',
    },
    prazo_inalterado: {
      message: 'missions.rescheduleFailure.unchanged.message',
      recovery: 'missions.rescheduleFailure.unchanged.recovery',
      action: 'edit',
    },
    transicao_ilegal: {
      message: 'missions.rescheduleFailure.alreadyCompleted.message',
      recovery: 'missions.failure.refresh',
      action: 'refresh',
    },
    prazo_derivado: {
      message: 'missions.rescheduleFailure.derivedDeadline.message',
      recovery: 'missions.failure.refresh',
      action: 'refresh',
    },
    missao_nao_encontrada: {
      message: 'missions.failure.notAvailable',
      recovery: 'missions.failure.refresh',
      action: 'refresh',
    },
    operacao_reutilizada: {
      message: 'missions.failure.reusedOperation',
      recovery: 'missions.failure.tryAgain',
      action: 'retry-with-new-operation',
    },
  }

/** A falha sem `code` conhecido: rede fora, 5xx, code de um backend mais novo. */
const UNCONFIRMED: RescheduleFailure = {
  message: 'missions.rescheduleFailure.unconfirmed.message',
  recovery: 'missions.rescheduleFailure.unconfirmed.recovery',
  action: 'retry',
}

/**
 * O 422 sem `code` conhecido: o Pydantic recusou o corpo (prazo sem fuso, motivo
 * fora do enum). Nada foi gravado, e repetir o MESMO pedido daria o mesmo 422
 * para sempre. O `operation_id` e gerado pelo cliente, entao o que o servidor
 * pode recusar e o prazo ou o motivo.
 */
const NOT_ACCEPTED: RescheduleFailure = {
  message: 'missions.rescheduleFailure.notAccepted.message',
  recovery: 'missions.rescheduleFailure.notAccepted.recovery',
  action: 'edit',
}

/** Se `code` e um dos codes que este mapa traduz (`Object.hasOwn`, nao `in`). */
function isRescheduleErrorCode(code: string): code is RescheduleErrorCode {
  return Object.hasOwn(RESCHEDULE_FAILURE_BY_CODE, code)
}

/**
 * O texto e a acao da tela para um Reagendar que falhou. Decide pelo `code`
 * e, sem `code`, pelo status (404 e 422); a `message` do `ApiError` e tecnica e
 * o `detail` nem chega aqui.
 */
export function describeRescheduleFailure(error: unknown): RescheduleFailure {
  if (error instanceof ApiError && error.code !== null && isRescheduleErrorCode(error.code)) {
    return RESCHEDULE_FAILURE_BY_CODE[error.code]
  }
  // Um 404 SEM `code`: rota ausente ou deploy desencontrado (RE20 do E).
  if (error instanceof ApiError && error.status === 404 && error.code === null) {
    return RESCHEDULE_FAILURE_BY_CODE.missao_nao_encontrada
  }
  if (error instanceof ApiError && error.status === 422) {
    return NOT_ACCEPTED
  }
  return UNCONFIRMED
}
