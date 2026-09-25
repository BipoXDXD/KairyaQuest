import { useCallback, useEffect, useState } from 'react'
import { ApiError, requestJson } from '../../shared/api/client'
import type { CurrentPlan, Plan } from './types'

/**
 * Os estados da trilha, como uniao discriminada (mesmo desenho de
 * `useCycle`). `no-plan` e o `{"plan": null}` da API: "sem plano nesta
 * semana" e estado, nao erro, e pede outra coisa da pessoa do que "nao
 * consegui falar com o servidor".
 *
 * `refreshFailed` existe pelo mesmo motivo do `useCycle` (decisao P9 do plano
 * do B): o `refresh` silencioso que falha nao desmonta a trilha que esta na
 * tela, mas ela precisa dizer que pode estar desatualizada.
 */
export type CurrentPlanState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'no-plan' }
  | { status: 'loaded'; plan: Plan; refreshFailed: boolean }

export interface UseCurrentPlanResult {
  state: CurrentPlanState
  /** Repete o pedido passando por "carregando": o "Tentar novamente" do erro. */
  reload: () => void
  /**
   * Atualiza em silencio, SEM passar por "carregando" (mesmo desenho do
   * `refresh` de `useCycle`). Ainda sem nenhum evento que o chame -- isso e
   * de uma tarefa futura, que liga a trilha a conclusao feita no
   * Quartel-General.
   */
  refresh: () => void
}

/**
 * O `ApiError` ja traz prosa em pt-BR escrita pelo cliente HTTP (nunca o
 * `detail`). A leitura da trilha nao tem erro de dominio com `code`: o que
 * chega aqui e rede ou servidor, e qualquer outra coisa e defeito nosso.
 */
function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Falha inesperada ao carregar a trilha.'
}

/**
 * Carrega `GET /api/plans/current`: a trilha da semana ATUAL. Nenhuma semana
 * futura e pedida nem mostrada (spec do ciclo, Frontend).
 *
 * O volta-a-carregar mora no `reload`, e nao no corpo do efeito, pelo mesmo
 * motivo medido em `useCycle`: um `setState` sincrono dentro do efeito
 * reprova o `react-hooks/set-state-in-effect`.
 */
export function useCurrentPlan(): UseCurrentPlanResult {
  const [state, setState] = useState<CurrentPlanState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((anterior) => anterior + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    requestJson<CurrentPlan>('/plans/current', controller.signal)
      .then(({ plan }) => {
        setState(
          plan === null ? { status: 'no-plan' } : { status: 'loaded', plan, refreshFailed: false },
        )
      })
      .catch((error: unknown) => {
        // Um pedido que NOS cancelamos (StrictMode, troca de tela) nao e falha
        // para mostrar: sem a guarda, a rejeicao tardia dele sobrescreveria a
        // trilha boa com o estado de erro.
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
    requestJson<CurrentPlan>('/plans/current')
      .then(({ plan }) => {
        setState(
          plan === null ? { status: 'no-plan' } : { status: 'loaded', plan, refreshFailed: false },
        )
      })
      .catch(() => {
        // So marca o que esta carregado: se um reload comecou nesse meio
        // tempo, a tela esta em "carregando" e o reload decide o resto.
        setState((atual) => (atual.status === 'loaded' ? { ...atual, refreshFailed: true } : atual))
      })
  }, [])

  return { state, reload, refresh }
}
