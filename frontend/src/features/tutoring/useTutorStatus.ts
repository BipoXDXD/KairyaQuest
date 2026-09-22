import { useCallback, useEffect, useState } from 'react'
import { requestJson } from '../../shared/api/client'
import type { StatusRead } from './types'

/**
 * Se a Tifa esta disponivel (spec: `available: false` quando nao ha chave).
 *
 * `error` e separado de `unavailable` porque pedem acoes diferentes: sem
 * chave, nao ha o que a pessoa faca pela tela; sem resposta do servidor,
 * tentar de novo pode resolver.
 */
export type TutorStatus =
  { status: 'loading' } | { status: 'available' } | { status: 'unavailable' } | { status: 'error' }

export function useTutorStatus(): { state: TutorStatus; reload: () => void } {
  const [state, setState] = useState<TutorStatus>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // O `loading` do reload mora aqui, e nao no efeito: um setState sincrono no
  // corpo do efeito reprova o `react-hooks/set-state-in-effect` (medido no 1a,
  // useMissions.ts).
  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    requestJson<StatusRead>('/tutoring/status', controller.signal)
      .then((status) => {
        setState({ status: status.available ? 'available' : 'unavailable' })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ status: 'error' })
        }
      })
    return () => {
      controller.abort()
    }
  }, [attempt])

  return { state, reload }
}
