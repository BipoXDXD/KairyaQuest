import { useCallback, useMemo, useRef, useState } from 'react'
import type { EvidenceDraft } from './types'

const EMPTY_DRAFT: EvidenceDraft = { text: '', link: '' }

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
  /**
   * O rascunho da evidencia da missao, ou o vazio. Mora aqui, e nao no
   * formulario, pelo mesmo motivo da chave: o reload remonta os cartoes.
   */
  draftFor: (missionId: number) => EvidenceDraft
  /** Guarda o rascunho da evidencia da missao. */
  saveDraft: (missionId: number, draft: EvidenceDraft) => void
  /**
   * Tira a chave E o rascunho da missao do registro: o proximo pedido gera
   * outra chave, e o formulario recomeca vazio.
   */
  release: (missionId: number) => void
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
 * uso (quem decide e `useCompleteMission`).
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
  const drafts = useRef(new Map<number, EvidenceDraft>())
  const inFlight = useRef(0)
  const reloadPending = useRef(false)
  const [waitingForCompletion, setWaitingForCompletion] = useState(false)

  const registry = useMemo<CompletionRegistry>(
    () => ({
      operationIdFor: (missionId) => {
        let operationId = operationIds.current.get(missionId)
        if (operationId === undefined) {
          operationId = crypto.randomUUID()
          operationIds.current.set(missionId, operationId)
        }
        return operationId
      },
      draftFor: (missionId) => drafts.current.get(missionId) ?? EMPTY_DRAFT,
      saveDraft: (missionId, draft) => {
        drafts.current.set(missionId, draft)
      },
      release: (missionId) => {
        operationIds.current.delete(missionId)
        drafts.current.delete(missionId)
      },
      started: () => {
        inFlight.current += 1
      },
      settled: () => {
        inFlight.current -= 1
        if (inFlight.current === 0 && reloadPending.current) {
          reloadPending.current = false
          setWaitingForCompletion(false)
          reload()
        }
      },
    }),
    [reload],
  )

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
