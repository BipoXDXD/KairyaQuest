import { useImperativeHandle, type ReactElement, type Ref } from 'react'
import { rankName } from './rankText'
import { formatUnlockedAt } from './unlockedDate'
import type { Achievement, Progress } from './types'
import { useProgress, type ProgressState } from './useProgress'
import { formatXp } from './xpFormat'
import { achievementText } from '../../shared/i18n/achievementText'
import { LoadFailureMessage } from '../../shared/i18n/LoadFailureMessage'
import { useLocale } from '../../shared/i18n/useLocale'
import { useT } from '../../shared/i18n/useT'
import { Badge, Button, Panel, ProgressBar, StatusLine } from '../../shared/ui'

export interface ProgressPanelHandle {
  refresh: () => void
}

function AchievementItem({ achievement }: { achievement: Achievement }): ReactElement {
  const t = useT()
  const { locale } = useLocale()
  const { title, description } = achievementText(achievement, t)
  const unlockedAt = achievement.unlocked_at
  return (
    <li
      data-testid="progress-achievement"
      data-code={achievement.code}
      data-unlocked={String(unlockedAt !== null)}
      className={
        unlockedAt !== null
          ? 'rounded-ui border border-feedback-success p-2 text-sm text-text-primary'
          : 'rounded-ui border border-border-subtle p-2 text-sm text-text-muted'
      }
    >
      <span aria-hidden="true">{unlockedAt !== null ? '★' : '🔒'}</span>{' '}
      <span className="font-bold">{title}</span>
      <p className="mt-1">
        {unlockedAt !== null
          ? t('progression.achievement.unlockedOn', {
              date: formatUnlockedAt(unlockedAt, locale),
            })
          : t('progression.achievement.locked', { description })}
      </p>
    </li>
  )
}

function Loaded({ progress }: { progress: Progress }): ReactElement {
  const t = useT()
  const { locale } = useLocale()
  const span = progress.next_level_xp - progress.level_floor_xp
  const into = progress.xp_total - progress.level_floor_xp
  const nextLevel = progress.level + 1
  const rank = rankName(progress.rank, t)
  const amounts = { into: formatXp(into, locale), span: formatXp(span, locale) }
  // o aria-label da barra ja diz o nivel; o valor anunciado fica so com o XP, sem repetir o sufixo
  const valueText = t('progression.bar.valueText', amounts)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p data-testid="progress-level" className="font-display text-2xl text-text-primary">
            {t('progression.level', { level: progress.level })}
          </p>
          {rank !== null && (
            <Badge tone="neutral" data-testid="progress-rank">
              {t('progression.rank.label', { name: rank })}
            </Badge>
          )}
        </div>
        <p data-testid="progress-total" className="text-sm text-text-primary">
          {t('progression.xpTotal', { xp: formatXp(progress.xp_total, locale) })}
        </p>
      </div>
      {/* `parseProgress` garante custo de nivel positivo: o `max` da barra nunca e zero. */}
      <div className="mt-2">
        <ProgressBar
          value={into}
          max={span}
          label={t('progression.bar.label', { level: nextLevel })}
          valueText={valueText}
          data-testid="progress-bar"
        />
      </div>
      {/* nome e valor da barra ja dizem este texto: fora da arvore, para nao ser lido duas vezes */}
      <p data-testid="progress-bar-text" aria-hidden="true" className="text-sm text-text-primary">
        {t('progression.bar.text', { ...amounts, level: nextLevel })}
      </p>
      <details className="mt-3 border-t border-border-subtle pt-3">
        <summary className="min-h-6 w-fit cursor-pointer rounded-ui text-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          <h3 className="inline text-sm">{t('progression.achievements.title')}</h3>
        </summary>
        <ul role="list" className="mt-3 grid gap-2 sm:grid-cols-2">
          {progress.achievements.map((a) => (
            <AchievementItem key={a.code} achievement={a} />
          ))}
        </ul>
      </details>
    </div>
  )
}

function ProgressContent({
  state,
  onReload,
}: {
  state: ProgressState
  onReload: () => void
}): ReactElement {
  const t = useT()
  switch (state.status) {
    case 'loading':
      return (
        <StatusLine data-testid="progress-loading">{t('progression.panel.loading')}</StatusLine>
      )
    case 'error':
      return (
        <div
          role="alert"
          data-testid="progress-error"
          className="flex flex-col items-start gap-2 text-sm"
        >
          <p className="text-feedback-danger">
            <LoadFailureMessage
              failure={state.failure}
              unexpected="progression.panel.unexpectedFailure"
            />
          </p>
          <Button data-testid="progress-retry" onClick={onReload}>
            {t('progression.panel.retry')}
          </Button>
        </div>
      )
    case 'loaded':
      return (
        <>
          <Loaded progress={state.progress} />
          {state.refreshFailed && (
            <div
              role="alert"
              data-testid="progress-stale"
              className="mt-2 flex flex-col items-start gap-2 text-sm"
            >
              <p className="text-action-primary">{t('progression.panel.refreshFailed')}</p>
              <Button data-testid="progress-refresh" onClick={onReload}>
                {t('progression.panel.refresh')}
              </Button>
            </div>
          )}
        </>
      )
  }
}

/**
 * O painel de progresso do Quartel-General (D16): nivel, barra e conquistas.
 * O `ref` e o que a PAGINA usa para atualizar o painel depois de uma conclusao
 * (decisao P3: `refresh`, silencioso), como ja faz com o quadro.
 */
export function ProgressPanel({ ref }: { ref?: Ref<ProgressPanelHandle> }) {
  const t = useT()
  const { state, reload, refresh } = useProgress()
  useImperativeHandle(ref, () => ({ refresh }), [refresh])
  return (
    // O `div` leva a margem: o `Panel` nao recebe classe, e o espaco ate o quadro e de fora dele.
    <div className="mb-6">
      <Panel as="section" aria-labelledby="progress-heading" data-testid="progress">
        <h2 id="progress-heading" className="mb-3 text-lg text-text-primary">
          {t('progression.panel.title')}
        </h2>
        <ProgressContent state={state} onReload={reload} />
      </Panel>
    </div>
  )
}
