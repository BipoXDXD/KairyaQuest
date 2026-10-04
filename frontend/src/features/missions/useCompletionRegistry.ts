import { useCallback, useMemo, useRef, useState } from 'react'

/**
 * O que cada conclusao de missao usa do quadro: a chave e o aviso de voo.
 *
 * E uma interface, e nao o `Map` cru, de proposito: quem conclui so pede a
 * chave, a devolve ou avisa que um pedido saiu e terminou. A regra de quando
 * a chave nasce fica num lugar so.
 */
export interface CompletionRegistry {
  /**
   * A chave (`operation_id`) da missao: a que ja existe no registro ou, se nao
   * houver, uma nova, que passa a ser dela ate `release`.
   */
  operationIdFor: (missionId: number) => string
  /** Tira a chave da missao do registro: o proximo pedido gera outra. */
  release: (missionId: number) => void
  /** IDs explicitamente concluidas numa leitura atual bem-sucedida. */
  reconcileCompleted: (missionIds: readonly number[]) => void
  /** Um POST de conclusao saiu. Chamado ANTES do pedido, no mesmo tick. */
  started: () => void
  /** Um POST de conclusao terminou, com qualquer resultado. */
  settled: () => void
}

export interface UseCompletionRegistryResult {
  registry: CompletionRegistry
  /** Recarrega o quadro agora, ou assim que nao restar conclusao em voo. */
  reload: () => void
  /** Ha um pedido de recarga esperando uma conclusao em voo terminar. */
  waitingForCompletion: boolean
}

/**
 * O registro das conclusoes do quadro: as chaves por missao e a recarga que
 * espera a conclusao em andamento.
 *
 * Mora no `MissionList`, ACIMA dos cartoes, porque o `reload` do `useMissions`
 * desmonta todos os cartoes -- a lista passa por `loading` -- e monta cartoes
 * novos. Uma chave guardada no cartao morria ali (pendencia 35 do HANDOFF): o
 * proximo Concluir de uma missao com resultado desconhecido saia com chave
 * nova, e a tela diria "ja estava concluida" sobre a conclusao que ela mesma
 * fez. Aqui a chave pertence a MISSAO e so sai do registro quando nao tem mais
 * uso: pelo resultado do POST ou por leitura atual que confirme `concluida`.
 *
 * A recarga espera porque, com um POST em voo, o reload remontaria o cartao
 * dele no meio do pedido. Pedida com conclusao em voo, ela fica pendente e e
 * executada UMA vez, por quem terminar por ultimo.
 *
 * Contador e chaves ficam em `useRef`: sao lidos e escritos so dentro de
 * callbacks, e mudar um deles nao deve renderizar nada. O que a tela mostra --
 * se ha espera -- e estado. O pedido pendente tem as duas formas porque
 * `settled` precisa le-lo na hora, sem esperar o proximo render.
 */
export function useCompletionRegistry(reload: () => void): UseCompletionRegistryResult {
  const operationIds = useRef(new Map<number, string>())
  // So chaves existentes entram: nao acumula o catalogo de concluidas.
  const completedPending = useRef(new Set<number>())
  const inFlight = useRef(0)
  const reloadPending = useRef(false)
  const [waitingForCompletion, setWaitingForCompletion] = useState(false)

  const registry = useMemo<CompletionRegistry>(() => {
    const pruneCompleted = () => {
      // Conservador: qualquer POST em voo adia todas as candidatas.
      if (inFlight.current !== 0) return
      for (const missionId of completedPending.current) {
        operationIds.current.delete(missionId)
      }
      completedPending.current.clear()
    }
    return {
      operationIdFor: (missionId) => {
        let operationId = operationIds.current.get(missionId)
        if (operationId === undefined) {
          operationId = crypto.randomUUID()
          operationIds.current.set(missionId, operationId)
        }
        return operationId
      },
      release: (missionId) => {
        operationIds.current.delete(missionId)
        completedPending.current.delete(missionId)
      },
      reconcileCompleted: (missionIds) => {
        for (const missionId of missionIds) {
          if (operationIds.current.has(missionId)) {
            completedPending.current.add(missionId)
          }
        }
        pruneCompleted()
      },
      started: () => {
        inFlight.current += 1
      },
      settled: () => {
        inFlight.current -= 1
        pruneCompleted()
        if (inFlight.current === 0 && reloadPending.current) {
          reloadPending.current = false
          setWaitingForCompletion(false)
          reload()
        }
      },
    }
  }, [reload])

  const requestReload = useCallback(() => {
    if (inFlight.current > 0) {
      reloadPending.current = true
      setWaitingForCompletion(true)
      return
    }
    reload()
  }, [reload])

  return { registry, reload: requestReload, waitingForCompletion }
}
