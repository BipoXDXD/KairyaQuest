import { useCallback, useState } from 'react'
import { postJson } from '../../shared/api/client'
import type { Mission } from '../../shared/types/mission'
import type { MissionCompletion, Reward } from '../../shared/types/reward'
import { describeCompletionFailure, type CompletionFailure } from './completionFailure'
import { describeEvidence } from './evidenceLimit'
import type { EvidenceDraft } from './types'
import type { CompletionRegistry } from './useCompletionRegistry'

/**
 * Os estados da conclusao de UMA missao, como uniao discriminada.
 *
 * `completed` carrega a missao que a API devolveu, e nao so um "deu certo": e
 * ela que a tela passa a mostrar, com o estado e o `completed_at` do servidor.
 * O `reward` vem A PARTE, e nao dentro de `mission`: e o `RewardAnnouncement`
 * quem le, e a missao guardada aqui NAO leva a chave `reward` (D16) -- ela e
 * um `Mission` de verdade, e nao o `MissionCompletion` cru da resposta.
 * `reward` pode faltar ou vir `null` (deploy defasado ou contrato violado,
 * ver `MissionCompletion`): a conclusao vale do mesmo jeito, so nao ha
 * anuncio.
 * `failed` carrega a traducao da falha -- mensagem e acao --, e nao o erro cru.
 */
export type CompletionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'completed'; mission: Mission; reward: Reward | null | undefined }
  | { status: 'failed'; failure: CompletionFailure }

export interface UseCompleteMissionResult {
  state: CompletionState
  /**
   * Envia a conclusao, com evidencia se houver rascunho. Depois de uma falha,
   * e tambem o "tentar de novo". Um rascunho que nao pode ser enviado (texto
   * vazio, link ruim) nao envia nada: a tela ja o barra no botao, e mandar a
   * conclusao SEM a evidencia que a pessoa quis dar seria trocar a entrega.
   */
  complete: (evidence?: EvidenceDraft) => void
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
 *
 * Quem precisa reagir ao sucesso -- a secao do ciclo atualiza a sequencia --
 * passa `onCompleted`; o quadro de avulsas nao passa nada.
 */
export function useCompleteMission(
  missionId: number,
  registry: CompletionRegistry,
  onCompleted?: () => void,
): UseCompleteMissionResult {
  const [state, setState] = useState<CompletionState>({ status: 'idle' })

  const complete = useCallback(
    (evidence?: EvidenceDraft) => {
      const described = evidence === undefined ? undefined : describeEvidence(evidence)
      if (described !== undefined && described.body === null) {
        return
      }

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

      postJson<MissionCompletion>(`/missions/${String(missionId)}/complete`, {
        operation_id: operationId,
        ...(described === undefined ? {} : { evidence: described.body }),
      })
        .then((completion) => {
          registry.release(missionId)
          const { reward, ...mission } = completion
          setState({ status: 'completed', mission, reward })
          // A conclusao ja esta gravada no servidor e no estado: um callback do
          // chamador que lance nao pode cair no `.catch` abaixo e virar
          // "falhou". Fica registrado, sem mexer no estado.
          try {
            onCompleted?.()
          } catch (error) {
            console.error('onCompleted lancou depois da conclusao:', error)
          }
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
    },
    [missionId, registry, onCompleted],
  )

  return { state, complete }
}
