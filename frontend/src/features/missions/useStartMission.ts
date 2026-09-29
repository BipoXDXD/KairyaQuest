import { useCallback, useRef, useState } from 'react'
import { postJson } from '../../shared/api/client'
import type { Mission } from '../../shared/types/mission'
import { describeStartFailure, type StartFailure } from './startFailure'
import type { CompletionRegistry } from './useCompletionRegistry'

/**
 * Os estados do Iniciar de UMA missao, como uniao discriminada (mesmo desenho
 * de `CompletionState`).
 *
 * `started` carrega a missao que a API devolveu, e nao so um "deu certo": e ela
 * que a tela passa a mostrar, com `em_andamento` e o `started_at` do servidor.
 * `failed` carrega a traducao da falha -- mensagem e acao --, e nao o erro cru.
 */
export type StartState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'started'; mission: Mission }
  | { status: 'failed'; failure: StartFailure }

export interface UseStartMissionResult {
  state: StartState
  /**
   * Envia o Iniciar. Depois de uma falha, e tambem o "tentar de novo". Com um
   * envio em voo, nao faz nada: um segundo POST com a mesma chave so devolveria
   * o mesmo resultado, e o estado do primeiro seria atropelado.
   */
  start: () => void
}

/**
 * Inicia a missao `missionId` pela API, de forma idempotente (F2).
 *
 * A chave (`operation_id`) mora no `registry`, por missao E por tipo
 * (`actionKeyFor(missionId, 'start')`): o quadro a mantem acima dos cartoes, e a
 * remontagem do "Atualizar o quadro" nao a perde (pendencia 35); e a do Concluir
 * e outra, porque a UNIQUE do banco e sobre a chave sozinha.
 *
 * Quando a chave sai do registro, este hook decide pelo resultado:
 *
 * - **falha que se repete com a mesma chave** (`recovery: 'retry'` -- rede, 5xx,
 *   `code` desconhecido): a chave FICA. Nao se sabe se o servidor iniciou, e so
 *   a mesma chave torna o reenvio seguro;
 * - **sucesso e qualquer outra falha** (`refresh`, `retry-with-new-operation`):
 *   a chave SAI. Nao tem mais uso, ou esta gasta e seria recusada para sempre.
 *
 * O hook tambem avisa o registro de que um POST saiu e terminou: e isso que faz
 * o "Atualizar o quadro" esperar o Iniciar em andamento.
 *
 * Quem precisa reagir ao sucesso passa `onStarted`.
 */
export function useStartMission(
  missionId: number,
  registry: CompletionRegistry,
  onStarted?: () => void,
): UseStartMissionResult {
  const [state, setState] = useState<StartState>({ status: 'idle' })
  // Ref, e nao o `state`: dois cliques no mesmo tick leriam o mesmo `idle`.
  const inFlight = useRef(false)

  const start = useCallback(() => {
    if (inFlight.current) {
      return
    }
    // Primeiro, e antes de qualquer mudanca de estado: se `actionKeyFor` lancar
    // (crypto.randomUUID pode lancar em contexto inseguro), nada muda -- nem o
    // cartao vai para "Iniciando...", nem o registro conta um voo que nunca vai
    // settle.
    const operationId = registry.actionKeyFor(missionId, 'start')
    inFlight.current = true
    setState({ status: 'submitting' })
    // Antes do POST, no mesmo tick: uma recarga pedida logo depois do clique ja
    // encontra este Iniciar em voo.
    registry.started()

    postJson<Mission>(`/missions/${String(missionId)}/start`, { operation_id: operationId })
      .then((mission) => {
        registry.releaseActionKey(missionId, 'start')
        setState({ status: 'started', mission })
        // O inicio ja esta gravado no servidor e no estado: um callback do
        // chamador que lance nao pode cair no `.catch` abaixo e virar "falhou".
        try {
          onStarted?.()
        } catch (error) {
          console.error('onStarted lancou depois do inicio:', error)
        }
      })
      .catch((error: unknown) => {
        const failure = describeStartFailure(error)
        if (failure.recovery !== 'retry') {
          registry.releaseActionKey(missionId, 'start')
        }
        setState({ status: 'failed', failure })
      })
      .finally(() => {
        inFlight.current = false
        // Por ultimo, depois do estado final: se havia recarga esperando, ela
        // acontece aqui, e o cartao que ela remonta ja nao tem nada em voo.
        registry.settled()
      })
  }, [missionId, registry, onStarted])

  return { state, start }
}
