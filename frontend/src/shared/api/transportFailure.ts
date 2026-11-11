import type { MessageKey } from '../i18n/catalog'
import { ApiError, ApiTimeoutError } from './client'

/**
 * Por que um pedido ficou sem resposta aproveitavel: o prazo acabou, ou a
 * resposta nem chegou. Nos dois casos o resultado e desconhecido, mas a acao
 * da pessoa muda -- esperar e repetir, ou conferir a conexao.
 */
export type TransportFailure = 'timeout' | 'network'

/**
 * A abertura (chave do catalogo) do texto de cada falha de transporte. Diz o
 * que aconteceu sem culpar a rede da pessoa: o servidor fora tambem da "Não foi
 * possível conectar".
 */
const LEAD_BY_FAILURE: Record<TransportFailure, MessageKey> = {
  timeout: 'shared.transport.timeout.lead',
  network: 'shared.transport.network.lead',
}

/**
 * Classifica a falha pelo tipo e pelo status, nunca pela `message`.
 *
 * So `ApiError` entra: e o cliente quem sabe que nao houve resposta, e ele o
 * diz com `status` nulo. Um erro de outro tipo (um `TypeError` de
 * `JSON.parse`, por exemplo) nao e falha de transporte. A ordem importa:
 * `ApiTimeoutError` tambem e `ApiError` com `status` nulo.
 */
export function transportFailureOf(error: unknown): TransportFailure | null {
  if (error instanceof ApiTimeoutError) {
    return 'timeout'
  }
  if (error instanceof ApiError && error.status === null) {
    return 'network'
  }
  return null
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
