import { useMemo, useRef } from 'react'

export interface ActionKeys {
  /** A chave da acao: a que ja existe ou uma nova, que fica ate `release`. */
  operationIdFor: (actionId: number) => string
  release: (actionId: number) => void
}

/**
 * As chaves de confirmacao por acao, ACIMA dos cartoes.
 *
 * Mesma licao da pendencia 35 (Incremento A): a lista da conversa pode ser
 * recarregada ("Atualizar a conversa"), e a recarga remonta os cartoes. Uma
 * chave guardada no cartao morreria ali, e o reenvio de uma confirmacao com
 * resultado desconhecido sairia com chave nova.
 */
export function useActionKeys(): ActionKeys {
  const keys = useRef(new Map<number, string>())
  return useMemo(
    () => ({
      operationIdFor: (actionId) => {
        let key = keys.current.get(actionId)
        if (key === undefined) {
          key = crypto.randomUUID()
          keys.current.set(actionId, key)
        }
        return key
      },
      release: (actionId) => {
        keys.current.delete(actionId)
      },
    }),
    [],
  )
}
