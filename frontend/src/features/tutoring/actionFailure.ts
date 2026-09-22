import { ApiError } from '../../shared/api/client'
import type { ActionErrorCode } from './types'

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
 */
export type ActionRecovery = 'retry' | 'retry-with-new-operation' | 'refresh' | 'expired'

export interface ActionFailure {
  message: string
  recovery: ActionRecovery
}

const BY_CODE: Record<ActionErrorCode, ActionFailure> = {
  operacao_reutilizada: {
    message: 'Não foi possível registrar esta tentativa. Tente de novo.',
    recovery: 'retry-with-new-operation',
  },
  transicao_ilegal: {
    message: 'Esta proposta já foi decidida. Atualize a conversa para ver o estado atual.',
    recovery: 'refresh',
  },
  acao_nao_encontrada: {
    message: 'Esta proposta não existe mais. Atualize a conversa para ver o estado atual.',
    recovery: 'refresh',
  },
  prazo_expirado: {
    message: 'O prazo desta proposta já passou. Peça à Tifa uma nova proposta.',
    recovery: 'expired',
  },
}

const UNCONFIRMED: Record<'confirm' | 'reject', ActionFailure> = {
  confirm: {
    message:
      'Não foi possível confirmar a missão. Tentar de novo é seguro: a missão não será criada duas vezes.',
    recovery: 'retry',
  },
  reject: {
    message: 'Não foi possível recusar a proposta. Tentar de novo é seguro.',
    recovery: 'retry',
  },
}

function isActionErrorCode(code: string): code is ActionErrorCode {
  return Object.hasOwn(BY_CODE, code)
}

/** A mensagem e a acao do cartao, decididas pelo `code` e so por ele. */
export function describeActionFailure(
  error: unknown,
  attempted: 'confirm' | 'reject',
): ActionFailure {
  if (error instanceof ApiError && error.code !== null && isActionErrorCode(error.code)) {
    return BY_CODE[error.code]
  }
  return UNCONFIRMED[attempted]
}
