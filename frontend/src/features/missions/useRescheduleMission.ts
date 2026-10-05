import { useCallback, useRef, useState } from 'react'
import { MUTATION_TIMEOUT_MS, postJson } from '../../shared/api/client'
import { deadlineForDraft } from './rescheduleDraft'
import type { Mission } from '../../shared/types/mission'
import { describeRescheduleFailure, type RescheduleFailure } from './rescheduleFailure'
import type { RescheduleDraft } from './types'
import type { CompletionRegistry } from './useCompletionRegistry'

/**
 * Os estados do Reagendar de UMA missao, como uniao discriminada (mesmo desenho
 * de `StartState`).
 *
 * `rescheduled` carrega a missao que a API devolveu, com o prazo novo e o
 * historico: e ela que a tela passa a mostrar.
 */
export type RescheduleState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'rescheduled'; mission: Mission }
  | { status: 'failed'; failure: RescheduleFailure }

export interface UseRescheduleMissionResult {
  state: RescheduleState
  /**
   * Envia o reagendamento do rascunho. Depois de uma falha, e tambem o "tentar de
   * novo". Um rascunho que nao pode ser enviado -- sem motivo, sem data ou com uma
   * hora que nao existe em Sao Paulo -- nao envia nada e nao muda o estado: a tela
   * ja o barra no botao. Com um envio em voo, nao faz nada.
   */
  reschedule: (draft: RescheduleDraft) => void
  /**
   * A missao do ultimo reagendamento que DEU CERTO, ou `null`. O `state`
   * descreve a tentativa corrente e deixa de ser `rescheduled` assim que um
   * segundo envio sai; sem isto, o cartao voltava ao prazo listado (e sumia
   * com o historico) durante o voo ou a falha do segundo reagendamento.
   */
  lastRescheduled: Mission | null
}

/**
 * Reagenda o prazo da missao `missionId` pela API, de forma idempotente (F13).
 *
 * A hora que a pessoa escolhe e a civil de Sao Paulo (`datetime-local`); vira o
 * instante pelo `Intl` com `America/Sao_Paulo`, nunca por deslocamento fixo
 * (F21), e vai como UTC. Sem alterar a hora civil, conserva o ISO original,
 * incluindo segundos, fracao e offset.
 *
 * A chave (`operation_id`) mora no `registry`, por missao E por tipo
 * (`actionKeyFor(missionId, 'reschedule')`), pelo mesmo motivo do Iniciar. Quando
 * ela sai, este hook decide pelo resultado:
 *
 * - **falha que se repete com a mesma chave** (`recovery: 'retry'`): a chave
 *   FICA; nao se sabe se o prazo mudou;
 * - **sucesso e qualquer outra falha** (`edit`, `refresh`,
 *   `retry-with-new-operation`): a chave SAI. Em `edit` o servidor leu e recusou
 *   o pedido, nada foi gravado, e a correcao da pessoa e outro conteudo -- com a
 *   mesma chave seria `operacao_reutilizada`.
 *
 * O POST tem prazo (`MUTATION_TIMEOUT_MS`), com o mesmo efeito do Iniciar: falha
 * `retry`, chave mantida, botao de volta.
 *
 * O hook tambem avisa o registro de que um POST saiu e terminou.
 */
export function useRescheduleMission(
  missionId: number,
  registry: CompletionRegistry,
): UseRescheduleMissionResult {
  const [state, setState] = useState<RescheduleState>({ status: 'idle' })
  const [lastRescheduled, setLastRescheduled] = useState<Mission | null>(null)
  // Ref, e nao o `state`: dois cliques no mesmo tick leriam o mesmo `idle`.
  const inFlight = useRef(false)

  const reschedule = useCallback(
    (draft: RescheduleDraft) => {
      if (draft.reason === null) {
        return
      }
      const newDeadline = deadlineForDraft(draft)
      if (newDeadline === null || inFlight.current) {
        return
      }
      // Primeiro, e antes de qualquer mudanca de estado (ver `useStartMission`).
      const operationId = registry.actionKeyFor(missionId, 'reschedule')
      inFlight.current = true
      setState({ status: 'submitting' })
      registry.started()

      postJson<Mission>(
        `/missions/${String(missionId)}/reschedule`,
        {
          operation_id: operationId,
          new_deadline: newDeadline,
          reason: draft.reason,
        },
        { timeoutMs: MUTATION_TIMEOUT_MS },
      )
        .then((mission) => {
          registry.releaseActionKey(missionId, 'reschedule')
          setState({ status: 'rescheduled', mission })
          setLastRescheduled(mission)
        })
        .catch((error: unknown) => {
          const failure = describeRescheduleFailure(error)
          if (failure.recovery !== 'retry') {
            registry.releaseActionKey(missionId, 'reschedule')
          }
          setState({ status: 'failed', failure })
        })
        .finally(() => {
          inFlight.current = false
          registry.settled()
        })
    },
    [missionId, registry],
  )

  return { state, reschedule, lastRescheduled }
}
