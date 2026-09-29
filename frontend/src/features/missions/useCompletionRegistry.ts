import { useCallback, useMemo, useRef, useState } from 'react'
import type { EvidenceDraft } from './types'

/**
 * O rascunho vazio, um objeto so para todas as missoes: por isso congelado,
 * no tipo (`Readonly`) e em tempo de execucao (`Object.freeze`). Quem o
 * mutasse contaminaria o rascunho "vazio" de todas as outras.
 */
const EMPTY_DRAFT: Readonly<EvidenceDraft> = Object.freeze({ text: '', link: '' })

/**
 * As operacoes de escrita da missao que, alem do Concluir, tem chave no
 * registro (incremento F). O Concluir segue por `operationIdFor`/`release`.
 */
export type MissionAction = 'start' | 'reschedule'

/**
 * O que cada conclusao de missao usa do quadro: a chave, o rascunho da
 * evidencia, a marca de retry pendente e o aviso de voo.
 *
 * E uma interface, e nao o `Map` cru, de proposito: quem conclui so pede a
 * chave, a devolve, guarda ou apaga o rascunho, marca o retry pendente ou avisa
 * que um pedido saiu e terminou. A regra de quando a chave nasce fica num
 * lugar so.
 */
export interface CompletionRegistry {
  /**
   * A chave (`operation_id`) da missao: a que ja existe no registro ou, se nao
   * houver, uma nova, que passa a ser dela ate `release`.
   */
  operationIdFor: (missionId: number) => string
  /**
   * A chave (`operation_id`) da acao `action` da missao: a que ja existe ou uma
   * nova, que passa a ser dela ate `releaseActionKey`. Uma chave por missao E por
   * tipo de operacao (F20): a UNIQUE do banco e sobre a chave sozinha, e a do
   * Concluir gasta num Iniciar faria o Concluir falhar com `operacao_reutilizada`.
   */
  actionKeyFor: (missionId: number, action: MissionAction) => string
  /** Tira a chave da acao da missao: o proximo pedido dela gera outra. */
  releaseActionKey: (missionId: number, action: MissionAction) => void
  /**
   * O rascunho da evidencia da missao, ou o vazio. Mora aqui, e nao no
   * formulario, pelo mesmo motivo da chave: o reload remonta os cartoes.
   */
  draftFor: (missionId: number) => Readonly<EvidenceDraft>
  /** Guarda o rascunho da evidencia da missao. */
  saveDraft: (missionId: number, draft: EvidenceDraft) => void
  /**
   * Tira SO a chave da missao do registro: o proximo pedido gera outra. O
   * rascunho fica -- uma falha sem retry tambem libera a chave, e o rascunho
   * nunca se perde numa falha (E17, README §7).
   */
  release: (missionId: number) => void
  /**
   * Apaga o rascunho da missao: o formulario recomeca vazio. So o sucesso da
   * conclusao chama isto.
   */
  discardDraft: (missionId: number) => void
  /**
   * A ultima falha da missao deixou a chave RETIDA (`recovery: 'retry'`): a
   * entrega anterior pode ter chegado, e so a mesma chave, com o mesmo
   * rascunho, torna o reenvio seguro. Mora aqui, e nao no cartao, porque o
   * reload remonta os cartoes e a chave retida sobrevive a ele.
   */
  isRetryPending: (missionId: number) => boolean
  /** Marca a missao como em retry pendente. `release` desmarca. */
  markRetryPending: (missionId: number) => void
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
 * O registro das conclusoes do quadro: as chaves e os rascunhos da evidencia
 * por missao, o retry pendente (a chave retida, que trava a edicao da
 * evidencia) e a recarga que espera a conclusao em andamento.
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
 * As chaves do Iniciar e do Reagendar (incremento F) moram no mesmo registro,
 * pelo mesmo motivo, num mapa a parte: por missao e por tipo (`actionKeyFor`).
 *
 * Contador, chaves, rascunhos e retry pendente ficam em `useRef`: sao lidos e escritos so dentro de
 * callbacks, e mudar um deles nao deve renderizar nada. O que a tela mostra --
 * se ha espera -- e estado. O pedido pendente tem as duas formas porque
 * `settled` precisa le-lo na hora, sem esperar o proximo render.
 */
export function useCompletionRegistry(reload: () => void): UseCompletionRegistryResult {
  const operationIds = useRef(new Map<number, string>())
  const actionKeys = useRef(new Map<string, string>())
  const drafts = useRef(new Map<number, EvidenceDraft>())
  const retryPending = useRef(new Set<number>())
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
      actionKeyFor: (missionId, action) => {
        const slot = `${action}:${String(missionId)}`
        let operationId = actionKeys.current.get(slot)
        if (operationId === undefined) {
          operationId = crypto.randomUUID()
          actionKeys.current.set(slot, operationId)
        }
        return operationId
      },
      releaseActionKey: (missionId, action) => {
        actionKeys.current.delete(`${action}:${String(missionId)}`)
      },
      draftFor: (missionId) => drafts.current.get(missionId) ?? EMPTY_DRAFT,
      saveDraft: (missionId, draft) => {
        drafts.current.set(missionId, draft)
      },
      release: (missionId) => {
        operationIds.current.delete(missionId)
        retryPending.current.delete(missionId)
      },
      isRetryPending: (missionId) => retryPending.current.has(missionId),
      markRetryPending: (missionId) => {
        retryPending.current.add(missionId)
      },
      discardDraft: (missionId) => {
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
