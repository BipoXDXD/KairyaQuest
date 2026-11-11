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

export interface UseMissionsResult {
  state: MissionsState
  /** Repete o pedido. E o que torna o estado de erro acionavel. */
  reload: () => void
}

/**
 * A falha da carga, para a tela. O `ApiError` vira o texto do catalogo pelo
 * `kind`; sua `message` e de depuracao e nunca chega a tela. A leitura nao tem
 * erro de dominio com `code`: o que chega e rede ou servidor, e qualquer outra
 * coisa e defeito nosso, sem mensagem propria que ajude alguem.
 */
function failureFor(error: unknown): LoadFailure {
  return loadFailureFor(error, 'Falha inesperada ao carregar as missões.')
}

/**
 * Carrega as missoes do Quartel-General.
 *
 * O recurso e `/missions` sem barra final: `/api/missions/` responde 307.
 */
export function useMissions(): UseMissionsResult {
  const [state, setState] = useState<MissionsState>({ status: 'loading' })
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
    setAttempt((anterior) => anterior + 1)
  }, [])

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
      })
      .catch((error: unknown) => {
        // Um pedido que NOS cancelamos nao e uma falha para mostrar. Sem esta
        // guarda, a limpeza do efeito (StrictMode, ou uma troca de tela)
        // sobrescreveria a resposta boa com o estado de erro.
        if (controller.signal.aborted || requestId.current !== id) {
          return
        }
        setState({ status: 'error', failure: failureFor(error) })
      })

    return () => {
      requestId.current += 1
      controller.abort()
    }
    // `attempt` e a unica dependencia: ele muda so por `reload`, e e o que
    // reexecuta o pedido.
  }, [attempt])

  return { state, reload }
}
