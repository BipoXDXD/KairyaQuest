import { useCallback, useEffect, useState } from 'react'
import { ApiError, requestJson } from '../../shared/api/client'
import type { Cycle } from './types'

/**
 * Os estados da secao do ciclo, como uniao discriminada (mesmo desenho de
 * `useMissions`). "Sem plano" NAO e um estado daqui: e `loaded` com
 * `cycle.mission === null` -- para a API, sem plano e estado, nao erro.
 *
 * `refreshFailed` existe por causa do `refresh` (decisao P9 do plano do B):
 * a atualizacao silenciosa que falha nao desmonta o que esta na tela, mas a
 * tela precisa dizer que a sequencia pode estar velha.
 */
export type CycleState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; cycle: Cycle; refreshFailed: boolean }

export interface UseCycleResult {
  state: CycleState
  /** Recarrega passando por "carregando". E o "Tentar novamente" do erro. */
  reload: () => void
  /**
   * Atualiza em silencio, SEM passar por "carregando": e o que roda depois de
   * uma conclusao, para a sequencia mudar sem desmontar o cartao concluido.
   */
  refresh: () => void
}

function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Falha inesperada ao carregar o ciclo.'
}

export function useCycle(): UseCycleResult {
  const [state, setState] = useState<CycleState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((anterior) => anterior + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    requestJson<Cycle>('/cycle', controller.signal)
      .then((cycle) => {
        setState({ status: 'loaded', cycle, refreshFailed: false })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        setState({ status: 'error', message: messageFor(error) })
      })
    return () => {
      controller.abort()
    }
  }, [attempt])

  const refresh = useCallback(() => {
    requestJson<Cycle>('/cycle')
      .then((cycle) => {
        setState({ status: 'loaded', cycle, refreshFailed: false })
      })
      .catch(() => {
        // So marca o que esta carregado: se um reload comecou nesse meio
        // tempo, a tela esta em "carregando" e o reload decide o resto.
        setState((atual) => (atual.status === 'loaded' ? { ...atual, refreshFailed: true } : atual))
      })
  }, [])

  return { state, reload, refresh }
}
