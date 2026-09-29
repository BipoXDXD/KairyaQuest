import { useCallback, useRef, useState } from 'react'
import { postJson } from '../../shared/api/client'
import { describeEvaluationFailure, type EvaluationFailure } from './evaluationFailure'
import type { EvaluationResult } from './types'

/** Os estados do pedido de avaliacao de UMA missao, como uniao discriminada. */
export type EvaluationRequestState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'done'; result: EvaluationResult }
  | { status: 'failed'; failure: EvaluationFailure }

export interface UseRequestEvaluationResult {
  state: EvaluationRequestState
  /** Pede a avaliacao. Depois de uma falha, e tambem o "tentar de novo". */
  request: () => void
}

/**
 * Pede a avaliacao da Tifa para a missao `missionId`.
 *
 * A guarda de voo mora AQUI, num `useRef`, alem do `disabled` do botao: o
 * `state` so muda no proximo render, e dois cliques no mesmo tick leriam
 * ambos `idle`. Um POST duplicado gastaria uma chamada do modelo a toa (o
 * bonus, esse, nunca e concedido duas vezes: o backend e idempotente).
 *
 * `onRewarded` so e chamado quando a resposta traz `reward` (nem ausente, nem
 * `null`) -- o quadro
 * recarrega o XP; sem bonus, nada mudou de tela.
 */
export function useRequestEvaluation(
  missionId: number,
  onRewarded?: () => void,
): UseRequestEvaluationResult {
  const [state, setState] = useState<EvaluationRequestState>({ status: 'idle' })
  const inFlight = useRef(false)

  const request = useCallback(() => {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    setState({ status: 'requesting' })

    postJson<EvaluationResult>(`/missions/${String(missionId)}/evaluation`, {})
      .then((result) => {
        setState({ status: 'done', result })
        if (result.reward != null) {
          // O estado de sucesso ja esta gravado, e o bonus ja foi concedido no
          // servidor: um callback do chamador que lance nao pode cair no
          // `.catch` abaixo e virar "falhou". Fica registrado, sem mexer no estado.
          try {
            onRewarded?.()
          } catch (error) {
            console.error('onRewarded lancou depois do bonus concedido:', error)
          }
        }
      })
      .catch((error: unknown) => {
        setState({ status: 'failed', failure: describeEvaluationFailure(error) })
      })
      .finally(() => {
        inFlight.current = false
      })
  }, [missionId, onRewarded])

  return { state, request }
}
