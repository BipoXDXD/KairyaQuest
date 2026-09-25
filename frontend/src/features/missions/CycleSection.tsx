import type { ReactElement } from 'react'
import { formatCivilDate } from './civilDate'
import { MissionCard } from './MissionCard'
import { DAYS_PER_MILESTONE, type Cycle } from './types'
import type { CompletionRegistry } from './useCompletionRegistry'
import { useCompletionRegistry } from './useCompletionRegistry'
import { useCycle, type CycleState } from './useCycle'

/** "1 dia seguido" / "3 dias seguidos". */
function streakLabel(days: number): string {
  return days === 1 ? '1 dia seguido' : `${String(days)} dias seguidos`
}

/** "falta 1 dia" / "faltam 4 dias". */
function remainingLabel(days: number): string {
  return days === 1 ? 'falta 1 dia' : `faltam ${String(days)} dias`
}

interface CardProps {
  registry: CompletionRegistry
  onReload: () => void
  reloadWaiting: boolean
  onCompleted: () => void
}

/**
 * O ciclo carregado: a missao de hoje (ou "sem plano"), a sequencia, e o
 * progresso ate a especial -- ou o cartao dela, quando esta vigente.
 *
 * Os cartoes sao os MESMOS do quadro de avulsas (`MissionCard`): a conclusao
 * da diaria segue as mesmas regras de chave e reenvio. O `onCompleted` e o
 * `refresh` silencioso (decisao P9): a sequencia muda sem desmontar o cartao.
 */
function CycleLoaded({
  cycle,
  refreshFailed,
  card,
}: {
  cycle: Cycle
  refreshFailed: boolean
  card: CardProps
}) {
  return (
    <div className="flex flex-col gap-3">
      <p data-testid="cycle-today" className="text-sm text-slate-400">
        Hoje é {formatCivilDate(cycle.today)}.
      </p>
      {cycle.mission === null ? (
        <p data-testid="cycle-no-plan" className="text-sm text-slate-300">
          Sem plano nesta semana: não há diária para hoje. Um dia sem plano não quebra a sua
          sequência.
        </p>
      ) : (
        <ul role="list" className="flex flex-col gap-3">
          <MissionCard mission={cycle.mission} {...card} />
        </ul>
      )}
      <p data-testid="cycle-streak" className="text-sm font-medium text-slate-200">
        Sequência: {streakLabel(cycle.streak)}
      </p>
      {cycle.special === null ? (
        <p data-testid="cycle-progress" className="text-sm text-slate-300">
          Missão especial: {cycle.streak % DAYS_PER_MILESTONE} de {DAYS_PER_MILESTONE} —{' '}
          {remainingLabel(cycle.days_to_milestone)}.
        </p>
      ) : (
        <div data-testid="cycle-special">
          <h3 className="mb-2 text-base font-semibold text-emerald-200">
            Missão especial — bônus da sequência
          </h3>
          <ul role="list" className="flex flex-col gap-3">
            <MissionCard mission={cycle.special} {...card} />
          </ul>
        </div>
      )}
      {refreshFailed && (
        <div role="alert" data-testid="cycle-stale" className="text-sm text-amber-200">
          <p>Não foi possível atualizar a sequência.</p>
          <button
            type="button"
            data-testid="cycle-refresh"
            onClick={card.onReload}
            className="mt-2 rounded border border-amber-300/60 px-3 py-1 font-medium text-amber-100 hover:bg-amber-900/40 focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:outline-none"
          >
            Atualizar
          </button>
        </div>
      )}
    </div>
  )
}

/** Um estado por ramo; `ReactElement` faz um estado novo reprovar o `tsc`. */
function CycleContent({ state, card }: { state: CycleState; card: CardProps }): ReactElement {
  switch (state.status) {
    case 'loading':
      return (
        <p role="status" data-testid="cycle-loading" className="text-sm text-slate-400">
          Consultando o ciclo…
        </p>
      )
    case 'error':
      return (
        <div
          role="alert"
          data-testid="cycle-error"
          className="rounded-lg border border-red-500/50 bg-red-950/40 p-4 text-sm text-red-200"
        >
          <p className="font-semibold">Falha ao carregar o ciclo.</p>
          <p className="mt-1">{state.message}</p>
          <button
            type="button"
            data-testid="cycle-retry"
            onClick={card.onReload}
            className="mt-3 rounded border border-red-400/60 px-3 py-1 font-medium text-red-100 hover:bg-red-900/50 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:outline-none"
          >
            Tentar novamente
          </button>
        </div>
      )
    case 'loaded':
      return <CycleLoaded cycle={state.cycle} refreshFailed={state.refreshFailed} card={card} />
  }
}

/**
 * "Missão de hoje" no Quartel-General (Incremento B).
 *
 * O registro das conclusoes e PROPRIO desta secao, e nao o do quadro de
 * avulsas: os conjuntos de missoes sao disjuntos (diaria e especial aqui,
 * avulsas la), e cada registro espera so as conclusoes que o reload DELE
 * remontaria.
 */
export function CycleSection() {
  const { state, reload, refresh } = useCycle()
  const { registry, reload: requestReload, waitingForCompletion } = useCompletionRegistry(reload)
  const card: CardProps = {
    registry,
    onReload: requestReload,
    reloadWaiting: waitingForCompletion,
    onCompleted: refresh,
  }
  return (
    <section aria-labelledby="cycle-heading" data-testid="cycle" className="mb-8">
      <h2 id="cycle-heading" className="mb-3 text-lg font-semibold text-slate-200">
        Missão de hoje — sua diária
      </h2>
      <CycleContent state={state} card={card} />
    </section>
  )
}
