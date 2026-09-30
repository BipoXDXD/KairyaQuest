import { useCallback, useState } from 'react'
import { postJson } from '../../shared/api/client'
import { describeActionFailure, type ActionFailure, type ActionRecovery } from './actionFailure'
import type { ActionErrorCode, ActionRead, ConfirmRead, RejectRead } from './types'
import type { ActionKeys } from './useActionKeys'

export type DecisionState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'rejecting' }
  | { status: 'failed'; failure: ActionFailure; attempted: 'confirm' | 'reject' }

/**
 * O `error_code` que o backend GRAVOU na acao antes de responder, por saida.
 * So `expired` e `invalidated` gravam (F17); nas outras a acao nao mudou.
 * Exaustivo: uma saida nova reprova o `tsc` ate dizer se grava.
 */
const RECORDED_FAILURE: Record<ActionRecovery, ActionErrorCode | null> = {
  retry: null,
  'retry-with-new-operation': null,
  refresh: null,
  expired: 'prazo_expirado',
  invalidated: 'reagendamento_invalido',
}

/**
 * Confirma ou recusa UMA proposta.
 *
 * O clique vai direto ao backend, sem passar pelo modelo (decisao D2 da spec):
 * o "sim" e deterministico. A chave segue o Concluir do Incremento A: nasce no
 * primeiro clique, FICA depois de falha que se repete (rede, 5xx, sem code),
 * e SAI no sucesso e em toda falha que nao se repete com ela.
 *
 * `prazo_expirado` e `reagendamento_invalido`: o backend GRAVOU a acao como
 * `falhou` antes do 422/409 (spec do 1b, "Confirmar e recusar"; F17 do F). A
 * tela espelha isso sem outra ida a rede.
 *
 * `missionCreated` e chamado em toda confirmacao bem-sucedida, de qualquer
 * `kind`: significa "o quadro mudou" (F22). O nome ficou para nao mexer em
 * testes que nao mudam de comportamento.
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
        const failure = describeActionFailure(error, 'confirm', action.kind)
        if (failure.recovery !== 'retry') {
          keys.release(action.id)
        }
        const recorded = RECORDED_FAILURE[failure.recovery]
        if (recorded !== null) {
          changed({ ...action, state: 'falhou', error_code: recorded })
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
          failure: describeActionFailure(error, 'reject', action.kind),
          attempted: 'reject',
        })
      })
  }, [action, changed])

  return { state, confirm, reject }
}
