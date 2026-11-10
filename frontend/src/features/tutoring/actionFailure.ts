import { ApiError } from '../../shared/api/client'
import type { FailureText } from '../../shared/i18n/failureText'
import type { ActionErrorCode, ActionRead } from './types'

/**
 * O que o cartao oferece depois de uma decisao que falhou.
 *
 * - `retry`: repetir com o MESMO `operation_id` (confirmar) ou de novo
 *   (recusar, idempotente). Rede, 5xx, erro sem `code`.
 * - `retry-with-new-operation`: repetir com um `operation_id` NOVO. So o
 *   `operacao_reutilizada`, como no Concluir do Incremento A.
 * - `refresh`: a proposta ja foi decidida ou nao existe mais; recarregar a
 *   conversa mostra o estado de verdade.
 * - `expired`: o prazo passou, o backend GRAVOU a acao como `falhou` antes do
 *   422, e o cartao passa a esse estado.
 * - `invalidated`: a missao mudou desde a proposta de reagendamento (sumiu,
 *   foi concluida, o prazo ja e o proposto); o backend GRAVOU a acao como
 *   `falhou`/`reagendamento_invalido` antes do 409 (F17), e o cartao passa a
 *   esse estado, como no `expired`.
 */
export type DecisionAction =
  'retry' | 'retry-with-new-operation' | 'refresh' | 'expired' | 'invalidated'

/** O texto (chaves do catalogo) e a acao que decide o cartao. */
export type ActionFailure = FailureText & { action: DecisionAction }

/** Exportado so para o teste conferir as chaves no catalogo. */
export const ACTION_FAILURE_BY_CODE: Readonly<Record<ActionErrorCode, ActionFailure>> = {
  operacao_reutilizada: {
    message: 'tutoring.actionFailure.reusedOperation.message',
    recovery: 'tutoring.actionFailure.reusedOperation.recovery',
    action: 'retry-with-new-operation',
  },
  transicao_ilegal: {
    message: 'tutoring.actionFailure.alreadyDecided.message',
    recovery: 'tutoring.actionFailure.refreshConversation',
    action: 'refresh',
  },
  acao_nao_encontrada: {
    message: 'tutoring.actionFailure.notFound.message',
    recovery: 'tutoring.actionFailure.refreshConversation',
    action: 'refresh',
  },
  prazo_expirado: {
    message: 'tutoring.actionFailure.expired.message',
    recovery: 'tutoring.actionFailure.askNewProposal',
    action: 'expired',
  },
  reagendamento_invalido: {
    message: 'tutoring.actionFailure.rescheduleInvalid.message',
    recovery: 'tutoring.actionFailure.askNewProposal',
    action: 'invalidated',
  },
}

/**
 * O aviso de confirmar sem resposta, por `kind`: o que "nao acontece duas
 * vezes" depende do que a proposta faz. Exaustivo: um `kind` novo reprova o
 * `tsc` ate ganhar texto.
 */
const UNCONFIRMED_CONFIRM: Record<ActionRead['kind'], ActionFailure> = {
  create_mission: {
    message: 'tutoring.actionFailure.unconfirmedCreate.message',
    recovery: 'tutoring.actionFailure.unconfirmedCreate.recovery',
    action: 'retry',
  },
  reschedule_mission: {
    message: 'tutoring.actionFailure.unconfirmedReschedule.message',
    recovery: 'tutoring.actionFailure.unconfirmedReschedule.recovery',
    action: 'retry',
  },
}

const UNCONFIRMED_REJECT: ActionFailure = {
  message: 'tutoring.actionFailure.unconfirmedReject.message',
  recovery: 'tutoring.actionFailure.unconfirmedReject.recovery',
  action: 'retry',
}

function isActionErrorCode(code: string): code is ActionErrorCode {
  return Object.hasOwn(ACTION_FAILURE_BY_CODE, code)
}

/**
 * O texto e a acao do cartao, decididos pelo `code` e so por ele. O `kind`
 * so escolhe o texto do "confirmar sem resposta", e e OBRIGATORIO: um padrao
 * esconderia do `tsc` o chamador que esquecesse o `kind` de um reagendamento,
 * e ele diria "a missao nao sera criada duas vezes".
 */
export function describeActionFailure(
  error: unknown,
  attempted: 'confirm' | 'reject',
  kind: ActionRead['kind'],
): ActionFailure {
  if (error instanceof ApiError && error.code !== null && isActionErrorCode(error.code)) {
    return ACTION_FAILURE_BY_CODE[error.code]
  }
  return attempted === 'confirm' ? UNCONFIRMED_CONFIRM[kind] : UNCONFIRMED_REJECT
}

const FAILED_TEXT: FailureText = {
  message: 'tutoring.actionFailure.failed.message',
  recovery: 'tutoring.actionFailure.askNewProposal',
}

/**
 * O texto de uma acao que o backend gravou como `falhou`, pelo `error_code`
 * gravado. So os codes que o backend GRAVA na acao (`expired`, `invalidated`)
 * tem texto proprio -- o mesmo do aviso da confirmacao, para a tela dizer a
 * mesma coisa antes e depois de uma recarga. Qualquer outro cai no generico, e
 * o code cru nunca vai para a tela.
 */
export function failedActionText(errorCode: string | null): FailureText {
  if (errorCode === null || !isActionErrorCode(errorCode)) {
    return FAILED_TEXT
  }
  const { message, recovery, action } = ACTION_FAILURE_BY_CODE[errorCode]
  return action === 'expired' || action === 'invalidated' ? { message, recovery } : FAILED_TEXT
}
