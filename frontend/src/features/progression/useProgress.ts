import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, requestJson } from '../../shared/api/client'
import { useRefreshOnReturn } from '../../shared/hooks/useRefreshOnReturn'
import type { Progress } from './types'

/**
 * Os estados do painel de progresso, como uniao discriminada (mesmo desenho
 * de `useCycle`).
 *
 * `refreshFailed` existe por causa do `refresh` (decisao P9 do plano do B):
 * a atualizacao silenciosa que falha nao desmonta o que esta na tela, mas a
 * tela precisa dizer que o progresso pode estar velho.
 */
export type ProgressState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; progress: Progress; refreshFailed: boolean }

export interface UseProgressResult {
  state: ProgressState
  /** Recarrega passando por "carregando". E o "Tentar novamente" do erro. */
  reload: () => void
  /**
   * Atualiza em silencio, SEM passar por "carregando": e o que roda depois de
   * uma conclusao, para o progresso mudar sem desmontar o painel.
   */
  refresh: () => void
}

function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Falha inesperada ao carregar o progresso.'
}

export function useProgress(): UseProgressResult {
  const [state, setState] = useState<ProgressState>({ status: 'loading' })
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
   * pela ordem de PEDIDO (achado da revisao da Task 5).
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
    requestJson<Progress>('/progress', controller.signal)
      .then((progress) => {
        if (requestId.current !== id) {
          return
        }
        setState({ status: 'loaded', progress, refreshFailed: false })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId.current !== id) {
          return
        }
        setState({ status: 'error', message: messageFor(error) })
      })
    return () => {
      controller.abort()
    }
  }, [attempt])

  const refresh = useCallback(() => {
    const id = (requestId.current += 1)
    requestJson<Progress>('/progress')
      .then((progress) => {
        if (requestId.current !== id) {
          return
        }
        setState({ status: 'loaded', progress, refreshFailed: false })
      })
      .catch((error: unknown) => {
        if (requestId.current !== id) {
          return
        }
        // Com o dado na tela, a falha so o marca como possivelmente
        // desatualizado. Com a tela ainda em "carregando", este refresh
        // invalidou a carga inicial (a resposta dela sera descartada pela
        // checagem de `id`), entao ninguem mais tiraria a tela dali: vira
        // ERRO, com o "Tentar novamente" (achado I1 da revisao final do
        // Incremento C, Ruling R12 -- antes, o QG ficava em "Consultando..."
        // para sempre). Um reload que comecou depois deste refresh ja teria
        // voltado na checagem de `id` acima.
        setState((atual) =>
          atual.status === 'loaded'
            ? { ...atual, refreshFailed: true }
            : atual.status === 'loading'
              ? { status: 'error', message: messageFor(error) }
              : atual,
        )
      })
  }, [])

  // A aba que volta a ficar visivel, ou a janela que recebe foco, atualiza o
  // progresso em silencio -- mesmo motivo de `useCycle`.
  useRefreshOnReturn(refresh)

  return { state, reload, refresh }
}
