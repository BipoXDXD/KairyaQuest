import { useCallback, useRef, useState } from 'react'
import { postJson } from '../../shared/api/client'
import { describeCompletionFailure, type CompletionFailure } from './completionFailure'
import type { Mission } from './types'

/**
 * Os estados da conclusao de UMA missao, como uniao discriminada.
 *
 * `completed` carrega a missao que a API devolveu, e nao so um "deu certo": e
 * ela que a tela passa a mostrar, com o estado e o `completed_at` do servidor.
 * `failed` carrega a traducao da falha -- mensagem e acao --, e nao o erro cru.
 */
export type CompletionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'completed'; mission: Mission }
  | { status: 'failed'; failure: CompletionFailure }

export interface UseCompleteMissionResult {
  state: CompletionState
  /** Envia a conclusao. Depois de uma falha, e tambem o "tentar de novo". */
  complete: () => void
}

/**
 * Conclui a missao `missionId` pela API, de forma idempotente.
 *
 * O `operation_id` nasce no PRIMEIRO envio e e mantido entre as tentativas: e
 * o que torna seguro repetir depois de uma falha de rede (README §7). Uma
 * chave nova a cada clique transformaria o reenvio numa conclusao nova -- a
 * segunda receberia `transicao_ilegal`, e a tela diria "ja estava concluida"
 * sobre uma conclusao que ela mesma acabou de fazer.
 *
 * A chave so e trocada quando a API diz que ela pertence a outra operacao
 * (`operacao_reutilizada`): com ela, toda tentativa seria recusada, e trocar e
 * seguro porque a missao nao foi concluida por ela.
 *
 * Fica num `useRef`, e nao num `useState`: a chave nao aparece na tela, e
 * troca-la nao deve renderizar nada.
 */
export function useCompleteMission(missionId: number): UseCompleteMissionResult {
  const [state, setState] = useState<CompletionState>({ status: 'idle' })
  const operationId = useRef<string | null>(null)

  const complete = useCallback(() => {
    operationId.current ??= crypto.randomUUID()
    setState({ status: 'submitting' })

    postJson<Mission>(`/missions/${String(missionId)}/complete`, {
      operation_id: operationId.current,
    })
      .then((mission) => {
        setState({ status: 'completed', mission })
      })
      .catch((error: unknown) => {
        const failure = describeCompletionFailure(error)
        if (failure.recovery === 'retry-with-new-operation') {
          operationId.current = null
        }
        setState({ status: 'failed', failure })
      })
  }, [missionId])

  return { state, complete }
}
