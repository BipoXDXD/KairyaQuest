import { useCallback, useState } from 'react'
import { postJson } from '../../shared/api/client'
import { describeCompletionFailure, type CompletionFailure } from './completionFailure'
import type { Mission } from './types'
import type { CompletionRegistry } from './useCompletionRegistry'

/**
 * Os estados da conclusao de UMA missao, como uniao discriminada.
 *
 * `completed` carrega a missao que a API devolveu, e nao so um "deu certo": e
 * ela que a tela passa a mostrar, com o estado e o `completed_at` do servidor.
 * `failed` carrega a traducao da falha -- mensagem e acao --, e nao o erro cru.
 */
export type CompletionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'completed'; mission: Mission }
  | { status: 'failed'; failure: CompletionFailure }

export interface UseCompleteMissionResult {
  state: CompletionState
  /** Envia a conclusao. Depois de uma falha, e tambem o "tentar de novo". */
  complete: () => void
}

/**
 * Conclui a missao `missionId` pela API, de forma idempotente.
 *
 * O `operation_id` nasce no PRIMEIRO envio e e mantido entre as tentativas: e
 * o que torna seguro repetir depois de uma falha de rede (README §7). Uma
 * chave nova a cada clique transformaria o reenvio numa conclusao nova -- a
 * segunda receberia `transicao_ilegal`, e a tela diria "ja estava concluida"
 * sobre uma conclusao que ela mesma acabou de fazer.
 *
 * A chave NAO mora aqui: mora no `registry`, que o quadro mantem acima dos
 * cartoes. Este hook e instanciado por cartao, e o "Atualizar o quadro"
 * remonta os cartoes; guardada aqui, a chave de uma tentativa com resultado
 * desconhecido morria na remontagem (pendencia 35 do HANDOFF). Por isso o
 * registro e argumento: o dono da chave e a missao, e a missao sobrevive ao
 * cartao.
 *
 * Quando a chave sai do registro, este hook decide pelo resultado:
 *
 * - **falha que se repete com a mesma chave** (`recovery: 'retry'` -- rede,
 *   5xx, 422, `code` desconhecido): a chave FICA. Nao se sabe se o servidor
 *   concluiu, e so a mesma chave torna o reenvio seguro;
 * - **`operacao_reutilizada`**: a chave sai, e o proximo envio gera outra. Com
 *   ela, toda tentativa seria recusada, e trocar e seguro porque a missao nao
 *   foi concluida por ela;
 * - **sucesso, `transicao_ilegal`, `missao_nao_encontrada`**: a chave sai,
 *   porque nao tem mais uso. Mante-la so faria o registro crescer.
 *
 * O hook tambem avisa o registro de que um POST saiu e terminou: e isso que
 * faz o "Atualizar o quadro" esperar a conclusao em andamento.
 */
export function useCompleteMission(
  missionId: number,
  registry: CompletionRegistry,
): UseCompleteMissionResult {
  const [state, setState] = useState<CompletionState>({ status: 'idle' })

  const complete = useCallback(() => {
    // Primeiro, e antes de qualquer mudanca de estado: se `operationIdFor`
    // lancar (crypto.randomUUID pode lancar em contexto inseguro), nada muda
    // -- nem o cartao vai para "Concluindo...", nem o registro conta um voo
    // que nunca vai settle. Antes desta ordem, uma excecao aqui deixava o
    // contador do registro preso em 1 para sempre (regressao medida na
    // revisao da Task 6).
    const operationId = registry.operationIdFor(missionId)
    setState({ status: 'submitting' })
    // Antes do POST, no mesmo tick: uma recarga pedida logo depois do clique
    // ja encontra esta conclusao em voo.
    registry.started()

    postJson<Mission>(`/missions/${String(missionId)}/complete`, {
      operation_id: operationId,
    })
      .then((mission) => {
        registry.release(missionId)
        setState({ status: 'completed', mission })
      })
      .catch((error: unknown) => {
        const failure = describeCompletionFailure(error)
        if (failure.recovery !== 'retry') {
          registry.release(missionId)
        }
        setState({ status: 'failed', failure })
      })
      .finally(() => {
        // Por ultimo, depois do estado final: se havia recarga esperando, ela
        // acontece aqui, e o cartao que ela remonta ja nao tem nada em voo.
        registry.settled()
      })
  }, [missionId, registry])

  return { state, complete }
}
