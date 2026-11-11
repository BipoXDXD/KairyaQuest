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
import { Badge } from '../../shared/ui/Badge'

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
          ? 'rounded border border-emerald-400/60 p-2 text-sm text-slate-100'
          : 'rounded border border-slate-700 p-2 text-sm text-slate-400'
      }
    >
      <span aria-hidden="true">{unlockedAt !== null ? '★' : '🔒'}</span>{' '}
      <span className="font-medium">{title}</span>
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
    <div className="rpg-progress-content">
      <p
        data-testid="progress-level"
        className="progress-level-value text-xl font-bold text-slate-50"
      >
        {t('progression.level', { level: progress.level })}
      </p>
      {rank !== null && (
        <Badge tone="neutral" data-testid="progress-rank">
          {t('progression.rank.label', { name: rank })}
        </Badge>
      )}
      <p data-testid="progress-total" className="progress-total-value text-sm text-slate-300">
        {t('progression.xpTotal', { xp: formatXp(progress.xp_total, locale) })}
      </p>
      <div
        role="progressbar"
        data-testid="progress-bar"
        aria-label={t('progression.bar.label', { level: nextLevel })}
        aria-valuemin={0}
        aria-valuemax={span}
        aria-valuenow={into}
        aria-valuetext={valueText}
        className="mt-2 h-2 w-full rounded bg-slate-800"
      >
        <div
          className="h-2 rounded bg-emerald-400"
          style={{ width: `${String((into / span) * 100)}%` }}
        />
      </div>
      {/* nome e valor da barra ja dizem este texto: fora da arvore, para nao ser lido duas vezes */}
      <p data-testid="progress-bar-text" aria-hidden="true" className="mt-1 text-sm text-slate-300">
        {t('progression.bar.text', { ...amounts, level: nextLevel })}
      </p>
      <details className="progress-achievements">
        <summary>
          <h3 className="inline text-sm font-semibold text-slate-200">
            {t('progression.achievements.title')}
          </h3>
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
        <p role="status" data-testid="progress-loading" className="text-sm text-slate-400">
          {t('progression.panel.loading')}
        </p>
      )
    case 'error':
      return (
        <div role="alert" data-testid="progress-error" className="text-sm text-red-300">
          <p>
            <LoadFailureMessage
              failure={state.failure}
              unexpected="progression.panel.unexpectedFailure"
            />
          </p>
          <button
            type="button"
            data-testid="progress-retry"
            onClick={onReload}
            className="mt-2 rounded border border-red-300/60 px-3 py-1 font-medium"
          >
            {t('progression.panel.retry')}
          </button>
        </div>
      )
    case 'loaded':
      return (
        <>
          <Loaded progress={state.progress} />
          {state.refreshFailed && (
            <div role="alert" data-testid="progress-stale" className="mt-2 text-sm text-amber-200">
              <p>{t('progression.panel.refreshFailed')}</p>
              <button
                type="button"
                data-testid="progress-refresh"
                onClick={onReload}
                className="mt-2 rounded border border-amber-300/60 px-3 py-1 font-medium text-amber-100"
              >
                {t('progression.panel.refresh')}
              </button>
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
    <section
      aria-labelledby="progress-heading"
      data-testid="progress"
      className="rpg-progress mb-8"
    >
      <h2 id="progress-heading" className="mb-3 text-lg font-semibold text-slate-200">
        {t('progression.panel.title')}
      </h2>
      <ProgressContent state={state} onReload={reload} />
    </section>
  )
}
