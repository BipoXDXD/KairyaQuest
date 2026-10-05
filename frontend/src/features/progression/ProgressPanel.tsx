import { useImperativeHandle, type ReactElement, type Ref } from 'react'
import { formatUnlockedAt } from './unlockedDate'
import type { Achievement, Progress } from './types'
import { useProgress, type ProgressState } from './useProgress'

export interface ProgressPanelHandle {
  refresh: () => void
}

const xpFormat = new Intl.NumberFormat('pt-BR')

function AchievementItem({ achievement }: { achievement: Achievement }): ReactElement {
  const unlocked = achievement.unlocked_at !== null
  return (
    <li
      data-testid="progress-achievement"
      data-code={achievement.code}
      data-unlocked={String(unlocked)}
      className={
        unlocked
          ? 'rounded border border-emerald-400/60 p-2 text-sm text-slate-100'
          : 'rounded border border-slate-700 p-2 text-sm text-slate-400'
      }
    >
      <span aria-hidden="true">{unlocked ? '★' : '🔒'}</span>{' '}
      <span className="font-medium">{achievement.title}</span>
      <p className="mt-1">
        {unlocked
          ? `Conquistada em ${formatUnlockedAt(achievement.unlocked_at!)}`
          : `Bloqueada: ${achievement.description}`}
      </p>
    </li>
  )
}

function Loaded({ progress }: { progress: Progress }): ReactElement {
  const span = progress.next_level_xp - progress.level_floor_xp
  const into = progress.xp_total - progress.level_floor_xp
  const nextLevel = `até o nível ${String(progress.level + 1)}`
  // o aria-label da barra ja diz o nivel; o valor anunciado fica so com o XP, sem repetir o sufixo
  const valueText = `${xpFormat.format(into)} de ${xpFormat.format(span)} XP`
  const text = `${valueText} ${nextLevel}`
  return (
    <div className="rpg-progress-content">
      <p
        data-testid="progress-level"
        className="progress-level-value text-xl font-bold text-slate-50"
      >
        Nível {progress.level}
      </p>
      <p data-testid="progress-total" className="progress-total-value text-sm text-slate-300">
        {xpFormat.format(progress.xp_total)} XP no total
      </p>
      <div
        role="progressbar"
        data-testid="progress-bar"
        aria-label={`Progresso ${nextLevel}`}
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
        {text}
      </p>
      <details className="progress-achievements">
        <summary>
          <h3 className="inline text-sm font-semibold text-slate-200">Conquistas</h3>
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
  switch (state.status) {
    case 'loading':
      return (
        <p role="status" data-testid="progress-loading" className="text-sm text-slate-400">
          Consultando o seu progresso…
        </p>
      )
    case 'error':
      return (
        <div role="alert" data-testid="progress-error" className="text-sm text-red-300">
          <p>{state.message}</p>
          <button
            type="button"
            data-testid="progress-retry"
            onClick={onReload}
            className="mt-2 rounded border border-red-300/60 px-3 py-1 font-medium"
          >
            Tentar novamente
          </button>
        </div>
      )
    case 'loaded':
      return (
        <>
          <Loaded progress={state.progress} />
          {state.refreshFailed && (
            <div role="alert" data-testid="progress-stale" className="mt-2 text-sm text-amber-200">
              <p>Não foi possível atualizar o progresso.</p>
              <button
                type="button"
                data-testid="progress-refresh"
                onClick={onReload}
                className="mt-2 rounded border border-amber-300/60 px-3 py-1 font-medium text-amber-100"
              >
                Atualizar
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
  const { state, reload, refresh } = useProgress()
  useImperativeHandle(ref, () => ({ refresh }), [refresh])
  return (
    <section
      aria-labelledby="progress-heading"
      data-testid="progress"
      className="rpg-progress mb-8"
    >
      <h2 id="progress-heading" className="mb-3 text-lg font-semibold text-slate-200">
        Seu progresso — nível e conquistas
      </h2>
      <ProgressContent state={state} onReload={reload} />
    </section>
  )
}
