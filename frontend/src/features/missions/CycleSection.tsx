import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactElement,
  type Ref,
} from 'react'
import { formatCivilDate } from '../../shared/lib/civilDate'
import { saoPauloCivilDate } from '../../shared/lib/deadline'
import { DAYS_PER_MILESTONE, type Mission } from '../../shared/types/mission'
import { MissionCard } from './MissionCard'
import type { Cycle } from './types'
import type { CompletionRegistry } from './useCompletionRegistry'
import { useCompletionRegistry } from './useCompletionRegistry'
import { useCycle, type CycleState } from './useCycle'
import type { MessageKey } from '../../shared/i18n/catalog'
import { LoadFailureMessage } from '../../shared/i18n/LoadFailureMessage'
import type { Locale } from '../../shared/i18n/locale'
import { plural } from '../../shared/i18n/plural'
import { useLocale } from '../../shared/i18n/useLocale'
import { useT, type Translate } from '../../shared/i18n/useT'

export interface CycleSectionHandle {
  refresh: () => void
}

/**
 * "1 dia seguido" / "3 dias seguidos". O zero vai na forma `other` de
 * proposito: no CLDR `pt` o 0 cai em `one`, e "0 dia seguido" seria errado.
 */
function streakText(days: number, locale: Locale, t: Translate): string {
  const forms = {
    zero: 'missions.cycle.streakDays.other',
    one: 'missions.cycle.streakDays.one',
    other: 'missions.cycle.streakDays.other',
  } as const
  return t(plural(locale, days, forms), { count: days })
}

/**
 * F25: o motivo da diaria de ontem na tela. Depois de concluida com atraso ela
 * continua no ciclo ate o fim de hoje (o `refresh` nao tira o cartao), e o
 * texto de "ainda pode ser concluida" seria falso.
 */
function lateDailyReason(mission: Mission): MessageKey {
  return mission.state === 'concluida'
    ? 'missions.cycle.lateDaily.completed'
    : 'missions.cycle.lateDaily.pending'
}

/**
 * F25: a especial esta em conclusao tardia quando o prazo dela (a meia-noite
 * que fecha a janela) ja abriu o dia de hoje -- o backend so a mantem no ciclo,
 * depois disso, se ela foi iniciada na janela. `null` dentro da janela.
 */
function lateSpecialReason(special: Mission, today: string): MessageKey | null {
  if (saoPauloCivilDate(special.deadline) > today) {
    return null
  }
  return special.state === 'concluida'
    ? 'missions.cycle.lateSpecial.completed'
    : 'missions.cycle.lateSpecial.pending'
}

/** "falta 1 dia" / "faltam 4 dias"; o zero no plural, como na sequencia. */
function remainingText(days: number, locale: Locale, t: Translate): string {
  const forms = {
    zero: 'missions.cycle.remainingDays.other',
    one: 'missions.cycle.remainingDays.one',
    other: 'missions.cycle.remainingDays.other',
  } as const
  return t(plural(locale, days, forms), { count: days })
}

interface CardProps {
  registry: CompletionRegistry
  onReload: () => void
  reloadWaiting: boolean
  onCompleted: () => void
  /** O bonus da avaliacao: so avisa a pagina (a sequencia nao muda com ele). */
  onRewarded?: () => void
  /**
   * Aqui o botao de recuperacao recarrega o CICLO, e nao um "quadro". Este e o
   * rotulo do cartao da missao de hoje; os da diaria de ontem e da especial
   * trocam o proprio, porque "a missao de hoje" seria falso neles.
   */
  reloadLabel: MessageKey
}

/**
 * O ciclo carregado: a missao de hoje (ou "sem plano"), a sequencia, e o
 * progresso ate a especial -- ou o cartao dela, quando esta vigente.
 *
 * Os cartoes sao os MESMOS do quadro de avulsas (`MissionCard`): a conclusao
 * da diaria segue as mesmas regras de chave e reenvio. O `onCompleted` faz o
 * `refresh` silencioso do PROPRIO ciclo (decisao P9): a sequencia muda sem
 * desmontar o cartao; e ainda avisa `onMissionCompleted`, da PAGINA, que
 * usa o aviso para atualizar o painel de progresso.
 */
function CycleLoaded({
  cycle,
  refreshFailed,
  card,
  dailyRef,
}: {
  dailyRef: Ref<HTMLUListElement>
  cycle: Cycle
  refreshFailed: boolean
  card: CardProps
}) {
  const t = useT()
  const { locale } = useLocale()
  const specialReason =
    cycle.special === null ? null : lateSpecialReason(cycle.special, cycle.today)
  return (
    <div className="flex flex-col gap-3">
      <p data-testid="cycle-today" className="text-sm text-slate-400">
        {t('missions.cycle.today', { date: formatCivilDate(cycle.today, locale) })}
      </p>
      {cycle.mission === null ? (
        <p data-testid="cycle-no-plan" className="text-sm text-slate-300">
          {t('missions.cycle.noPlan')}
        </p>
      ) : (
        <ul key={cycle.mission.id} ref={dailyRef} role="list" className="flex flex-col gap-3">
          {/* A chave pela ID da missao, e nao pela POSICAO. Sem ela, um
              `refresh` que devolve outra missao (a diaria de amanha, se a
              conclusao caiu perto da meia-noite e a resposta chegou depois)
              mantem a MESMA instancia do cartao -- e ela continua presa no
              `completion.status === 'completed'` de ontem, mostrando a missao
              velha em vez da nova. A chave forca o remonte quando o `id` muda. */}
          <MissionCard key={cycle.mission.id} mission={cycle.mission} {...card} />
        </ul>
      )}
      {/* F25: a diaria de ontem iniciada a tempo. Fica numa secao propria, com
          o motivo a vista: o prazo impresso no cartao ja passou, e sem o texto
          o Concluir pareceria um erro. */}
      {cycle.late_daily !== null && (
        <div data-testid="cycle-late-daily">
          <h3 className="mb-1 text-base font-semibold text-amber-200">
            {t('missions.cycle.lateDaily.title')}
          </h3>
          <p data-testid="cycle-late-daily-reason" className="mb-2 text-sm text-slate-300">
            {t(lateDailyReason(cycle.late_daily))}
          </p>
          <ul role="list" className="flex flex-col gap-3">
            {/* Mesma chave pela ID, pelo mesmo motivo do cartao de hoje. O
                rotulo de recarga e o do PROPRIO cartao: "a missao de hoje"
                num cartao titulado "Diaria de ontem" seria falso. */}
            <MissionCard
              key={cycle.late_daily.id}
              mission={cycle.late_daily}
              {...card}
              reloadLabel="missions.reload.lateDaily"
              titleLevel={4}
            />
          </ul>
        </div>
      )}
      {/* `role="status"` desde o primeiro render do estado carregado -- um
          leitor de tela so anuncia mudanca numa regiao viva que ja estava no
          documento. Sem isto, nem a mudanca da sequencia (ao concluir a
          diaria) nem o texto que muda quando ela chega ao marco eram
          anunciados. */}
      <p role="status" data-testid="cycle-streak" className="text-sm font-medium text-slate-200">
        {t('missions.cycle.streak', { days: streakText(cycle.streak, locale, t) })}
      </p>
      {cycle.special === null ? (
        <p data-testid="cycle-progress" className="text-sm text-slate-300">
          {t('missions.cycle.progress', {
            progress: cycle.streak % DAYS_PER_MILESTONE,
            total: DAYS_PER_MILESTONE,
            remaining: remainingText(cycle.days_to_milestone, locale, t),
          })}
        </p>
      ) : (
        <div data-testid="cycle-special">
          <h3 className="mb-2 text-base font-semibold text-emerald-200">
            {t('missions.cycle.special.title')}
          </h3>
          {/* F25: depois do fim da janela, o prazo impresso no
              cartao ja passou; sem o motivo, o Concluir pareceria um erro. */}
          {specialReason !== null && (
            <p data-testid="cycle-special-late-reason" className="mb-2 text-sm text-slate-300">
              {t(specialReason)}
            </p>
          )}
          <ul role="list" className="flex flex-col gap-3">
            {/* Mesma chave pela ID, pelo mesmo motivo do cartao de hoje, e o
                rotulo de recarga tambem e o do proprio cartao. */}
            <MissionCard
              key={cycle.special.id}
              mission={cycle.special}
              {...card}
              reloadLabel="missions.reload.special"
              titleLevel={4}
            />
          </ul>
        </div>
      )}
      {refreshFailed && (
        <div role="alert" data-testid="cycle-stale" className="text-sm text-amber-200">
          <p>{t('missions.cycle.refreshFailed')}</p>
          <button
            type="button"
            data-testid="cycle-refresh"
            onClick={card.onReload}
            className="mt-2 rounded border border-amber-300/60 px-3 py-1 font-medium text-amber-100 hover:bg-amber-900/40 focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:outline-none"
          >
            {t('missions.cycle.refresh')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Um estado por ramo; `ReactElement` faz um estado novo reprovar o `tsc`. */
function CycleContent({
  state,
  card,
  dailyRef,
}: {
  state: CycleState
  card: CardProps
  dailyRef: Ref<HTMLUListElement>
}): ReactElement {
  const t = useT()
  switch (state.status) {
    case 'loading':
      return (
        <p role="status" data-testid="cycle-loading" className="text-sm text-slate-400">
          {t('missions.cycle.loading')}
        </p>
      )
    case 'error':
      return (
        <div
          role="alert"
          data-testid="cycle-error"
          className="rounded-lg border border-red-500/50 bg-red-950/40 p-4 text-sm text-red-200"
        >
          <p className="font-semibold">{t('missions.cycle.loadFailed')}</p>
          <p className="mt-1">
            <LoadFailureMessage
              failure={state.failure}
              unexpected="missions.cycle.unexpectedFailure"
            />
          </p>
          <button
            type="button"
            data-testid="cycle-retry"
            onClick={card.onReload}
            className="mt-3 rounded border border-red-400/60 px-3 py-1 font-medium text-red-100 hover:bg-red-900/50 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:outline-none"
          >
            {t('missions.action.retryLoad')}
          </button>
        </div>
      )
    case 'loaded':
      return (
        <CycleLoaded
          cycle={state.cycle}
          refreshFailed={state.refreshFailed}
          card={card}
          dailyRef={dailyRef}
        />
      )
  }
}

/**
 * "Missão de hoje" no Quartel-General (Incremento B).
 *
 * O registro das conclusoes e PROPRIO desta secao, e nao o do quadro de
 * avulsas: os conjuntos de missoes sao disjuntos (diaria e especial aqui,
 * avulsas la), e cada registro espera so as conclusoes que o reload DELE
 * remontaria.
 *
 * `onMissionCompleted` e o que a PAGINA pede para saber de toda conclusao
 * feita aqui (a diaria ou a especial) -- hoje, para atualizar o painel de
 * progresso com `refresh()` silencioso.
 */
export function CycleSection({
  onMissionCompleted,
  ref,
}: {
  onMissionCompleted?: () => void
  ref?: Ref<CycleSectionHandle>
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const daily = useRef<HTMLUListElement | null>(null)
  const lostFocus = useRef<Element | null>(null)
  const dailyRef = useCallback((node: HTMLUListElement | null) => {
    // O detach da lista com key por ID acontece ANTES de remover a diária.
    // A ref estável não captura em refresh da mesma missão; especial não participa.
    if (node === null) {
      const focused = document.activeElement
      if (daily.current!.contains(focused)) {
        lostFocus.current = focused
      }
    }
    daily.current = node
  }, [])
  useLayoutEffect(() => {
    const previous = lostFocus.current
    lostFocus.current = null
    // StrictMode pode desligar uma ref sem remover seu elemento. Outro
    // controle que já recebeu foco tem prioridade sobre esta recuperação.
    if (previous === null || previous.isConnected || document.activeElement !== document.body) {
      return
    }
    const target = heading.current!
    // QG oculto e fundo de modal ativo não são destinos de foco.
    if (target.closest('[hidden], [inert]') === null) {
      target.focus()
    }
  })
  const t = useT()
  const { state, reload, refresh } = useCycle()
  useImperativeHandle(ref, () => ({ refresh }), [refresh])
  const { registry, reload: requestReload, waitingForCompletion } = useCompletionRegistry(reload)

  useEffect(() => {
    if (state.status === 'loaded' && !state.refreshFailed) {
      registry.reconcileCompleted(
        [state.cycle.mission, state.cycle.late_daily, state.cycle.special].flatMap((mission) =>
          mission !== null && mission.state === 'concluida' ? [mission.id] : [],
        ),
      )
    }
  }, [state, registry])
  const card: CardProps = {
    registry,
    onReload: requestReload,
    reloadWaiting: waitingForCompletion,
    onCompleted: () => {
      refresh()
      onMissionCompleted?.()
    },
    onRewarded: onMissionCompleted,
    reloadLabel: 'missions.reload.today',
  }
  return (
    <section aria-labelledby="cycle-heading" data-testid="cycle" className="rpg-cycle mb-8">
      <h2
        ref={heading}
        id="cycle-heading"
        tabIndex={-1}
        className="mb-3 rounded text-lg font-semibold text-slate-200 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
      >
        {t('missions.cycle.title')}
      </h2>
      <CycleContent state={state} card={card} dailyRef={dailyRef} />
    </section>
  )
}
