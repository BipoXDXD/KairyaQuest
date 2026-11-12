import { ApiError } from '../../shared/api/client'
import { type FailureLead, leadFor } from '../../shared/api/transportFailure'
import type { MessageKey } from '../../shared/i18n/catalog'
import type { WeekChoice } from './planDates'
import type { PlanErrorCode } from './types'

/**
 * O que a tela faz alem de mostrar o texto.
 *
 * - `refresh`: a semana ja tem plano; recarregar a trilha o mostra.
 * - `choose-next`: a semana atual acabou; a seguinte e a unica que serve.
 * - `none`: nada a fazer fora do formulario. Os dados da pessoa ficam onde
 *   estao em qualquer falha, e ela corrige ou repete.
 */
export type PlanFailureAction = 'refresh' | 'choose-next' | 'none'

/** O texto (uma ou duas chaves do catalogo, juntas com um espaco) e a acao. */
export interface PlanFailure {
  message: MessageKey
  recovery?: MessageKey
  action: PlanFailureAction
}

/**
 * A traducao de cada `code` conhecido, EXAUSTIVA sobre o tipo: um code novo
 * reprova o `tsc` ate ganhar texto e acao. Exportada so para o teste conferir
 * as chaves no catalogo.
 */
export const PLAN_FAILURE_BY_CODE: Readonly<Record<PlanErrorCode, PlanFailure>> = {
  plano_existente: { message: 'campaigns.form.failure.plano_existente', action: 'refresh' },
  semana_encerrada: { message: 'campaigns.form.failure.semana_encerrada', action: 'choose-next' },
  semana_distante: { message: 'campaigns.form.failure.semana_distante', action: 'none' },
}

/**
 * `plano_existente` na semana SEGUINTE: a trilha so mostra a semana atual, e
 * "veja o plano abaixo" seria falso. Nao ha o que recarregar.
 */
const EXISTING_NEXT_WEEK: PlanFailure = {
  message: 'campaigns.form.failure.plano_existente_next',
  action: 'none',
}

/** O 422 sem `code`: o Pydantic recusou o corpo. A validacao da tela nao deixa chegar aqui. */
const INVALID: PlanFailure = { message: 'campaigns.form.failure.invalid', action: 'none' }

const TRANSPORT_LEAD: FailureLead = {
  fallback: 'campaigns.form.failure.transport.fallback',
  timeout: 'campaigns.form.failure.transport.timeout',
  network: 'campaigns.form.failure.transport.network',
}

/** Se `code` e um dos codes que este mapa traduz (`Object.hasOwn`, nao `in`). */
function isPlanErrorCode(code: string): code is PlanErrorCode {
  return Object.hasOwn(PLAN_FAILURE_BY_CODE, code)
}

/**
 * O texto e a acao da tela para um `POST /api/plans` que falhou. Decide pelo
 * `code` e, sem `code` conhecido, pelo status 422; o resto (rede, prazo, 5xx,
 * code de um backend mais novo) e "nao confirmei": a abertura diz a causa e o
 * fim diz que os dados continuam na tela. Repetir e seguro: se o servidor
 * gravou, o novo pedido volta `plano_existente`.
 */
export function describePlanFailure(error: unknown, week: WeekChoice): PlanFailure {
  if (error instanceof ApiError && error.code !== null && isPlanErrorCode(error.code)) {
    if (error.code === 'plano_existente' && week === 'next') {
      return EXISTING_NEXT_WEEK
    }
    return PLAN_FAILURE_BY_CODE[error.code]
  }
  if (error instanceof ApiError && error.status === 422) {
    return INVALID
  }
  return {
    message: leadFor(error, TRANSPORT_LEAD),
    recovery: 'campaigns.form.failure.transport.recovery',
    action: 'none',
  }
}
