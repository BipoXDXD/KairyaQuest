import { ApiError } from '../../shared/api/client'
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
export type ActionRecovery =
  'retry' | 'retry-with-new-operation' | 'refresh' | 'expired' | 'invalidated'

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
    message: 'O prazo desta proposta já passou. Peça à Kairya uma nova proposta.',
    recovery: 'expired',
  },
  reagendamento_invalido: {
    message:
      'A missão mudou desde a proposta e não pôde ser reagendada. Peça à Kairya uma nova proposta.',
    recovery: 'invalidated',
  },
}

/**
 * O aviso de confirmar sem resposta, por `kind`: o que "nao acontece duas
 * vezes" depende do que a proposta faz. Exaustivo: um `kind` novo reprova o
 * `tsc` ate ganhar texto.
 */
const UNCONFIRMED_CONFIRM: Record<ActionRead['kind'], ActionFailure> = {
  create_mission: {
    message:
      'Não foi possível confirmar a missão. Tentar de novo é seguro: a missão não será criada duas vezes.',
    recovery: 'retry',
  },
  reschedule_mission: {
    message:
      'Não foi possível confirmar o reagendamento. Tentar de novo é seguro: o prazo não mudará duas vezes.',
    recovery: 'retry',
  },
}

const UNCONFIRMED_REJECT: ActionFailure = {
  message: 'Não foi possível recusar a proposta. Tentar de novo é seguro.',
  recovery: 'retry',
}

function isActionErrorCode(code: string): code is ActionErrorCode {
  return Object.hasOwn(BY_CODE, code)
}

/**
 * A mensagem e a acao do cartao, decididas pelo `code` e so por ele. O `kind`
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
    return BY_CODE[error.code]
  }
  return attempted === 'confirm' ? UNCONFIRMED_CONFIRM[kind] : UNCONFIRMED_REJECT
}

const FAILED_TEXT = 'Esta proposta não pôde ser executada. Peça à Kairya uma nova proposta.'

/**
 * O texto de uma acao que o backend gravou como `falhou`, pelo `error_code`
 * gravado. So os codes que o backend GRAVA na acao (`expired`, `invalidated`)
 * tem texto proprio -- o mesmo do aviso da confirmacao, para a tela dizer a
 * mesma coisa antes e depois de uma recarga. Qualquer outro cai no generico, e
 * o code cru nunca vai para a tela.
 */
export function failedActionText(errorCode: string | null): string {
  if (errorCode === null || !isActionErrorCode(errorCode)) {
    return FAILED_TEXT
  }
  const failure = BY_CODE[errorCode]
  return failure.recovery === 'expired' || failure.recovery === 'invalidated'
    ? failure.message
    : FAILED_TEXT
}
