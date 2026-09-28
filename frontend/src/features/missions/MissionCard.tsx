import { useEffect, useId, useRef, useState } from 'react'
import { formatDeadline } from '../../shared/lib/deadline'
import { MISSION_STATE_LABELS, type Mission } from '../../shared/types/mission'
import { EvaluationPanel } from './EvaluationPanel'
import { EvidenceForm } from './EvidenceForm'
import { describeEvidence, MAX_EVIDENCE_LENGTH, stripEnds } from './evidenceLimit'
import { RewardAnnouncement } from './RewardAnnouncement'
import type { EvidenceDraft } from './types'
import { useCompleteMission, type CompletionState } from './useCompleteMission'
import type { CompletionRegistry } from './useCompletionRegistry'

const CARD_CLASS =
  'rounded-lg border border-slate-700/70 bg-slate-900/60 p-4 shadow-sm ' +
  'focus-within:ring-2 focus-within:ring-emerald-400'

const COMPLETE_BUTTON_CLASS =
  'rounded border border-emerald-400/60 px-3 py-1 text-sm font-medium text-emerald-100 ' +
  'hover:bg-emerald-900/50 focus-visible:ring-2 focus-visible:ring-emerald-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

const RELOAD_BUTTON_CLASS =
  'rounded border border-slate-400/60 px-3 py-1 text-sm font-medium text-slate-100 ' +
  'hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

/** O texto do "Atualizar o quadro" enquanto espera uma conclusao em voo. */
const RELOAD_WAITING_LABEL = 'Aguardando a conclusão em andamento…'

/** O texto do botao de concluir em cada estado em que ele aparece. */
function completeLabel(completion: CompletionState): string {
  if (completion.status === 'submitting') {
    return 'Concluindo…'
  }
  return completion.status === 'failed' ? 'Tentar de novo' : 'Concluir'
}

/** O que a regiao viva anuncia. Vazio quando nao ha nada acontecendo. */
function statusText(completion: CompletionState): string {
  if (completion.status === 'submitting') {
    return 'Concluindo a missão…'
  }
  return completion.status === 'completed' ? 'Missão concluída.' : ''
}

/**
 * Por que o rascunho em uso nao pode sair, ou `null` se pode (ou nao ha
 * rascunho). O texto mora JUNTO do Concluir, fora do disclosure: com o
 * formulario recolhido, o botao desabilitado continua com o motivo a vista e
 * ligado por `aria-describedby` (fix-1 da Task 7).
 */
function blockedReason(draft: EvidenceDraft): string | null {
  const inUse = stripEnds(draft.text) !== '' || stripEnds(draft.link) !== ''
  const described = describeEvidence(draft)
  if (!inUse || described.sendable) {
    return null
  }
  if (described.linkError !== null) {
    return `Corrija o link da evidência para concluir. ${described.linkError}`
  }
  if (stripEnds(draft.text) === '') {
    return 'Conte o que você fez para concluir com o link.'
  }
  return `Encurte o texto da evidência para concluir: o limite é de ${String(MAX_EVIDENCE_LENGTH)} caracteres.`
}

/**
 * O botao Concluir e o que a tela diz durante e depois da conclusao.
 *
 * Cada estado, decidido de proposito:
 *
 * - **parado**: "Concluir", com o nome acessivel completando QUAL missao.
 * - **enviando**: o botao fica desabilitado e diz "Concluindo…", e a regiao
 *   viva anuncia. Desabilitar nao e so estetica: e o que impede o clique
 *   duplo de mandar dois pedidos.
 * - **concluida**: o botao some, porque `concluida` e terminal (A5), e a
 *   regiao viva anuncia "Missão concluída.". O rotulo de estado do cartao ja
 *   mostra a missao que a API devolveu.
 * - **falha que se repete** (rede, erro sem code, chave gasta): o aviso e o
 *   botao vira "Tentar de novo" -- com a mesma chave, ou com uma nova, quem
 *   decide e o hook.
 * - **falha que nao se repete** (ja concluida, nao existe mais): o aviso, e o
 *   `reloadLabel` no lugar do Concluir. Repetir so daria o mesmo erro;
 *   recarregar mostra o estado de verdade. O rotulo e "Atualizar o quadro" por
 *   padrao, mas quem usa o cartao FORA do quadro de avulsas pode pedir outro
 *   (m5): a `CycleSection` passa "Atualizar a missão de hoje", porque o clique
 *   ali nao atualiza um "quadro" -- recarrega o ciclo.
 * - **esperando o quadro**: o `reloadLabel` pedido com outra conclusao em voo
 *   fica desabilitado e diz "Aguardando a conclusão em andamento…"; o quadro
 *   recarrega sozinho quando ela termina (`useCompletionRegistry`). Quem
 *   anuncia a espera e a regiao viva do QUADRO, e nao a deste cartao: a espera
 *   e do quadro inteiro, e varios cartoes com o botao anunciariam o mesmo
 *   texto varias vezes.
 *
 * A regiao `role="status"` existe desde o primeiro render, vazia: um leitor de
 * tela so anuncia mudancas numa regiao viva que ja estava no documento.
 *
 * O nome acessivel do botao completa QUAL missao ele conclui, num `sr-only`:
 * com varias missoes no quadro, "Concluir" sozinho seria o mesmo nome em todos
 * os botoes. O espaco entre o rotulo e o `span` fica FORA dele, no `{' '}`:
 * escrito dentro do `span`, o calculo do nome acessivel do jsdom o descartava
 * e o nome saia "Concluira missão" (medido).
 */
function CompletionControls({
  mission,
  completion,
  onComplete,
  blocked,
  onReload,
  reloadWaiting,
  reloadLabel,
}: {
  mission: Mission
  completion: CompletionState
  onComplete: () => void
  /** Por que o rascunho da evidencia em uso nao pode ser enviado, ou `null`. */
  blocked: string | null
  onReload: () => void
  reloadWaiting: boolean
  reloadLabel: string
}) {
  const blockedId = useId()
  // Missao que ja veio concluida do quadro: nada a oferecer nem a anunciar. O
  // rotulo de estado ja diz "Concluída".
  if (mission.state === 'concluida' && completion.status === 'idle') {
    return null
  }

  const failure = completion.status === 'failed' ? completion.failure : null
  const canComplete = mission.state !== 'concluida' && failure?.recovery !== 'refresh'

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {canComplete && (
        <button
          type="button"
          data-testid="mission-complete"
          disabled={completion.status === 'submitting' || blocked !== null}
          aria-describedby={blocked === null ? undefined : blockedId}
          onClick={onComplete}
          className={COMPLETE_BUTTON_CLASS}
        >
          {completeLabel(completion)}{' '}
          <span className="sr-only">a missão: {mission.instructions}</span>
        </button>
      )}
      {canComplete && blocked !== null && (
        <p id={blockedId} data-testid="mission-complete-blocked" className="text-sm text-amber-200">
          {blocked}
        </p>
      )}
      {failure?.recovery === 'refresh' && (
        <button
          type="button"
          data-testid="mission-reload"
          disabled={reloadWaiting}
          onClick={onReload}
          className={RELOAD_BUTTON_CLASS}
        >
          {reloadWaiting ? RELOAD_WAITING_LABEL : reloadLabel}
        </button>
      )}
      <div
        role="status"
        data-testid="mission-completion-status"
        className="text-sm text-emerald-300"
      >
        <p data-testid="mission-completion-text">{statusText(completion)}</p>
        {/* `!= null` de proposito: cobre `reward` ausente E `reward: null`. */}
        {completion.status === 'completed' && completion.reward != null && (
          <RewardAnnouncement reward={completion.reward} />
        )}
      </div>
      {failure !== null && (
        <p
          role="alert"
          data-testid="mission-completion-error"
          className="w-full text-sm text-red-300"
        >
          {failure.message}
        </p>
      )}
    </div>
  )
}

export function MissionCard({
  mission: listed,
  registry,
  onReload,
  reloadWaiting,
  onCompleted,
  onRewarded,
  titleLevel = 3,
  reloadLabel = 'Atualizar o quadro',
}: {
  mission: Mission
  registry: CompletionRegistry
  onReload: () => void
  reloadWaiting: boolean
  onCompleted?: () => void
  /**
   * O bonus da avaliacao da Tifa foi creditado. Quem usa o cartao liga ao
   * MESMO aviso da conclusao (P3 do D): o saldo mudou, o painel de progresso
   * atualiza.
   */
  onRewarded?: () => void
  /**
   * O nivel do titulo do cartao (m3). Padrao `3` (`<h3>`), como sempre foi no
   * quadro de avulsas. A `CycleSection` pede `4` para o cartao DENTRO da
   * especial: sem isso, o `<h3>` do titulo da secao ("Missão especial — bônus
   * da sequência") e o `<h3>` do titulo do cartao colidiam no mesmo nivel,
   * dentro da mesma secao.
   */
  titleLevel?: 3 | 4
  /**
   * O texto do botao de recuperacao (m5). Padrao "Atualizar o quadro", como
   * sempre foi. Ver o comentario de `CompletionControls` acima.
   */
  reloadLabel?: string
}) {
  const { state: completion, complete } = useCompleteMission(listed.id, registry, onCompleted)
  // O rascunho da evidencia (E17): lido do REGISTRO na montagem e gravado nele
  // a cada mudanca. O reload do quadro remonta os cartoes; guardado so aqui, o
  // texto morreria com eles, como a chave de operacao morria (pendencia 35).
  // O `useState` fica porque o registro e um `useRef` -- mudar o rascunho la
  // nao renderiza nada.
  const [draft, setDraft] = useState<EvidenceDraft>(() => registry.draftFor(listed.id))
  const changeDraft = (next: EvidenceDraft) => {
    setDraft(next)
    registry.saveDraft(listed.id, next)
  }
  // Rascunho em uso (texto OU link) que nao pode sair barra o Concluir:
  // concluir sem ele trocaria a entrega que a pessoa quis dar (Task 6). Sem
  // texto nenhum, sai a conclusao de sempre, sem a chave `evidence`.
  const draftInUse = stripEnds(draft.text) !== '' || stripEnds(draft.link) !== ''
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  // Depois do sucesso, o cartao mostra a missao que a API DEVOLVEU. Ela nao
  // fica velha: `concluida` e terminal (A5), e a proxima leitura do quadro --
  // o "Atualizar", ou o "Tentar novamente" da lista -- monta cartoes novos.
  const mission = completion.status === 'completed' ? completion.mission : listed
  const HeadingTag = titleLevel === 4 ? 'h4' : 'h3'
  // Ao concluir, o Concluir (e o formulario) saem do documento, e o foco que
  // estava neles cairia no `body`: quem navega pelo teclado ou por leitor de
  // tela recomecaria a pagina do topo. Vai para o titulo do cartao -- o painel
  // que aparece esta logo abaixo dele. So se o foco REALMENTE se perdeu: se a
  // pessoa ja foi para outro lugar enquanto o pedido voava, nao se rouba.
  const completed = completion.status === 'completed'
  useEffect(() => {
    if (completed && document.activeElement === document.body) {
      titleRef.current?.focus()
    }
  }, [completed])
  // O formulario so existe enquanto ha o que concluir: nao na concluida, nem
  // depois de uma falha que pede atualizar (a missao ja mudou no servidor).
  const offersEvidence =
    mission.state !== 'concluida' &&
    !(completion.status === 'failed' && completion.failure.recovery === 'refresh')

  return (
    <li data-testid="mission-item" data-mission-id={mission.id} className={CARD_CLASS}>
      <div className="flex items-start justify-between gap-4">
        <HeadingTag
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          data-testid="mission-instructions"
          className="text-base font-semibold text-slate-100 focus:outline-none"
        >
          {mission.instructions}
        </HeadingTag>
        {/* O estado vem como rotulo em texto, nao como cor: o README §7 exige
            aviso alem da cor. */}
        <span
          data-testid="mission-state"
          className="shrink-0 rounded-full border border-emerald-400/50 px-2 py-0.5 text-xs font-medium text-emerald-300"
        >
          {MISSION_STATE_LABELS[mission.state]}
        </span>
      </div>

      <p data-testid="mission-completion-criterion" className="mt-2 text-sm text-slate-300">
        <span className="text-slate-400">Critério de conclusão: </span>
        {mission.completion_criterion}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-300 sm:grid-cols-4">
        <dt className="text-slate-400">Prazo</dt>
        <dd>
          <time data-testid="mission-deadline" dateTime={mission.deadline}>
            {formatDeadline(mission.deadline)}
          </time>
        </dd>

        <dt className="text-slate-400">Dificuldade</dt>
        {/* O "5" espelha `DIFICULDADE_MAXIMA`, em
            src/focusquest/modules/missions/schemas.py. Nada amarra os dois
            automaticamente (isso pediria gerar o tipo a partir do OpenAPI):
            quem mudar um tem de mudar o outro, e `types.ts` repete o teto. A
            terceira copia e a do cartao de proposta da Tifa
            (`features/tutoring/ProposalCard.tsx`). */}
        <dd data-testid="mission-difficulty">{mission.difficulty} de 5</dd>

        <dt className="text-slate-400">Estimativa</dt>
        <dd data-testid="mission-estimated-minutes">{mission.estimated_minutes} min</dd>

        <dt className="text-slate-400">Recompensa</dt>
        <dd data-testid="mission-xp">{mission.xp} XP</dd>

        {/* `actual_duration_minutes` e computado pela API e vem nulo enquanto
            faltar o inicio ou a conclusao. Nulo significa "ainda nao existe",
            e nao "zero minuto": mostrar "0 min" seria afirmar o que ninguem
            mediu. */}
        {mission.actual_duration_minutes !== null && (
          <>
            <dt className="text-slate-400">Duração real</dt>
            <dd data-testid="mission-actual-duration">{mission.actual_duration_minutes} min</dd>
          </>
        )}
      </dl>

      {offersEvidence && (
        <EvidenceForm
          draft={draft}
          onChange={changeDraft}
          disabled={completion.status === 'submitting'}
          retryPending={completion.status === 'failed' && completion.failure.recovery === 'retry'}
          describedBy={titleId}
        />
      )}

      <CompletionControls
        mission={mission}
        completion={completion}
        onComplete={() => {
          complete(draftInUse ? draft : undefined)
        }}
        blocked={blockedReason(draft)}
        onReload={onReload}
        reloadWaiting={reloadWaiting}
        reloadLabel={reloadLabel}
      />

      {mission.state === 'concluida' && (
        <EvaluationPanel
          mission={mission}
          onRewarded={onRewarded}
          onReload={onReload}
          reloadLabel={reloadLabel}
          describedBy={titleId}
        />
      )}
    </li>
  )
}
