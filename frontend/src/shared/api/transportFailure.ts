import type { MessageKey } from '../i18n/catalog'
import { ApiError } from './client'

/**
 * Por que um pedido ficou sem resposta aproveitavel: o prazo acabou, ou a
 * resposta nem chegou. Nos dois casos o resultado e desconhecido, mas a acao
 * da pessoa muda -- esperar e repetir, ou conferir a conexao.
 */
export type TransportFailure = 'timeout' | 'network'

/**
 * A abertura do texto de falha de um tradutor, como chaves do catalogo.
 * `timeout` e `network` nomeiam a acao e a causa numa frase so ("Não foi
 * possível concluir a missão: sem conexão."), em 12 a 18 palavras com o
 * `recovery`. A causa diz "sem conexao", e nao "a sua conexao": o servidor fora
 * tambem deixa o pedido sem conexao, e o que a pessoa faz e o mesmo. `fallback` e a frase propria
 * para o resto (5xx, `code` desconhecido).
 * Uma chave por acao e por idioma, e nao uma frase montada aqui: a ordem das
 * palavras muda de idioma para idioma.
 */
export interface FailureLead {
  fallback: MessageKey
  timeout: MessageKey
  network: MessageKey
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
 * A chave da frase de abertura do texto de falha: a da falha de transporte, que
 * nomeia a acao e a causa, ou o `fallback` do tradutor para o resto.
 */
export function leadFor(error: unknown, lead: FailureLead): MessageKey {
  const failure = transportFailureOf(error)
  return failure === null ? lead.fallback : lead[failure]
}
