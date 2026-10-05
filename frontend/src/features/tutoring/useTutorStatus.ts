import { useCallback, useEffect, useRef, useState } from 'react'
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
  // Cancelar a rede não invalida uma resposta já em processamento. A geração
  // muda na recarga, antes do próximo efeito, e na limpeza (inclusive StrictMode).
  const requestId = useRef(0)

  // O `loading` do reload mora aqui, e nao no efeito: um setState sincrono no
  // corpo do efeito reprova o `react-hooks/set-state-in-effect` (medido no 1a,
  // useMissions.ts).
  const reload = useCallback(() => {
    requestId.current += 1
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    const id = (requestId.current += 1)
    const controller = new AbortController()
    requestJson<StatusRead>('/tutoring/status', controller.signal)
      .then((status) => {
        if (controller.signal.aborted || requestId.current !== id) {
          return
        }
        setState({ status: status.available ? 'available' : 'unavailable' })
      })
      .catch(() => {
        if (!controller.signal.aborted && requestId.current === id) {
          setState({ status: 'error' })
        }
      })
    return () => {
      requestId.current += 1
      controller.abort()
    }
  }, [attempt])

  return { state, reload }
}
