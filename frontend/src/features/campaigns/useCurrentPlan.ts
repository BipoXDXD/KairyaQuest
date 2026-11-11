import { useCallback, useEffect, useRef, useState } from 'react'
import { requestJson } from '../../shared/api/client'
import { loadFailureFor, type LoadFailure } from '../../shared/i18n/failureText'
import { useRefreshOnReturn } from '../../shared/hooks/useRefreshOnReturn'
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
  | { status: 'error'; failure: LoadFailure }
  | { status: 'no-plan' }
  | { status: 'loaded'; plan: Plan; refreshFailed: boolean }

export interface UseCurrentPlanResult {
  state: CurrentPlanState
  /** Repete o pedido passando por "carregando": o "Tentar novamente" do erro. */
  reload: () => void
  /**
   * Atualiza em silencio, SEM passar por "carregando" (mesmo desenho do
   * `refresh` de `useCycle`). Ligado a `useRefreshOnReturn`: a aba que volta
   * a ficar visivel, ou a janela que recebe foco, chama este `refresh`.
   */
  refresh: () => void
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
  /**
   * Sequencia de pedidos, compartilhada entre a carga do efeito (montagem e
   * `reload`) e o `refresh` silencioso -- mesmo desenho e mesmo motivo do
   * `useCycle`: `visibilitychange` e `focus`
   * podem chamar `refresh()` os dois quando a aba volta, e sem esta guarda a
   * resposta mais VELHA que chegasse por ULTIMO sobrescreveria o estado com
   * dado desatualizado -- inclusive `refreshFailed`.
   *
   * `reload` incrementa a sequencia na hora, entao tambem invalida um
   * `refresh` que ja estava em voo.
   */
  const requestId = useRef(0)

  const reload = useCallback(() => {
    requestId.current += 1
    setState({ status: 'loading' })
    setAttempt((anterior) => anterior + 1)
  }, [])

  useEffect(() => {
    const id = (requestId.current += 1)
    const controller = new AbortController()
    requestJson<CurrentPlan>('/plans/current', controller.signal)
      .then(({ plan }) => {
        if (requestId.current !== id) {
          return
        }
        setState(
          plan === null ? { status: 'no-plan' } : { status: 'loaded', plan, refreshFailed: false },
        )
      })
      .catch((error: unknown) => {
        // Um pedido que NOS cancelamos (StrictMode, troca de tela) nao e falha
        // para mostrar: sem a guarda, a rejeicao tardia dele sobrescreveria a
        // trilha boa com o estado de erro.
        if (controller.signal.aborted || requestId.current !== id) {
          return
        }
        setState({ status: 'error', failure: loadFailureFor(error) })
      })
    return () => {
      controller.abort()
    }
  }, [attempt])

  const refresh = useCallback(() => {
    const id = (requestId.current += 1)
    requestJson<CurrentPlan>('/plans/current')
      .then(({ plan }) => {
        if (requestId.current !== id) {
          return
        }
        setState(
          plan === null ? { status: 'no-plan' } : { status: 'loaded', plan, refreshFailed: false },
        )
      })
      .catch((error: unknown) => {
        if (requestId.current !== id) {
          return
        }
        // Com o dado na tela, a falha so o marca como possivelmente
        // desatualizado. Com a tela ainda em "carregando", este refresh
        // invalidou a carga inicial (a resposta dela sera descartada pela
        // checagem de `id`), entao ninguem mais tiraria a tela dali: vira
        // ERRO, com o "Tentar novamente" (antes, a trilha ficava em "Consultando..."
        // para sempre). Um reload que comecou depois deste refresh ja teria
        // voltado na checagem de `id` acima.
        setState((atual) =>
          atual.status === 'loaded'
            ? { ...atual, refreshFailed: true }
            : atual.status === 'loading'
              ? { status: 'error', failure: loadFailureFor(error) }
              : atual,
        )
      })
  }, [])

  // A aba que volta a ficar visivel, ou a janela que recebe foco, atualiza a
  // trilha em silencio: sem isso, a aba aberta na virada do dia mostraria o
  // dia anterior ate recarregar.
  useRefreshOnReturn(refresh)

  return { state, reload, refresh }
}
