import type { MessageKey } from '../i18n/catalog'
import { ApiError } from './client'

/**
 * Por que um pedido ficou sem resposta aproveitavel: o prazo acabou, ou a
 * resposta nem chegou. Nos dois casos o resultado e desconhecido, mas a acao
 * da pessoa muda -- esperar e repetir, ou conferir a conexao.
 */
export type TransportFailure = 'timeout' | 'network'

/**
 * A abertura do texto de cada falha de transporte, como chave do catalogo.
 * Diz o que aconteceu sem culpar a rede da pessoa: o servidor fora tambem da
 * "Não foi possível conectar".
 */
const LEAD_BY_FAILURE: Readonly<Record<TransportFailure, MessageKey>> = {
  timeout: 'shared.transportFailure.timeout',
  network: 'shared.transportFailure.network',
}

/**
 * Classifica a falha pelo `kind` e pelo status, nunca pela `message`.
 *
 * So `ApiError` entra: e o cliente quem sabe que nao houve resposta, e ele o
 * diz com `status` nulo. Um erro de outro tipo (um `TypeError` de
 * `JSON.parse`, por exemplo) nao e falha de transporte. A ordem importa: o
 * prazo (`kind` `timeout`) tambem e `ApiError` com `status` nulo.
 */
export function transportFailureOf(error: unknown): TransportFailure | null {
  if (!(error instanceof ApiError)) {
    return null
  }
  if (error.kind === 'timeout') {
    return 'timeout'
  }
  return error.status === null ? 'network' : null
}

/**
 * A chave da frase de abertura do texto de falha: a da falha de transporte, ou
 * `fallback`, a abertura propria do tradutor para o resto (5xx, `code`
 * desconhecido).
 */
export function leadFor(error: unknown, fallback: MessageKey): MessageKey {
  const failure = transportFailureOf(error)
  return failure === null ? fallback : LEAD_BY_FAILURE[failure]
}
