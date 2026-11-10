import { ApiError, ApiTimeoutError } from './client'

/**
 * Por que um pedido ficou sem resposta aproveitavel: o prazo acabou, ou a
 * resposta nem chegou. Nos dois casos o resultado e desconhecido, mas a acao
 * da pessoa muda -- esperar e repetir, ou conferir a conexao.
 */
export type TransportFailure = 'timeout' | 'network'

/**
 * A causa de cada falha de transporte, completando "Não foi possível <acao>:".
 * Fala do servidor, e nao da rede da pessoa: o servidor fora tambem deixa o
 * pedido sem conexao.
 */
const CAUSE_BY_FAILURE: Record<TransportFailure, string> = {
  timeout: 'o servidor demorou demais para responder',
  network: 'sem conexão com o servidor',
}

/**
 * A abertura de um tradutor: `action` e a acao com objeto ("concluir a
 * missão"), que a falha de transporte nomeia junto da causa; `fallback` e a
 * frase propria para o resto (5xx, `code` desconhecido).
 */
export interface FailureLead {
  action: string
  fallback: string
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
 * A frase de abertura do texto de falha. Na falha de transporte, nomeia a
 * acao e a causa numa frase so ("Não foi possível concluir a missão: sem
 * conexão com o servidor."); no resto, e o `fallback` do tradutor.
 */
export function leadFor(error: unknown, lead: FailureLead): string {
  const failure = transportFailureOf(error)
  return failure === null
    ? lead.fallback
    : `Não foi possível ${lead.action}: ${CAUSE_BY_FAILURE[failure]}.`
}
