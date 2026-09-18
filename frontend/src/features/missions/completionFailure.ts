import { ApiError } from '../../shared/api/client'
import type { MissionErrorCode } from './types'

/**
 * O que a tela oferece depois de uma conclusao que falhou.
 *
 * - `retry`: tentar de novo com o MESMO `operation_id`. E o caso da falha de
 *   rede e do erro sem `code`: nao se sabe se o servidor concluiu, e o reenvio
 *   com a mesma chave e idempotente -- devolve a conclusao que ja existe, ou
 *   conclui agora, mas nunca conclui duas vezes (README §7).
 * - `retry-with-new-operation`: tentar de novo com um `operation_id` NOVO. So
 *   o `operacao_reutilizada` pede isso: a chave pertence a outra operacao, e a
 *   mesma chave seria recusada para sempre.
 * - `refresh`: nao ha o que repetir. A missao ja estava concluida ou nao existe
 *   mais, e a acao util e recarregar o quadro para ver o estado de verdade.
 */
export type CompletionRecovery = 'retry' | 'retry-with-new-operation' | 'refresh'

export interface CompletionFailure {
  /** Texto para a pessoa, em pt-BR. Nunca e o `detail` do backend. */
  message: string
  recovery: CompletionRecovery
}

/**
 * A traducao de cada `code` conhecido, EXAUSTIVA sobre o tipo.
 *
 * `Record<MissionErrorCode, ...>` e o que faz um code novo em
 * `MissionErrorCode` reprovar o `tsc` ate ganhar mensagem e acao aqui. A
 * alternativa -- `Partial` com fallback -- deixaria o code novo cair na
 * mensagem generica sem que ninguem decidisse se era isso mesmo.
 */
const FAILURE_BY_CODE: Record<MissionErrorCode, CompletionFailure> = {
  missao_nao_encontrada: {
    message: 'Esta missão não está mais no quadro. Atualize o quadro para ver as missões atuais.',
    recovery: 'refresh',
  },
  transicao_ilegal: {
    message: 'Esta missão já estava concluída. Atualize o quadro para ver o estado atual.',
    recovery: 'refresh',
  },
  operacao_reutilizada: {
    message: 'Não foi possível registrar esta tentativa. Tente de novo.',
    recovery: 'retry-with-new-operation',
  },
}

/**
 * A falha sem `code` conhecido: rede fora, 5xx, 422, code de um backend mais
 * novo. Nao se sabe se a conclusao aconteceu, e a mensagem diz a unica coisa
 * certa -- que repetir nao duplica.
 */
const UNCONFIRMED: CompletionFailure = {
  message:
    'Não foi possível confirmar a conclusão. Tentar de novo é seguro: a missão não será concluída duas vezes.',
  recovery: 'retry',
}

/**
 * Se `code` e um dos codes que este mapa traduz.
 *
 * `Object.hasOwn`, e nao `code in FAILURE_BY_CODE`: o operador `in` percorre o
 * prototipo, e diria sim para `toString` ou `constructor` -- a tela leria uma
 * funcao herdada como se fosse a traducao.
 */
function isMissionErrorCode(code: string): code is MissionErrorCode {
  return Object.hasOwn(FAILURE_BY_CODE, code)
}

/**
 * A mensagem e a acao da tela para uma conclusao que falhou.
 *
 * Decide pelo `code`, e so por ele. A `message` do `ApiError` e tecnica ("O
 * servidor respondeu 409.") e nao entra aqui; o `detail` do backend nem chega
 * ao `ApiError`.
 */
export function describeCompletionFailure(error: unknown): CompletionFailure {
  if (error instanceof ApiError && error.code !== null && isMissionErrorCode(error.code)) {
    return FAILURE_BY_CODE[error.code]
  }
  return UNCONFIRMED
}
