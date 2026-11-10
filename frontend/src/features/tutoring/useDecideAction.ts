import { useCallback, useRef, useState } from 'react'
import { MUTATION_TIMEOUT_MS, postJson } from '../../shared/api/client'
import { describeActionFailure, type ActionFailure, type DecisionAction } from './actionFailure'
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
const RECORDED_FAILURE: Record<DecisionAction, ActionErrorCode | null> = {
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
 * Os dois POSTs tem prazo (`MUTATION_TIMEOUT_MS`): um pedido pendurado vira falha
 * `retry`, e a chave da confirmacao FICA -- a confirmacao pode ter executado no
 * servidor, e so a mesma chave torna o reenvio seguro.
 *
 * `missionCreated` e chamado em toda confirmacao bem-sucedida, de qualquer
 * `kind`: significa "o quadro mudou" (F22). O nome ficou para nao mexer em
 * testes que nao mudam de comportamento.
 *
 * A guarda sincrona e compartilhada por confirmar/recusar nesta instancia:
 * enquanto a cadeia nao terminou, outro callback (mesmo tick) nao envia.
 * O `disabled` continua sendo feedback na tela; chaves/backend protegem
 * instancias distintas e remontagens.
 */
export function useDecideAction(
  action: ActionRead,
  keys: ActionKeys,
  on: { changed: (action: ActionRead) => void; missionCreated: () => void },
): { state: DecisionState; confirm: () => void; reject: () => void } {
  const [state, setState] = useState<DecisionState>({ status: 'idle' })
  const inFlight = useRef(false)
  const { changed, missionCreated } = on

  const confirm = useCallback(() => {
    if (inFlight.current) return
    // Se gerar a chave lancar, estado e guarda continuam livres.
    const operationId = keys.operationIdFor(action.id)
    inFlight.current = true
    setState({ status: 'confirming' })
    postJson<ConfirmRead>(
      `/tutoring/actions/${String(action.id)}/confirm`,
      { operation_id: operationId },
      { timeoutMs: MUTATION_TIMEOUT_MS },
    )
      .then((result) => {
        keys.release(action.id)
        setState({ status: 'idle' })
        changed(result.action)
        missionCreated()
      })
      .catch((error: unknown) => {
        const failure = describeActionFailure(error, 'confirm', action.kind)
        if (failure.action !== 'retry') {
          keys.release(action.id)
        }
        const recorded = RECORDED_FAILURE[failure.action]
        if (recorded !== null) {
          changed({ ...action, state: 'falhou', error_code: recorded })
        }
        setState({ status: 'failed', failure, attempted: 'confirm' })
      })
      .finally(() => {
        inFlight.current = false
      })
  }, [action, keys, changed, missionCreated])

  const reject = useCallback(() => {
    if (inFlight.current) return
    inFlight.current = true
    setState({ status: 'rejecting' })
    postJson<RejectRead>(
      `/tutoring/actions/${String(action.id)}/reject`,
      {},
      { timeoutMs: MUTATION_TIMEOUT_MS },
    )
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
      .finally(() => {
        inFlight.current = false
      })
  }, [action, changed])

  return { state, confirm, reject }
}
