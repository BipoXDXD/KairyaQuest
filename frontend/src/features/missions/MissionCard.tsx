import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { formatDeadline } from '../../shared/lib/deadline'
import { MAX_DIFFICULTY, MISSION_STATE_LABELS, type Mission } from '../../shared/types/mission'
import { EvaluationPanel } from './EvaluationPanel'
import { EvidenceForm } from './EvidenceForm'
import { describeEvidence, MAX_EVIDENCE_LENGTH, stripEnds, type LinkError } from './evidenceLimit'
import { linkErrorText } from './evidenceText'
import { RELOAD_WAITING_LABEL } from './reloadWaiting'
import { RescheduleForm } from './RescheduleForm'
import { RescheduleHistory } from './RescheduleHistory'
import { RewardAnnouncement } from './RewardAnnouncement'
import type { EvidenceDraft, OpenReschedule } from './types'
import { completionEvents, sfxForCompletion, useKairya } from '../kairya'
import {
  useCompleteMission,
  type CompletionOutcome,
  type CompletionState,
} from './useCompleteMission'
import type { CompletionRegistry } from './useCompletionRegistry'
import { useRescheduleMission, type RescheduleState } from './useRescheduleMission'
import { useStartMission, type StartState } from './useStartMission'
import { useAudio } from '../../shared/audio/useAudio'
import { FailureMessage } from '../../shared/i18n/FailureMessage'
import type { FailureText } from '../../shared/i18n/failureText'
import type { MessageKey } from '../../shared/i18n/catalog'
import { useLocale } from '../../shared/i18n/useLocale'
import { useT, type Translate } from '../../shared/i18n/useT'

const CARD_CLASS =
  'rpg-mission-card min-w-0 wrap-anywhere rounded-lg border border-slate-700/70 bg-slate-900/60 p-4 shadow-sm ' +
  'focus-within:ring-2 focus-within:ring-emerald-400'

const COMPLETE_BUTTON_CLASS =
  'rounded border border-emerald-400/60 px-3 py-1 text-sm font-medium text-emerald-100 ' +
  'hover:bg-emerald-900/50 focus-visible:ring-2 focus-visible:ring-emerald-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

const RELOAD_BUTTON_CLASS =
  'rounded border border-slate-400/60 px-3 py-1 text-sm font-medium text-slate-100 ' +
  'hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

/**
 * O texto do botao de concluir em cada estado em que ele aparece.
 *
 * `retryPending` vem do REGISTRO, nao do estado do cartao: o reload remonta o
 * cartao (o estado volta a `idle`), mas a chave retida continua la, e o proximo
 * envio reenvia a MESMA chave -- e isso que "Tentar de novo" promete.
 */
function completeLabel(completion: CompletionState, retryPending: boolean): MessageKey {
  if (completion.status === 'submitting') {
    return 'missions.card.completing'
  }
  return completion.status === 'failed' || retryPending
    ? 'missions.action.retry'
    : 'missions.card.complete'
}

/** O que a regiao viva anuncia. Vazio quando nao ha nada acontecendo. */
function statusText(completion: CompletionState): MessageKey | null {
  if (completion.status === 'submitting') {
    return 'missions.card.completingStatus'
  }
  return completion.status === 'completed' ? 'missions.card.completedStatus' : null
}

/**
 * Por que o rascunho em uso nao pode sair, ou `null` se pode (ou nao ha
 * rascunho). O texto mora JUNTO do Concluir, fora do disclosure: com o
 * formulario recolhido, o botao desabilitado continua com o motivo a vista e
 * ligado por `aria-describedby`.
 */
type BlockedReason =
  { kind: 'link'; error: LinkError } | { kind: 'textMissing' } | { kind: 'textTooLong' }

function blockedReason(draft: EvidenceDraft): BlockedReason | null {
  const inUse = stripEnds(draft.text) !== '' || stripEnds(draft.link) !== ''
  const described = describeEvidence(draft)
  if (!inUse || described.sendable) {
    return null
  }
  if (described.linkError !== null) {
    return { kind: 'link', error: described.linkError }
  }
  if (stripEnds(draft.text) === '') {
    return { kind: 'textMissing' }
  }
  return { kind: 'textTooLong' }
}

/** O motivo do bloqueio, no idioma corrente. */
function blockedText(reason: BlockedReason, t: Translate): string {
  switch (reason.kind) {
    case 'link':
      return t('missions.card.blocked.fixLink', { reason: linkErrorText(reason.error, t) })
    case 'textMissing':
      return t('missions.card.blocked.textMissing')
    case 'textTooLong':
      return t('missions.card.blocked.textTooLong', { max: MAX_EVIDENCE_LENGTH })
  }
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
 *   a `CycleSection` passa "Atualizar a missão de hoje", porque o clique
 *   ali nao atualiza um "quadro" -- recarrega o ciclo.
 * - **esperando o quadro**: o `reloadLabel` pedido com outro pedido em voo
 *   (conclusao, Iniciar ou Reagendar) fica desabilitado e diz "Aguardando o
 *   pedido em andamento…"; o quadro recarrega sozinho quando ele termina (`useCompletionRegistry`). Quem
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
  retryPending,
  onReload,
  reloadWaiting,
  reloadLabel,
  otherInFlight,
}: {
  mission: Mission
  completion: CompletionState
  onComplete: () => void
  /** Por que o rascunho da evidencia em uso nao pode ser enviado, ou `null`. */
  blocked: BlockedReason | null
  /** A chave desta missao esta retida no registro (falha que se repete). */
  retryPending: boolean
  onReload: () => void
  reloadWaiting: boolean
  reloadLabel: MessageKey
  /** Um Iniciar ou Reagendar deste cartao esta em voo: um envio de cada vez. */
  otherInFlight: boolean
}) {
  const t = useT()
  const blockedId = useId()
  // Missao que ja veio concluida do quadro: nada a oferecer nem a anunciar. O
  // rotulo de estado ja diz "Concluída".
  if (mission.state === 'concluida' && completion.status === 'idle') {
    return null
  }

  const failure = completion.status === 'failed' ? completion.failure : null
  const canComplete = mission.state !== 'concluida' && failure?.action !== 'refresh'

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {canComplete && (
        <button
          type="button"
          data-testid="mission-complete"
          disabled={completion.status === 'submitting' || otherInFlight || blocked !== null}
          aria-describedby={blocked === null ? undefined : blockedId}
          onClick={onComplete}
          className={COMPLETE_BUTTON_CLASS}
        >
          {t(completeLabel(completion, retryPending))}{' '}
          <span className="sr-only">
            {t('missions.card.whichMission', { instructions: mission.instructions })}
          </span>
        </button>
      )}
      {canComplete && blocked !== null && (
        <p id={blockedId} data-testid="mission-complete-blocked" className="text-sm text-amber-200">
          {blockedText(blocked, t)}
        </p>
      )}
      {failure?.action === 'refresh' && (
        <button
          type="button"
          data-testid="mission-reload"
          disabled={reloadWaiting}
          onClick={onReload}
          className={RELOAD_BUTTON_CLASS}
        >
          {t(reloadWaiting ? RELOAD_WAITING_LABEL : reloadLabel)}{' '}
          <span className="sr-only">
            {t('missions.card.whichMission', { instructions: mission.instructions })}
          </span>
        </button>
      )}
      <div
        role="status"
        data-testid="mission-completion-status"
        className="text-sm text-emerald-300"
      >
        <p data-testid="mission-completion-text">{translateOrEmpty(statusText(completion), t)}</p>
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
          <FailureMessage failure={failure} />
        </p>
      )}
    </div>
  )
}

/** O texto do botao Iniciar em cada estado em que ele aparece. */
function startLabel(start: StartState, hasRetainedKey: boolean): MessageKey {
  if (start.status === 'submitting') {
    return 'missions.card.starting'
  }
  return start.status === 'failed' || hasRetainedKey
    ? 'missions.action.retry'
    : 'missions.card.start'
}

/** O que a regiao viva do Iniciar anuncia. */
function startStatusText(start: StartState): MessageKey | null {
  if (start.status === 'submitting') {
    return 'missions.card.startingStatus'
  }
  return start.status === 'started' ? 'missions.card.startedStatus' : null
}

/** O que a regiao viva do Reagendar anuncia. */
function rescheduleStatusText(reschedule: RescheduleState): MessageKey | null {
  if (reschedule.status === 'submitting') {
    return 'missions.card.reschedulingStatus'
  }
  return reschedule.status === 'rescheduled' ? 'missions.card.rescheduledStatus' : null
}

/** O texto de uma regiao viva: vazio quando nao ha o que anunciar. */
function translateOrEmpty(key: MessageKey | null, t: Translate): string {
  return key === null ? '' : t(key)
}

/**
 * A missao mais recente que o Iniciar ou o Reagendar devolveu, ou `null`.
 *
 * Com os dois feitos no mesmo cartao, a resposta mais nova e a que ja contem a
 * outra: um reagendamento DEPOIS do inicio volta com o `started_at`; um inicio
 * DEPOIS do reagendamento volta com o historico, e o reagendamento guardado
 * (anterior) tem `started_at` nulo. Decidir pelo conteudo que o servidor
 * devolveu dispensa guardar a ordem dos cliques.
 *
 * `rescheduled` e o ultimo reagendamento que DEU CERTO (`lastRescheduled` do
 * hook), e nao o estado da tentativa corrente: com um segundo reagendamento em
 * voo ou recusado, o cartao continua no resultado do primeiro.
 */
function latestFromActions(start: StartState, rescheduled: Mission | null): Mission | null {
  const started = start.status === 'started' ? start.mission : null
  if (rescheduled !== null && (started === null || rescheduled.started_at !== null)) {
    return rescheduled
  }
  return started
}

/** A falha que pede atualizar, com o botao de recarga do cartao. */
function RefreshNotice({
  failure,
  testId,
  onReload,
  reloadWaiting,
  reloadLabel,
  instructions,
}: {
  failure: FailureText
  testId: string
  onReload: () => void
  reloadWaiting: boolean
  reloadLabel: MessageKey
  instructions: string
}) {
  const t = useT()
  return (
    <>
      <button
        type="button"
        data-testid={`${testId}-reload`}
        disabled={reloadWaiting}
        onClick={onReload}
        className={RELOAD_BUTTON_CLASS}
      >
        {t(reloadWaiting ? RELOAD_WAITING_LABEL : reloadLabel)}{' '}
        <span className="sr-only">{t('missions.card.whichMission', { instructions })}</span>
      </button>
      <p role="alert" data-testid={`${testId}-error`} className="w-full text-sm text-red-300">
        <FailureMessage failure={failure} />
      </p>
    </>
  )
}

/**
 * O botao Iniciar (F1, F20) e o que a tela diz durante e depois do inicio. O
 * desenho e o do Concluir:
 *
 * - so na pendente DISPONIVEL: a perdida, a expirada, a em andamento e a
 *   concluida nao se iniciam (a regra e do servidor; a tela so nao oferece);
 * - em voo, "Iniciando…" desabilitado;
 * - no sucesso o botao some (a missao ja esta em andamento) e a regiao viva
 *   anuncia "Missão iniciada.";
 * - falha que se repete: o aviso e "Tentar de novo" (a chave, quem decide e o
 *   hook); falha que pede atualizar: o aviso e o botao de recarga no lugar.
 *
 * A regiao viva existe desde o primeiro render de todo cartao nao concluido,
 * vazia, pelo mesmo motivo da regiao do Concluir.
 */
function StartControls({
  mission,
  start,
  hasRetainedKey,
  onStart,
  otherInFlight,
  onReload,
  reloadWaiting,
  reloadLabel,
}: {
  mission: Mission
  start: StartState
  hasRetainedKey: boolean
  onStart: () => void
  otherInFlight: boolean
  onReload: () => void
  reloadWaiting: boolean
  reloadLabel: MessageKey
}) {
  const t = useT()
  const failure = start.status === 'failed' ? start.failure : null
  const startable =
    (mission.state === 'pendente' && mission.availability === 'disponivel') ||
    start.status === 'submitting'
  // Sem botao, sem aviso e sem anuncio (a missao ja veio em andamento), o
  // bloco e so a regiao viva vazia: sem a margem, que viraria folga sem nada.
  const shown = startable || start.status !== 'idle'
  return (
    <div className={`${shown ? 'mt-3 ' : ''}flex flex-wrap items-center gap-3`}>
      {failure?.action === 'refresh' ? (
        <RefreshNotice
          failure={failure}
          testId="mission-start"
          instructions={mission.instructions}
          onReload={onReload}
          reloadWaiting={reloadWaiting}
          reloadLabel={reloadLabel}
        />
      ) : (
        <>
          {startable && (
            <button
              type="button"
              data-testid="mission-start"
              disabled={start.status === 'submitting' || otherInFlight}
              onClick={onStart}
              className={COMPLETE_BUTTON_CLASS}
            >
              {t(startLabel(start, hasRetainedKey))}{' '}
              <span className="sr-only">
                {t('missions.card.whichMission', { instructions: mission.instructions })}
              </span>
            </button>
          )}
          {failure !== null && (
            <p
              role="alert"
              data-testid="mission-start-error"
              className="w-full text-sm text-red-300"
            >
              <FailureMessage failure={failure} />
            </p>
          )}
        </>
      )}
      <p role="status" data-testid="mission-start-status" className="text-sm text-emerald-300">
        {translateOrEmpty(startStatusText(start), t)}
      </p>
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
  reloadLabel = 'missions.reload.board',
}: {
  mission: Mission
  registry: CompletionRegistry
  onReload: () => void
  reloadWaiting: boolean
  onCompleted?: () => void
  /**
   * O bonus da avaliacao da Kairya foi creditado. Quem usa o cartao liga ao
   * MESMO aviso da conclusao (P3 do D): o saldo mudou, o painel de progresso
   * atualiza.
   */
  onRewarded?: () => void
  /**
   * O nivel do titulo do cartao. Padrao `3` (`<h3>`), como sempre foi no
   * quadro de avulsas. A `CycleSection` pede `4` para o cartao DENTRO da
   * especial: sem isso, o `<h3>` do titulo da secao ("Missão especial — bônus
   * da sequência") e o `<h3>` do titulo do cartao colidiam no mesmo nivel,
   * dentro da mesma secao.
   */
  titleLevel?: 3 | 4
  /**
   * O texto do botao de recuperacao. Padrao "Atualizar o quadro", como
   * sempre foi. Ver o comentario de `CompletionControls` acima.
   */
  reloadLabel?: MessageKey
}) {
  const t = useT()
  const { locale } = useLocale()
  const { dispatchAll } = useKairya()
  const { playSfx } = useAudio()
  const handleCompleted = useCallback(
    (outcome: CompletionOutcome) => {
      const done = { type: outcome.mission.mission_type, reward: outcome.reward }
      dispatchAll(completionEvents(done))
      playSfx(sfxForCompletion(done))
      onCompleted?.()
    },
    [dispatchAll, playSfx, onCompleted],
  )
  const { state: completion, complete } = useCompleteMission(listed.id, registry, handleCompleted)
  const { state: start, start: startMission } = useStartMission(listed.id, registry)
  const {
    state: reschedule,
    reschedule: rescheduleMission,
    lastRescheduled,
  } = useRescheduleMission(listed.id, registry)
  // O rascunho do Reagendar e o conteudo do ultimo envio moram no REGISTRO,
  // com a chave (pendencia 112): sobrevivem a remontagem, e o hook troca a chave
  // antes do envio quando o conteudo mudou. Com o envio em voo nao ha retry a
  // oferecer; fora dele, o ultimo envio so existe enquanto a chave esta retida.
  const pendingRetry =
    reschedule.status === 'submitting' ? null : registry.sentRescheduleFor(listed.id)
  const saveReschedule = (open: OpenReschedule | null) => {
    if (open === null) {
      registry.discardRescheduleDraft(listed.id)
      return
    }
    registry.saveRescheduleDraft(listed.id, open)
  }
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
  // concluir sem ele trocaria a entrega que a pessoa quis dar. Sem
  // texto nenhum, sai a conclusao de sempre, sem a chave `evidence`.
  const draftInUse = stripEnds(draft.text) !== '' || stripEnds(draft.link) !== ''
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  // Depois do sucesso, o cartao mostra a missao que a API DEVOLVEU. Ela nao
  // fica velha: `concluida` e terminal (A5), e a proxima leitura do quadro --
  // o "Atualizar", ou o "Tentar novamente" da lista -- monta cartoes novos.
  // Sem conclusao, vale a ultima devolvida pelo Iniciar ou pelo Reagendar
  // (incremento F), e so entao a listada.
  const mission =
    completion.status === 'completed'
      ? completion.mission
      : (latestFromActions(start, lastRescheduled) ?? listed)
  // Um envio de cada vez no cartao: com o Iniciar em voo, um Concluir chegaria
  // ao servidor numa ordem que a tela nao controla (e vice-versa).
  const completing = completion.status === 'submitting'
  const starting = start.status === 'submitting'
  const rescheduling = reschedule.status === 'submitting'
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
  // O mesmo para o Iniciar: no sucesso, o botao sai do documento.
  const started = start.status === 'started'
  useEffect(() => {
    if (started && document.activeElement === document.body) {
      titleRef.current?.focus()
    }
  }, [started])
  // O formulario so existe enquanto ha o que concluir: nao na concluida, nem
  // depois de uma falha que pede atualizar (a missao ja mudou no servidor).
  const retryPending = registry.isRetryPending(listed.id)
  const completionStale = completion.status === 'failed' && completion.failure.action === 'refresh'
  const offersEvidence = mission.state !== 'concluida' && !completionStale
  // O reagendamento e so da avulsa (F7: o prazo da diaria e da especial vem do
  // ciclo) e so enquanto nao concluida (F8). Uma falha que pede atualizar -- a
  // do reagendamento ou a do Concluir -- tira o formulario: a missao ja mudou.
  const rescheduleFailure = reschedule.status === 'failed' ? reschedule.failure : null
  const offersReschedule =
    mission.mission_type === 'avulsa' &&
    mission.state !== 'concluida' &&
    !completionStale &&
    rescheduleFailure?.action !== 'refresh'
  // As regioes vivas nascem com o cartao e so no que tem o que anunciar: a
  // missao listada nao concluida (a do Reagendar, so na avulsa).
  const liveStart = listed.state !== 'concluida'
  const liveReschedule = liveStart && listed.mission_type === 'avulsa'

  return (
    <li data-testid="mission-item" data-mission-id={mission.id} className={CARD_CLASS}>
      <div className="flex items-start justify-between gap-4">
        <HeadingTag
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          data-testid="mission-instructions"
          className="min-w-0 text-base font-semibold text-slate-100 focus:outline-none"
        >
          {mission.instructions}
        </HeadingTag>
        {/* O estado vem como rotulo em texto, nao como cor: o README §7 exige
            aviso alem da cor. */}
        <span
          data-testid="mission-state"
          className="rpg-mission-state shrink-0 rounded-full border border-emerald-400/50 px-2 py-0.5 text-xs font-medium text-emerald-300"
        >
          {t(MISSION_STATE_LABELS[mission.state])}
        </span>
      </div>

      <p data-testid="mission-completion-criterion" className="mt-2 text-sm text-slate-300">
        <span className="text-slate-400">{t('missions.card.completionCriterion')} </span>
        {mission.completion_criterion}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-300 sm:grid-cols-4">
        <dt className="text-slate-400">{t('missions.card.deadline')}</dt>
        <dd>
          <time data-testid="mission-deadline" dateTime={mission.deadline}>
            {formatDeadline(mission.deadline, locale)}
          </time>
        </dd>

        <dt className="text-slate-400">{t('missions.card.difficulty')}</dt>
        {/* O teto vem de `MAX_DIFFICULTY` (`shared/types/mission.ts`), que
            espelha `DIFICULDADE_MAXIMA` do backend a mao. */}
        <dd data-testid="mission-difficulty">
          {t('missions.card.difficultyValue', {
            difficulty: mission.difficulty,
            max: MAX_DIFFICULTY,
          })}
        </dd>

        <dt className="text-slate-400">{t('missions.card.estimate')}</dt>
        <dd data-testid="mission-estimated-minutes">
          {t('missions.card.minutes', { minutes: mission.estimated_minutes })}
        </dd>

        <dt className="text-slate-400">{t('missions.card.reward')}</dt>
        <dd data-testid="mission-xp">{t('missions.card.xp', { xp: mission.xp })}</dd>

        {/* `actual_duration_minutes` e computado pela API e vem nulo enquanto
            faltar o inicio ou a conclusao. Nulo significa "ainda nao existe",
            e nao "zero minuto": mostrar "0 min" seria afirmar o que ninguem
            mediu. */}
        {mission.actual_duration_minutes !== null && (
          <>
            <dt className="text-slate-400">{t('missions.card.actualDuration')}</dt>
            <dd data-testid="mission-actual-duration">
              {t('missions.card.minutes', { minutes: mission.actual_duration_minutes })}
            </dd>
          </>
        )}
      </dl>

      {/* "Iniciada em" so em andamento; concluida, o que conta e a duracao real. */}
      {mission.state === 'em_andamento' && mission.started_at !== null && (
        <p data-testid="mission-started-at" className="mt-2 text-sm text-slate-300">
          <span className="text-slate-400">{t('missions.card.startedAt')} </span>
          <time dateTime={mission.started_at}>{formatDeadline(mission.started_at, locale)}</time>
        </p>
      )}

      <RescheduleHistory reschedules={mission.reschedules} />

      {offersEvidence && (
        <EvidenceForm
          draft={draft}
          onChange={changeDraft}
          disabled={completion.status === 'submitting'}
          retryPending={retryPending}
          describedBy={titleId}
        />
      )}

      {liveStart && !completed && (
        <StartControls
          mission={mission}
          start={start}
          hasRetainedKey={registry.hasActionKey(listed.id, 'start')}
          onStart={startMission}
          otherInFlight={completing || rescheduling}
          onReload={onReload}
          reloadWaiting={reloadWaiting}
          reloadLabel={reloadLabel}
        />
      )}

      <CompletionControls
        mission={mission}
        completion={completion}
        onComplete={() => {
          complete(draftInUse ? draft : undefined)
        }}
        blocked={blockedReason(draft)}
        retryPending={retryPending}
        onReload={onReload}
        reloadWaiting={reloadWaiting}
        reloadLabel={reloadLabel}
        otherInFlight={starting || rescheduling}
      />

      {offersReschedule && (
        <RescheduleForm
          mission={mission}
          disabled={completing || starting || rescheduling}
          failure={rescheduleFailure}
          onSubmit={rescheduleMission}
          saved={registry.rescheduleDraftFor(listed.id)}
          onSave={saveReschedule}
          pendingRetry={pendingRetry}
          describedBy={titleId}
        />
      )}
      {rescheduleFailure?.action === 'refresh' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <RefreshNotice
            failure={rescheduleFailure}
            testId="mission-reschedule"
            instructions={mission.instructions}
            onReload={onReload}
            reloadWaiting={reloadWaiting}
            reloadLabel={reloadLabel}
          />
        </div>
      )}
      {liveReschedule && (
        <p
          role="status"
          data-testid="mission-reschedule-status"
          className="mt-2 text-sm text-emerald-300"
        >
          {translateOrEmpty(rescheduleStatusText(reschedule), t)}
        </p>
      )}

      {mission.state === 'concluida' && (
        <EvaluationPanel
          mission={mission}
          onRewarded={onRewarded}
          onReload={onReload}
          reloadLabel={reloadLabel}
          reloadWaiting={reloadWaiting}
          describedBy={titleId}
        />
      )}
    </li>
  )
}
