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
 * O texto do 503 `banco_ocupado`: o banco cortou uma espera (teto de sessao)
 * ou o pool se esgotou. A transacao foi revertida e repetir pode dar certo,
 * entao o texto diz so que e passageiro -- nao afirma que o pedido se perdeu
 * nem culpa a pessoa.
 */
export const SERVER_BUSY_TEXT: FailureText = {
  message: 'shared.apiError.serverBusy.message',
  recovery: 'shared.apiError.serverBusy.recovery',
}

/** O `code` do 503 do banco ocupado, igual em toda rota que toca o banco. */
const SERVER_BUSY_CODE = 'banco_ocupado'

/**
 * O texto do banco ocupado, ou `null` se a falha e outra. Ponto unico do
 * mapeamento: o `code` e transversal (qualquer rota que toca o banco), e cada
 * tradutor de tela so escolhe a acao que acompanha o texto.
 */
export function serverBusyText(error: unknown): FailureText | null {
  return error instanceof ApiError && error.code === SERVER_BUSY_CODE ? SERVER_BUSY_TEXT : null
}

/**
 * O texto generico de uma falha de API: o do banco ocupado, ou o do `kind`. A
 * `message` do erro e de depuracao e nunca chega a tela.
 */
export function apiErrorText(error: ApiError): FailureText {
  return serverBusyText(error) ?? API_ERROR_TEXT[error.kind]
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
 * vira texto do catalogo pelo `kind`; o resto e defeito nosso e vai SEM texto:
 * quem traduz e a tela, pela chave da area e no idioma corrente. Um texto
 * gravado no estado ficaria no idioma da hora da falha.
 */
export type LoadFailure = { kind: 'api'; text: FailureText } | { kind: 'unexpected' }

export function loadFailureFor(error: unknown): LoadFailure {
  return error instanceof ApiError
    ? { kind: 'api', text: apiErrorText(error) }
    : { kind: 'unexpected' }
}
