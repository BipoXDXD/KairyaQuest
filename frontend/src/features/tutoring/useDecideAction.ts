import { useCallback, useState } from 'react'
import { postJson } from '../../shared/api/client'
import { describeActionFailure, type ActionFailure } from './actionFailure'
import type { ActionRead, ConfirmRead, RejectRead } from './types'
import type { ActionKeys } from './useActionKeys'

export type DecisionState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'rejecting' }
  | { status: 'failed'; failure: ActionFailure; attempted: 'confirm' | 'reject' }

/**
 * Confirma ou recusa UMA proposta.
 *
 * O clique vai direto ao backend, sem passar pelo modelo (decisao D2 da spec):
 * o "sim" e deterministico. A chave segue o Concluir do Incremento A: nasce no
 * primeiro clique, FICA depois de falha que se repete (rede, 5xx, sem code),
 * e SAI no sucesso e em toda falha que nao se repete com ela.
 *
 * `prazo_expirado`: o backend GRAVOU a acao como `falhou` antes do 422 (spec,
 * "Confirmar e recusar"). A tela espelha isso sem outra ida a rede.
 *
 * Nao se protege sozinho contra dois `confirm()` no mesmo tick: a guarda e o
 * `disabled` dos botoes durante `confirming`/`rejecting` (pendencia 34). Com a
 * chave idempotente, dois POSTs com ela nao criam duas missoes.
 */
export function useDecideAction(
  action: ActionRead,
  keys: ActionKeys,
  on: { changed: (action: ActionRead) => void; missionCreated: () => void },
): { state: DecisionState; confirm: () => void; reject: () => void } {
  const [state, setState] = useState<DecisionState>({ status: 'idle' })
  const { changed, missionCreated } = on

  const confirm = useCallback(() => {
    const operationId = keys.operationIdFor(action.id)
    setState({ status: 'confirming' })
    postJson<ConfirmRead>(`/tutoring/actions/${String(action.id)}/confirm`, {
      operation_id: operationId,
    })
      .then((result) => {
        keys.release(action.id)
        setState({ status: 'idle' })
        changed(result.action)
        missionCreated()
      })
      .catch((error: unknown) => {
        const failure = describeActionFailure(error, 'confirm')
        if (failure.recovery !== 'retry') {
          keys.release(action.id)
        }
        if (failure.recovery === 'expired') {
          changed({ ...action, state: 'falhou', error_code: 'prazo_expirado' })
        }
        setState({ status: 'failed', failure, attempted: 'confirm' })
      })
  }, [action, keys, changed, missionCreated])

  const reject = useCallback(() => {
    setState({ status: 'rejecting' })
    postJson<RejectRead>(`/tutoring/actions/${String(action.id)}/reject`, {})
      .then((result) => {
        setState({ status: 'idle' })
        changed(result.action)
      })
      .catch((error: unknown) => {
        setState({
          status: 'failed',
          failure: describeActionFailure(error, 'reject'),
          attempted: 'reject',
        })
      })
  }, [action, changed])

  return { state, confirm, reject }
}
