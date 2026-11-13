import { useCallback, useEffect, useRef, useState } from 'react'
import { requestJson } from '../../shared/api/client'
import { loadFailureFor, type LoadFailure } from '../../shared/i18n/failureText'
import type { Mission } from '../../shared/types/mission'

/**
 * Os quatro estados de tela que o README §7 exige, como uniao discriminada.
 *
 * Sao quatro membros e nao um objeto com `loading`, `error` e `missions`
 * simultaneos de proposito: o objeto permitiria `loading: true` junto de
 * `error`, e a tela teria de escolher qual acreditar. Aqui `empty` e `error`
 * sao membros SEPARADOS porque pedem acoes opostas da pessoa -- "voce nao tem
 * missoes" convida a criar uma; "nao consegui falar com o servidor" convida a
 * tentar de novo -- e unifica-los produziria dois caminhos indistinguiveis.
 */
export type MissionsState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; failure: LoadFailure }
  | { status: 'loaded'; missions: Mission[] }

/**
 * Quantas missoes cada pagina do `GET /api/missions` traz (#182): o
 * `TAMANHO_PADRAO_DA_PAGINA` do backend, preso a este valor por
 * `tests/unit/test_tamanho_da_pagina.py`. A primeira pagina vai sem
 * parametro (e recebe o padrao); as seguintes pedem o tamanho explicitamente.
 */
export const MISSIONS_PAGE_SIZE = 50

/**
 * O que existe depois da ultima missao carregada. Separado de `MissionsState`
 * porque falhar ao trazer MAIS nao apaga o que ja esta na tela: a lista
 * continua `loaded`, e so o rodape mostra o erro e a nova tentativa.
 *
 * `none` tambem e o estado fora de `loaded`: sem lista, nao ha "mais".
 */
export type MoreMissionsState =
  | { status: 'none' }
  | { status: 'available' }
  | { status: 'loading' }
  | { status: 'error'; failure: LoadFailure }

export interface UseMissionsResult {
  state: MissionsState
  more: MoreMissionsState
  /** Repete o pedido. E o que torna o estado de erro acionavel. */
  reload: () => void
  /** Pede a pagina depois da ultima missao carregada. */
  loadMore: () => void
}

/**
 * Pagina mais curta que o tamanho pedido e a ultima. Uma pagina exatamente
 * cheia pode ser a ultima tambem: o "carregar mais" seguinte volta vazio e
 * so entao some -- um pedido a mais, em troca de um contrato sem envelope.
 */
function moreAfter(page: Mission[]): MoreMissionsState {
  return page.length === MISSIONS_PAGE_SIZE ? { status: 'available' } : { status: 'none' }
}

/**
 * O caminho da pagina depois de `after`: o tamanho e o cursor
 * `(deadline, id)` da ultima missao recebida, a chave da ordenacao no
 * backend. `URLSearchParams` codifica o `+` de um offset, que cru viraria
 * espaco.
 */
function nextPagePath(after: Mission): string {
  const params = new URLSearchParams({
    limit: String(MISSIONS_PAGE_SIZE),
    after_deadline: after.deadline,
    after_id: String(after.id),
  })
  return `/missions?${params.toString()}`
}

/**
 * Carrega as missoes do Quartel-General, uma pagina por vez (#182): a
 * primeira no carregamento e na recarga, as seguintes por `loadMore`. A
 * recarga volta a primeira pagina.
 *
 * O recurso e `/missions` sem barra final: `/api/missions/` responde 307.
 */
export function useMissions(): UseMissionsResult {
  const [state, setState] = useState<MissionsState>({ status: 'loading' })
  const [more, setMore] = useState<MoreMissionsState>({ status: 'none' })
  const [attempt, setAttempt] = useState(0)
  // Cancelar a rede não invalida uma resposta já em processamento. A geração
  // muda na recarga, antes do próximo efeito, e na limpeza (inclusive StrictMode).
  const requestId = useRef(0)

  // O volta-a-carregar mora AQUI, e nao no corpo do efeito, por duas razoes
  // que coincidem. A primeira e de regra: `reload` e uma acao da pessoa, e o
  // estado de carregamento e a resposta imediata a ela. A segunda foi medida --
  // um `setState({ status: 'loading' })` sincrono dentro do `useEffect` faz o
  // `react-hooks/set-state-in-effect` reprovar o `npm run lint`, porque
  // encadeia um render a mais a cada execucao do efeito. O estado inicial ja
  // nasce 'loading', entao nao falta nada no primeiro carregamento.
  const reload = useCallback(() => {
    requestId.current += 1
    setState({ status: 'loading' })
    setMore({ status: 'none' })
    setAttempt((anterior) => anterior + 1)
  }, [])

  // A geracao NAO muda aqui: a pagina seguinte pertence a lista corrente, e
  // uma recarga (ou a desmontagem) no meio do pedido a descarta pela mesma
  // guarda do carregamento inicial. Sem `AbortController` proprio: o pedido
  // descartado so termina no prazo do cliente, sem efeito na tela.
  const loadMore = useCallback(() => {
    if (state.status !== 'loaded') {
      return
    }
    const id = requestId.current
    const loaded = state.missions
    // `loaded` nunca e vazio: lista vazia e o estado `empty`, nao `loaded`.
    const last = loaded[loaded.length - 1]
    setMore({ status: 'loading' })
    requestJson<Mission[]>(nextPagePath(last))
      .then((page) => {
        if (requestId.current !== id) {
          return
        }
        // O cursor `(deadline, id)` acompanha o prazo: uma missao reagendada
        // para depois dele entre dois pedidos volta na pagina seguinte. A
        // versao da pagina e a mais nova (prazo atual e posicao certa na
        // ordem), entao a copia antiga sai.
        const fresh = new Set(page.map((mission) => mission.id))
        const kept = loaded.filter((mission) => !fresh.has(mission.id))
        setState({ status: 'loaded', missions: [...kept, ...page] })
        setMore(moreAfter(page))
      })
      .catch((error: unknown) => {
        if (requestId.current !== id) {
          return
        }
        setMore({ status: 'error', failure: loadFailureFor(error) })
      })
  }, [state])

  useEffect(() => {
    const id = (requestId.current += 1)
    const controller = new AbortController()

    requestJson<Mission[]>('/missions', controller.signal)
      .then((missions) => {
        if (controller.signal.aborted || requestId.current !== id) {
          return
        }
        setState(
          missions.length === 0 ? { status: 'empty' } : { status: 'loaded', missions: missions },
        )
        setMore(moreAfter(missions))
      })
      .catch((error: unknown) => {
        // Um pedido que NOS cancelamos nao e uma falha para mostrar. Sem esta
        // guarda, a limpeza do efeito (StrictMode, ou uma troca de tela)
        // sobrescreveria a resposta boa com o estado de erro.
        if (controller.signal.aborted || requestId.current !== id) {
          return
        }
        setState({ status: 'error', failure: loadFailureFor(error) })
      })

    return () => {
      requestId.current += 1
      controller.abort()
    }
    // `attempt` e a unica dependencia: ele muda so por `reload`, e e o que
    // reexecuta o pedido.
  }, [attempt])

  return { state, more, reload, loadMore }
}
