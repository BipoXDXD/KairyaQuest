import { useEffect, useRef, type ReactElement } from 'react'
import { useAudio } from '../../shared/audio/useAudio'
import { LoadFailureMessage } from '../../shared/i18n/LoadFailureMessage'
import type { MessageKey } from '../../shared/i18n/catalog'
import { useLocale } from '../../shared/i18n/useLocale'
import { useT } from '../../shared/i18n/useT'
import { civilWeekday, formatCivilDate } from '../../shared/lib/civilDate'
import { DAYS_PER_MILESTONE, type Availability } from '../../shared/types/mission'
import { Badge, Button, Panel, Skeleton } from '../../shared/ui'
import { LanternGlyph } from './LanternGlyph'
import { useLanternReveal } from './lanternReveal'
import {
  lanternsOf,
  todayIndexOf,
  type DayLantern,
  type LanternState,
  type SpecialLantern,
} from './lanterns'
import type { Plan } from './types'
import { useCurrentPlan, type CurrentPlanState } from './useCurrentPlan'
import { WeekPlanEntry } from './WeekPlanEntry'

/** O texto de cada disponibilidade: acolhedor, e e ele (nao a cor) quem diz o estado. */
const DAY_TEXT: Record<Availability, MessageKey> = {
  concluida: 'campaigns.lantern.day.concluida',
  perdida: 'campaigns.lantern.day.perdida',
  expirada: 'campaigns.lantern.day.expirada',
  disponivel: 'campaigns.lantern.day.disponivel',
  bloqueada: 'campaigns.lantern.day.bloqueada',
  fora_do_plano: 'campaigns.lantern.day.fora_do_plano',
}

const SPECIAL_TEXT: Record<Availability, MessageKey> = {
  concluida: 'campaigns.lantern.special.concluida',
  perdida: 'campaigns.lantern.special.perdida',
  expirada: 'campaigns.lantern.special.expirada',
  disponivel: 'campaigns.lantern.special.disponivel',
  bloqueada: 'campaigns.lantern.special.bloqueada',
  fora_do_plano: 'campaigns.lantern.special.fora_do_plano',
}

/**
 * Acesa: borda e brilho da lanterna (o unico efeito do sistema). Apagada e
 * futura: so a borda muda, a forma do glifo faz o resto.
 */
const ITEM_TONE: Record<LanternState, string> = {
  lit: 'border-action-primary bg-bg-raised shadow-glow-lantern',
  out: 'border-border-subtle bg-bg-surface',
  future: 'border-border-subtle bg-bg-surface',
}

const STATUS_TONE: Record<LanternState, string> = {
  lit: 'text-text-primary',
  out: 'text-text-muted',
  future: 'text-text-muted',
}

const ITEM_BASE = 'flex items-center gap-4 rounded-ui border p-3'

function LanternStatus({ state, children }: { state: LanternState; children: string }) {
  return (
    <p data-testid="lantern-status" className={`text-base ${STATUS_TONE[state]}`}>
      {children}
    </p>
  )
}

/** A lanterna de hoje que acende: so sob `motion-safe:` (README §7, movimento reduzido). */
const REVEAL = 'motion-safe:animate-lantern-lit'

function DayItem({
  lantern,
  isToday,
  revealing,
}: {
  lantern: DayLantern
  isToday: boolean
  revealing: boolean
}) {
  const t = useT()
  const { locale } = useLocale()
  return (
    <li
      data-testid="trail-day"
      data-day={lantern.day}
      data-availability={lantern.availability}
      data-state={lantern.state}
      className={`${ITEM_BASE} ${ITEM_TONE[lantern.state]}`}
    >
      <span
        data-testid="trail-day-art"
        className={`flex w-16 shrink-0 justify-center ${revealing ? REVEAL : ''}`}
      >
        <LanternGlyph state={lantern.state} size="small" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <time dateTime={lantern.day} className="font-display text-lg font-bold">
            {civilWeekday(lantern.day, locale)}
          </time>
          {isToday && (
            <Badge tone="action" data-testid="trail-today">
              {t('campaigns.trail.today')}
            </Badge>
          )}
        </div>
        <LanternStatus state={lantern.state}>{t(DAY_TEXT[lantern.availability])}</LanternStatus>
      </div>
    </li>
  )
}

/**
 * A lanterna grande, a especial. Bloqueada, mostra o "N de 7" (o progresso
 * ate o PROXIMO marco); em qualquer outro estado nao mostra, porque ao lado
 * da especial deste marco a contagem do proximo pareceria contradizer a tela.
 */
function SpecialItem({ lantern, progress }: { lantern: SpecialLantern; progress: number }) {
  const t = useT()
  const { playSfx } = useAudio()
  const announced = useRef(false)
  const ready = lantern.availability === 'disponivel'
  // Uma vez por montagem: a trilha recarregada em silencio nao repete o aviso.
  useEffect(() => {
    if (ready && !announced.current) {
      announced.current = true
      playSfx('weekly_trial_unlocked')
    }
  }, [ready, playSfx])
  return (
    <li
      data-testid="trail-special"
      data-availability={lantern.availability}
      data-state={lantern.state}
      className={`${ITEM_BASE} ${ITEM_TONE[lantern.state]}`}
    >
      <span data-testid="trail-special-art" className="flex w-16 shrink-0 justify-center">
        <LanternGlyph state={lantern.state} size="grand" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-display text-lg font-bold">{t('campaigns.trail.special.title')}</p>
        <LanternStatus state={lantern.state}>{t(SPECIAL_TEXT[lantern.availability])}</LanternStatus>
        {lantern.availability === 'bloqueada' && (
          <p data-testid="trail-special-progress" className="text-sm text-text-muted">
            {t('campaigns.trail.special.progress', { progress, total: DAYS_PER_MILESTONE })}
          </p>
        )}
      </div>
    </li>
  )
}

/**
 * A trilha so mostra; quem conclui e o Quartel-General. Uma lanterna pronta
 * (diaria ou especial) leva a UM caminho para la: botao com a navegacao, texto
 * sem ela.
 */
function HeadquartersPath({ onOpenHeadquarters }: { onOpenHeadquarters?: () => void }) {
  const t = useT()
  const { playSfx } = useAudio()
  if (onOpenHeadquarters === undefined) {
    return (
      <p data-testid="trail-go-headquarters" className="text-base text-text-muted">
        {t('campaigns.headquarters.hint')}
      </p>
    )
  }
  return (
    <div>
      <Button
        data-testid="trail-go-headquarters"
        onClick={() => {
          playSfx('trail_step')
          onOpenHeadquarters()
        }}
      >
        {t('campaigns.headquarters.go')}
      </Button>
    </div>
  )
}

function TrailLoaded({
  plan,
  refreshFailed,
  reload,
  onOpenHeadquarters,
}: {
  plan: Plan
  refreshFailed: boolean
  reload: () => void
  onOpenHeadquarters?: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const { days, special } = lanternsOf(plan)
  const todayIndex = todayIndexOf(plan)
  // `days[-1]` e `undefined`: sem dia revelado, nao ha lanterna de hoje.
  const todayLantern = days[todayIndex]
  const revealing = useLanternReveal(todayLantern?.state === 'lit' ? todayLantern.day : null)
  const lit = days.filter((lantern) => lantern.state === 'lit').length
  const hasReadyLantern = [...days, special].some(
    (lantern) => lantern.availability === 'disponivel',
  )
  return (
    <div className="flex flex-col gap-4">
      <p data-testid="trail-week" className="text-base text-text-muted">
        {t('campaigns.trail.week', { date: formatCivilDate(plan.week_start, locale) })}
      </p>
      <p data-testid="lantern-summary" className="font-display text-xl font-bold">
        {t('campaigns.lantern.summary', { lit, total: days.length })}
      </p>
      <ol aria-label={t('campaigns.lantern.list')} className="flex flex-col gap-3">
        {days.map((lantern, index) => (
          <DayItem
            key={lantern.day}
            lantern={lantern}
            isToday={index === todayIndex}
            revealing={revealing && index === todayIndex}
          />
        ))}
        <SpecialItem lantern={special} progress={plan.special.progress} />
      </ol>
      {hasReadyLantern && <HeadquartersPath onOpenHeadquarters={onOpenHeadquarters} />}
      {refreshFailed && (
        <div role="alert" data-testid="trail-stale" className="flex flex-col items-start gap-2">
          <p className="text-base text-feedback-danger">{t('campaigns.trail.refreshFailed')}</p>
          <Button data-testid="trail-refresh" onClick={reload}>
            {t('campaigns.trail.refresh')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Um estado por ramo; `ReactElement` faz um estado novo reprovar o `tsc`. */
function TrailContent({
  state,
  reload,
  onPlanCreated,
  onPlanExists,
  onOpenHeadquarters,
}: {
  state: CurrentPlanState
  reload: () => void
  onPlanCreated: () => void
  onPlanExists: () => void
  onOpenHeadquarters?: () => void
}): ReactElement {
  const t = useT()
  switch (state.status) {
    case 'loading':
      return <Skeleton lines={2} label={t('campaigns.trail.loading')} data-testid="trail-loading" />
    case 'error':
      return (
        <div
          role="alert"
          data-testid="trail-error"
          className="flex flex-col items-start gap-2 text-feedback-danger"
        >
          <p className="font-bold">{t('campaigns.trail.loadFailed')}</p>
          <p>
            <LoadFailureMessage
              failure={state.failure}
              unexpected="campaigns.trail.unexpectedFailure"
            />
          </p>
          <Button data-testid="trail-retry" onClick={reload}>
            {t('campaigns.trail.retry')}
          </Button>
        </div>
      )
    case 'no-plan':
      return (
        <div className="flex flex-col gap-4">
          <p data-testid="trail-no-plan" className="text-base text-text-muted">
            {t('campaigns.trail.noPlan')}
          </p>
          <WeekPlanEntry onCreated={onPlanCreated} onExists={onPlanExists} />
        </div>
      )
    case 'loaded':
      return (
        <TrailLoaded
          plan={state.plan}
          refreshFailed={state.refreshFailed}
          reload={reload}
          onOpenHeadquarters={onOpenHeadquarters}
        />
      )
  }
}

/**
 * Campanhas -- a trilha de lanternas da semana (F5, Tarefa 5.3). Troca direta
 * do antigo `CampaignTrail`, sobre os mesmos dados: `GET /api/plans/current`
 * (R9 do plano da F5 -- o `/api/cycle` nao traz o estado dos sete dias).
 *
 * Cada dia e uma lanterna: acesa (concluida), apagada (perdida ou expirada)
 * ou futura (por vir, disponivel ou sem plano), e a especial e a lanterna
 * grande. O estado e SEMPRE dito em texto e tem forma propria no glifo, nunca
 * so cor. A trilha nao mostra o texto das missoes (R10): quem lista e conclui
 * e o Quartel-General.
 *
 * Atualiza em silencio (`useRefreshOnReturn`, dentro de `useCurrentPlan`)
 * quando a aba volta a ficar visivel; se falhar, o aviso `trail-stale` diz que
 * a trilha pode estar desatualizada.
 */
export function LanternTrail({
  onOpenHeadquarters,
}: {
  onOpenHeadquarters?: () => void
} = {}) {
  const t = useT()
  const { state, reload, refresh } = useCurrentPlan()
  const heading = useRef<HTMLHeadingElement>(null)
  // O plano criado troca o "sem plano" pela trilha: o foco, que estava no
  // formulario que vai sair, vai para o titulo da secao.
  const handlePlanCreated = () => {
    refresh()
    heading.current?.focus()
  }
  return (
    <Panel as="section" aria-labelledby="lantern-trail-heading" data-testid="campaign-trail">
      <h2
        ref={heading}
        id="lantern-trail-heading"
        tabIndex={-1}
        className="mb-4 rounded-ui font-display text-xl font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        {t('campaigns.lantern.title')}
      </h2>
      <TrailContent
        state={state}
        reload={reload}
        onPlanCreated={handlePlanCreated}
        onPlanExists={refresh}
        onOpenHeadquarters={onOpenHeadquarters}
      />
    </Panel>
  )
}
