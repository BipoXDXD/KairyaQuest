import { ApiError } from '../../shared/api/client'
import { leadFor } from '../../shared/api/transportFailure'
import type { StartErrorCode } from './types'

/**
 * O que a tela oferece depois de um Iniciar que falhou. Mesmo desenho de
 * `CompletionRecovery` (`completionFailure.ts`), sem o caso da evidencia
 * recusada: o corpo do Iniciar e so a chave, que o cliente gera.
 *
 * - `retry`: tentar de novo com o MESMO `operation_id`. Rede, 5xx, `code`
 *   desconhecido: nao se sabe se o servidor iniciou, e o reenvio com a mesma
 *   chave e idempotente (F2) -- devolve a missao como esta, nunca inicia duas
 *   vezes.
 * - `retry-with-new-operation`: `operacao_reutilizada`, a chave pertence a outra
 *   operacao e seria recusada para sempre; a missao nao foi iniciada por ela.
 * - `refresh`: nao ha o que repetir. A missao ja foi iniciada ou concluida,
 *   expirou ou nao existe mais; recarregar mostra o estado de verdade.
 */
export type StartRecovery = 'retry' | 'retry-with-new-operation' | 'refresh'

export interface StartFailure {
  /** Texto para a pessoa, em pt-BR. Nunca e o `detail` do backend. */
  message: string
  recovery: StartRecovery
}

/**
 * A traducao de cada `code` conhecido, EXAUSTIVA sobre o tipo (mesmo motivo do
 * mapa de `completionFailure.ts`: um code novo reprova o `tsc` ate ganhar
 * mensagem e acao).
 */
const FAILURE_BY_CODE: Record<StartErrorCode, StartFailure> = {
  transicao_ilegal: {
    message: 'Esta missão já foi iniciada ou concluída. Atualize para ver o estado atual.',
    recovery: 'refresh',
  },
  // "prazo", e nao "dia": a janela da especial e de dois dias.
  missao_expirada: {
    message:
      'O prazo desta missão já terminou e ela não pode mais ser iniciada. Atualize para ver o estado atual.',
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

/**
 * A falha sem `code` conhecido: rede fora, prazo, 5xx, code de um backend mais
 * novo. A abertura diz a causa quando ela e de transporte (`leadFor`); o fim
 * diz a unica coisa certa -- que repetir nao duplica.
 */
const UNCONFIRMED_LEAD = 'Não foi possível confirmar o início.'
const RETRY_IS_SAFE = 'Tentar de novo é seguro: a missão não será iniciada duas vezes.'

function unconfirmed(error: unknown): StartFailure {
  return { message: `${leadFor(error, UNCONFIRMED_LEAD)} ${RETRY_IS_SAFE}`, recovery: 'retry' }
}

/**
 * Se `code` e um dos codes que este mapa traduz. `Object.hasOwn`, e nao `in`:
 * o `in` percorre o prototipo e diria sim para `toString`.
 */
function isStartErrorCode(code: string): code is StartErrorCode {
  return Object.hasOwn(FAILURE_BY_CODE, code)
}

/**
 * A mensagem e a acao da tela para um Iniciar que falhou. Decide pelo `code`, e
 * so por ele: a `message` do `ApiError` e tecnica e o `detail` nem chega aqui.
 */
export function describeStartFailure(error: unknown): StartFailure {
  if (error instanceof ApiError && error.code !== null && isStartErrorCode(error.code)) {
    return FAILURE_BY_CODE[error.code]
  }
  // Um 404 SEM `code` nao e o da missao (esse traz `missao_nao_encontrada`): e
  // rota ausente ou deploy desencontrado. Repetir nao adianta (RE20 do E).
  if (error instanceof ApiError && error.status === 404 && error.code === null) {
    return FAILURE_BY_CODE.missao_nao_encontrada
  }
  return unconfirmed(error)
}
