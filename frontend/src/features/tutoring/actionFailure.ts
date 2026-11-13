import { ApiError } from '../../shared/api/client'
import { type FailureLead, leadFor } from '../../shared/api/transportFailure'
import type { MessageKey } from '../../shared/i18n/catalog'
import { type FailureText, serverBusyText } from '../../shared/i18n/failureText'
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
 * - `invalidated`: a proposta nao vale mais. Ou a missao mudou desde a
 *   proposta de reagendamento (sumiu, foi concluida, o prazo ja e o proposto;
 *   `reagendamento_invalido`, 409, F17), ou a entrada gravada nao passa mais
 *   no esquema atual (`proposta_invalida`, 422, pendencia 47). O backend
 *   GRAVOU a acao como `falhou` antes de responder, e o cartao passa a esse
 *   estado, como no `expired`.
 * - `out-of-bounds`: a proposta saiu dos limites da avulsa (estimativa fora de
 *   1 a 1440 minutos, prazo alem de 365 dias; pendencia 26); o backend GRAVOU
 *   a acao como `falhou` com esse code antes do 422, como no `expired`.
 */
export type DecisionAction =
  'retry' | 'retry-with-new-operation' | 'refresh' | 'expired' | 'invalidated' | 'out-of-bounds'

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
  estimativa_fora_do_limite: {
    message: 'tutoring.actionFailure.estimateOutOfBounds.message',
    recovery: 'tutoring.actionFailure.askNewProposal',
    action: 'out-of-bounds',
  },
  prazo_fora_do_limite: {
    message: 'tutoring.actionFailure.deadlineOutOfBounds.message',
    recovery: 'tutoring.actionFailure.askNewProposal',
    action: 'out-of-bounds',
  },
  // Sem texto proprio: a causa (um esquema que endureceu depois da proposta)
  // nao e acionavel para a pessoa; o generico diz o que importa.
  proposta_invalida: {
    message: 'tutoring.actionFailure.failed.message',
    recovery: 'tutoring.actionFailure.askNewProposal',
    action: 'invalidated',
  },
}

/**
 * Se o backend GRAVOU a acao como `falhou` antes de responder, por saida.
 * Exaustivo: uma saida nova reprova o `tsc` ate dizer se grava.
 */
const RECORDS: Record<DecisionAction, boolean> = {
  retry: false,
  'retry-with-new-operation': false,
  refresh: false,
  expired: true,
  invalidated: true,
  'out-of-bounds': true,
}

/**
 * O texto de uma decisao sem resposta, em duas partes: a abertura (`lead`), que
 * nomeia a acao e a causa quando ela e de transporte (`leadFor`), e o `recovery`
 * que diz que repetir e seguro.
 */
interface UnconfirmedText {
  lead: FailureLead
  recovery: MessageKey
}

/**
 * O aviso de confirmar sem resposta, por `kind`: o que "nao acontece duas
 * vezes" depende do que a proposta faz. Exaustivo: um `kind` novo reprova o
 * `tsc` ate ganhar texto.
 */
const UNCONFIRMED_CONFIRM: Record<ActionRead['kind'], UnconfirmedText> = {
  create_mission: {
    lead: {
      fallback: 'tutoring.actionFailure.unconfirmedCreate.message',
      timeout: 'tutoring.actionFailure.unconfirmedCreate.timeout',
      network: 'tutoring.actionFailure.unconfirmedCreate.network',
    },
    recovery: 'tutoring.actionFailure.unconfirmedCreate.recovery',
  },
  reschedule_mission: {
    lead: {
      fallback: 'tutoring.actionFailure.unconfirmedReschedule.message',
      timeout: 'tutoring.actionFailure.unconfirmedReschedule.timeout',
      network: 'tutoring.actionFailure.unconfirmedReschedule.network',
    },
    recovery: 'tutoring.actionFailure.unconfirmedReschedule.recovery',
  },
}

const UNCONFIRMED_REJECT: UnconfirmedText = {
  lead: {
    fallback: 'tutoring.actionFailure.unconfirmedReject.message',
    timeout: 'tutoring.actionFailure.unconfirmedReject.timeout',
    network: 'tutoring.actionFailure.unconfirmedReject.network',
  },
  recovery: 'tutoring.actionFailure.unconfirmedReject.recovery',
}

function isActionErrorCode(code: string): code is ActionErrorCode {
  return Object.hasOwn(ACTION_FAILURE_BY_CODE, code)
}

/**
 * O `error_code` que o backend GRAVOU na acao antes de responder com este
 * erro, ou `null` se a acao nao mudou. A tela espelha a acao gravada sem outra
 * ida a rede.
 */
export function recordedErrorCode(error: unknown): ActionErrorCode | null {
  if (error instanceof ApiError && error.code !== null && isActionErrorCode(error.code)) {
    return RECORDS[ACTION_FAILURE_BY_CODE[error.code].action] ? error.code : null
  }
  return null
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
  // Banco ocupado: a decisao nao foi gravada, e repetir e seguro.
  const busy = serverBusyText(error)
  if (busy !== null) {
    return { ...busy, action: 'retry' }
  }
  // A abertura nomeia a acao e a causa quando ela e de transporte (`leadFor`); o
  // `recovery` segue dizendo que repetir e seguro.
  const text = attempted === 'confirm' ? UNCONFIRMED_CONFIRM[kind] : UNCONFIRMED_REJECT
  return { message: leadFor(error, text.lead), recovery: text.recovery, action: 'retry' }
}

const FAILED_TEXT: FailureText = {
  message: 'tutoring.actionFailure.failed.message',
  recovery: 'tutoring.actionFailure.askNewProposal',
}

/**
 * O texto de uma acao que o backend gravou como `falhou`, pelo `error_code`
 * gravado. So os codes cuja saida o backend GRAVA na acao (`RECORDS`: as saidas
 * `expired`, `invalidated` e `out-of-bounds`) tem texto proprio -- o mesmo do
 * aviso da confirmacao, para a tela dizer a mesma coisa antes e depois de uma
 * recarga. Qualquer outro cai no generico, e o code cru nunca vai para a tela.
 */
export function failedActionText(errorCode: string | null): FailureText {
  if (errorCode === null || !isActionErrorCode(errorCode)) {
    return FAILED_TEXT
  }
  const { message, recovery, action } = ACTION_FAILURE_BY_CODE[errorCode]
  return RECORDS[action] ? { message, recovery } : FAILED_TEXT
}
