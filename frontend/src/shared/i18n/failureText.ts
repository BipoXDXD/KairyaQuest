import { ApiError, type ApiErrorKind } from '../api/client'
import type { MessageKey } from './catalog'

/**
 * O texto de uma falha, em duas chaves do catalogo: `message` diz o que falhou
 * e por que ("[o que falhou]. [causa]."), `recovery` diz o que fazer ("[o que
 * fazer]."). Quem exibe e o `FailureMessage`, que junta as duas.
 */
export interface FailureText {
  message: MessageKey
  recovery: MessageKey
}

/** Exaustivo sobre o `kind`: um `kind` novo reprova o `tsc` ate ganhar texto. */
const API_ERROR_TEXT: Record<ApiErrorKind, FailureText> = {
  network: {
    message: 'shared.apiError.network.message',
    recovery: 'shared.apiError.network.recovery',
  },
  timeout: {
    message: 'shared.apiError.timeout.message',
    recovery: 'shared.apiError.timeout.recovery',
  },
  http: { message: 'shared.apiError.http.message', recovery: 'shared.apiError.http.recovery' },
  format: {
    message: 'shared.apiError.format.message',
    recovery: 'shared.apiError.format.recovery',
  },
  interrupted: {
    message: 'shared.apiError.interrupted.message',
    recovery: 'shared.apiError.interrupted.recovery',
  },
}

/**
 * O texto generico de uma falha de API, pelo `kind`. A `message` do erro e de
 * depuracao e nunca chega a tela.
 */
export function apiErrorText(error: ApiError): FailureText {
  return API_ERROR_TEXT[error.kind]
}

/**
 * O texto do teto diario da tutoria (429 `limite_diario_da_tutoria`).
 *
 * O `Retry-After` do backend e sempre "segundos ate 00:00 de Sao Paulo", entao
 * o horario de volta e sempre meia-noite e nao precisa ser formatado. Sem o
 * cabecalho (ou com um valor ilegivel), nao se sabe quando volta, e o texto
 * pede para tentar amanha.
 */
export function dailyLimitText(error: ApiError): FailureText {
  return {
    message: 'tutoring.messageFailure.dailyLimit.message',
    recovery:
      error.retryAfterSeconds === null
        ? 'tutoring.messageFailure.dailyLimit.backTomorrow'
        : 'tutoring.messageFailure.dailyLimit.backAtMidnight',
  }
}

/**
 * A falha de uma carga de tela (lista, ciclo, progresso, trilha). O `ApiError`
 * vira texto do catalogo pelo `kind`; o resto e defeito nosso, e mostra a
 * mensagem fixa da area, que vira chave no PR da area.
 */
export type LoadFailure =
  { kind: 'api'; text: FailureText } | { kind: 'unexpected'; message: string }

export function loadFailureFor(error: unknown, unexpectedMessage: string): LoadFailure {
  return error instanceof ApiError
    ? { kind: 'api', text: apiErrorText(error) }
    : { kind: 'unexpected', message: unexpectedMessage }
}
