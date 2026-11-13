import { ApiError } from '../../shared/api/client'
import { type FailureLead, leadFor } from '../../shared/api/transportFailure'
import { type FailureText, serverBusyText } from '../../shared/i18n/failureText'
import type { StartErrorCode } from './types'

/**
 * O que a tela oferece depois de um Iniciar que falhou. Mesmo desenho de
 * `CompletionAction` (`completionFailure.ts`), sem o caso da evidencia
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
export type StartAction = 'retry' | 'retry-with-new-operation' | 'refresh'

/** O texto (chaves do catalogo) e a acao que decide o botao. */
export type StartFailure = FailureText & { action: StartAction }

/**
 * A traducao de cada `code` conhecido, EXAUSTIVA sobre o tipo (mesmo motivo do
 * mapa de `completionFailure.ts`: um code novo reprova o `tsc` ate ganhar
 * texto e acao). Exportada so para o teste conferir as chaves no catalogo.
 */
export const START_FAILURE_BY_CODE: Readonly<Record<StartErrorCode, StartFailure>> = {
  transicao_ilegal: {
    message: 'missions.startFailure.alreadyStarted.message',
    recovery: 'missions.failure.refresh',
    action: 'refresh',
  },
  // "prazo", e nao "dia": a janela da especial e de dois dias.
  missao_expirada: {
    message: 'missions.startFailure.expired.message',
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

const UNCONFIRMED_LEAD: FailureLead = {
  fallback: 'missions.startFailure.unconfirmed.message',
  timeout: 'missions.startFailure.unconfirmed.timeout',
  network: 'missions.startFailure.unconfirmed.network',
}

/**
 * A falha sem `code` conhecido: rede fora, prazo, 5xx, code de um backend mais
 * novo. A abertura diz a causa quando ela e de transporte (`leadFor`); o fim
 * diz a unica coisa certa -- que repetir nao duplica.
 */
function unconfirmed(error: unknown): StartFailure {
  return {
    message: leadFor(error, UNCONFIRMED_LEAD),
    recovery: 'missions.startFailure.unconfirmed.recovery',
    action: 'retry',
  }
}

/**
 * Se `code` e um dos codes que este mapa traduz. `Object.hasOwn`, e nao `in`:
 * o `in` percorre o prototipo e diria sim para `toString`.
 */
function isStartErrorCode(code: string): code is StartErrorCode {
  return Object.hasOwn(START_FAILURE_BY_CODE, code)
}

/**
 * O texto e a acao da tela para um Iniciar que falhou. Decide pelo `code`, e
 * so por ele: a `message` do `ApiError` e tecnica e o `detail` nem chega aqui.
 */
export function describeStartFailure(error: unknown): StartFailure {
  // Banco ocupado: nada foi gravado, e o reenvio com a mesma chave e seguro.
  const busy = serverBusyText(error)
  if (busy !== null) {
    return { ...busy, action: 'retry' }
  }
  if (error instanceof ApiError && error.code !== null && isStartErrorCode(error.code)) {
    return START_FAILURE_BY_CODE[error.code]
  }
  // Um 404 SEM `code` nao e o da missao (esse traz `missao_nao_encontrada`): e
  // rota ausente ou deploy desencontrado. Repetir nao adianta (RE20 do E).
  if (error instanceof ApiError && error.status === 404 && error.code === null) {
    return START_FAILURE_BY_CODE.missao_nao_encontrada
  }
  return unconfirmed(error)
}
