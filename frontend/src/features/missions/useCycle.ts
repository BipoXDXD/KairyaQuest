import { useCallback, useEffect, useRef, useState } from 'react'
import { requestJson } from '../../shared/api/client'
import { loadFailureFor, type LoadFailure } from '../../shared/i18n/failureText'
import { useRefreshOnReturn } from '../../shared/hooks/useRefreshOnReturn'
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
  | { status: 'error'; failure: LoadFailure }
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

/**
 * A falha da carga, para a tela. O `ApiError` vira o texto do catalogo pelo
 * `kind`; sua `message` e de depuracao e nunca chega a tela. A leitura nao tem
 * erro de dominio com `code`: o que chega e rede ou servidor, e qualquer outra
 * coisa e defeito nosso, sem mensagem propria que ajude alguem.
 */
function failureFor(error: unknown): LoadFailure {
  return loadFailureFor(error, 'Falha inesperada ao carregar o ciclo.')
}

export function useCycle(): UseCycleResult {
  const [state, setState] = useState<CycleState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  /**
   * Sequencia de pedidos, compartilhada entre a carga do efeito (montagem e
   * `reload`) e o `refresh` silencioso. Cada pedido captura o numero no
   * INICIO (`const id = ...`); a resposta so mexe no estado se `id` ainda for
   * o mais recente NO MOMENTO em que ela chega.
   *
   * Existe porque `visibilitychange` e `focus` podem chamar `refresh()` os
   * dois quando a aba volta (nenhuma garantia do navegador de que so um
   * dispara): duas chamadas ficam em voo ao mesmo tempo, e `refresh` nunca
   * teve `AbortController` (motivo: a tela nao pode voltar para
   * "carregando" por causa dele, e abortar a REDE nao e o mesmo que ignorar
   * a RESPOSTA). Sem esta guarda, a resposta mais VELHA que chegasse por
   * ULTIMO sobrescreveria o estado com dado desatualizado -- inclusive
   * `refreshFailed`, que ligaria ou desligaria pela ordem de CHEGADA, e nao
   * pela ordem de PEDIDO.
   *
   * Um `reload` tambem invalida um `refresh` em voo: `reload` incrementa a
   * sequencia na hora (antes mesmo do efeito rodar), entao a resposta de um
   * `refresh` que ja estava a caminho quando o `reload` foi pedido nunca
   * mais bate com o `id` corrente.
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
    requestJson<Cycle>('/cycle', controller.signal)
      .then((cycle) => {
        if (requestId.current !== id) {
          return
        }
        setState({ status: 'loaded', cycle, refreshFailed: false })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId.current !== id) {
          return
        }
        setState({ status: 'error', failure: failureFor(error) })
      })
    return () => {
      controller.abort()
    }
  }, [attempt])

  const refresh = useCallback(() => {
    const id = (requestId.current += 1)
    requestJson<Cycle>('/cycle')
      .then((cycle) => {
        if (requestId.current !== id) {
          return
        }
        setState({ status: 'loaded', cycle, refreshFailed: false })
      })
      .catch((error: unknown) => {
        if (requestId.current !== id) {
          return
        }
        // Com o dado na tela, a falha so o marca como possivelmente
        // desatualizado. Com a tela ainda em "carregando", este refresh
        // invalidou a carga inicial (a resposta dela sera descartada pela
        // checagem de `id`), entao ninguem mais tiraria a tela dali: vira
        // ERRO, com o "Tentar novamente" (antes, o QG ficava em "Consultando..."
        // para sempre). Um reload que comecou depois deste refresh ja teria
        // voltado na checagem de `id` acima.
        setState((atual) =>
          atual.status === 'loaded'
            ? { ...atual, refreshFailed: true }
            : atual.status === 'loading'
              ? { status: 'error', failure: failureFor(error) }
              : atual,
        )
      })
  }, [])

  // A aba que volta a ficar visivel, ou a janela que recebe foco, atualiza o
  // ciclo em silencio: sem isso, a aba aberta na virada do dia mostraria o
  // dia anterior ate recarregar.
  useRefreshOnReturn(refresh)

  return { state, reload, refresh }
}
