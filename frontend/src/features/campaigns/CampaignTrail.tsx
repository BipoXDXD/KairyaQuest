import type { ReactElement } from 'react'
import { civilWeekday, formatCivilDate } from '../../shared/lib/civilDate'
import {
  DAYS_PER_MILESTONE,
  MAX_DIFFICULTY,
  type Availability,
  type Mission,
} from '../../shared/types/mission'
import { AVAILABILITY_DISPLAY } from './availability'
import type { Plan, PlanDay, PlanSpecial } from './types'
import { useCurrentPlan, type CurrentPlanState } from './useCurrentPlan'

/**
 * O TOM (cor da borda e do texto) de cada disponibilidade -- so apresentacao,
 * e por isso mora aqui e nao em `AVAILABILITY_DISPLAY` (que e o contrato
 * exaustivo de texto e icone, testado por `availability.test.ts`).
 */
const AVAILABILITY_TONE: Record<Availability, string> = {
  fora_do_plano: 'border-slate-500/60 text-slate-300',
  bloqueada: 'border-amber-400/50 text-amber-200',
  disponivel: 'border-sky-400/60 text-sky-200',
  concluida: 'border-emerald-400/60 text-emerald-300',
  perdida: 'border-red-400/60 text-red-300',
  expirada: 'border-red-400/60 text-red-300',
}

/** O bau fechado (B3 da spec do ciclo), desenhado a mao como os icones de `availability.ts`. */
const CHEST_ICON = 'M3 10h18v10H3zM3 10V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v2M11 13h2v3h-2z'

function Icon({ d, name, className }: { d: string; name: string; className: string }) {
  return (
    <svg
      aria-hidden="true"
      data-icon={name}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  )
}

function AvailabilityBadge({ availability }: { availability: Availability }) {
  const { label, icon } = AVAILABILITY_DISPLAY[availability]
  const tone = AVAILABILITY_TONE[availability]
  return (
    <span
      data-testid="trail-availability"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      <Icon d={icon} name={availability} className="h-3.5 w-3.5" />
      <span>{label}</span>
    </span>
  )
}

/** O bau: so o texto de quando ele se abre, nunca o conteudo (C11). */
function Chest({ children }: { children: string }) {
  return (
    <p
      data-testid="trail-chest"
      className="mt-2 flex items-center gap-2 rounded border border-dashed border-amber-400/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-100"
    >
      <Icon d={CHEST_ICON} name="bau" className="h-5 w-5 shrink-0 text-amber-300" />
      <span>{children}</span>
    </p>
  )
}

/** O conteudo de uma missao ja revelada. So leitura: a trilha nao conclui. */
function MissionContent({ mission }: { mission: Mission }) {
  return (
    <div data-testid="trail-mission" className="mt-2">
      <p className="text-sm font-semibold text-slate-100">{mission.instructions}</p>
      <p className="mt-1 text-sm text-slate-300">
        <span className="text-slate-400">Critério de conclusão: </span>
        {mission.completion_criterion}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-300 sm:grid-cols-3">
        <dt className="text-slate-400">Dificuldade</dt>
        <dd data-testid="trail-difficulty">
          {mission.difficulty} de {MAX_DIFFICULTY}
        </dd>
        <dt className="text-slate-400">Estimativa</dt>
        <dd data-testid="trail-estimated-minutes">{mission.estimated_minutes} min</dd>
        <dt className="text-slate-400">Recompensa</dt>
        <dd data-testid="trail-xp">{mission.xp} XP</dd>
      </dl>
    </div>
  )
}

/**
 * A orientacao para concluir, no lugar de um botao Concluir (decisao do C,
 * ver o comentario de `CampaignTrail`). Com a acao de navegacao, vira um
 * botao; sem ela, e texto. O nome acessivel do botao completa QUAL missao,
 * porque a diaria de hoje e a especial podem estar disponiveis ao mesmo tempo.
 */
function HeadquartersHint({
  mission,
  onOpenHeadquarters,
}: {
  mission: Mission
  onOpenHeadquarters?: () => void
}) {
  if (onOpenHeadquarters === undefined) {
    return (
      <p data-testid="trail-go-headquarters" className="mt-3 text-sm text-sky-200">
        Conclua esta missão no Quartel-General.
      </p>
    )
  }
  return (
    <button
      type="button"
      data-testid="trail-go-headquarters"
      onClick={onOpenHeadquarters}
      className="mt-3 rounded border border-sky-400/60 px-3 py-1 text-sm font-medium text-sky-100 hover:bg-sky-900/40 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
    >
      Ir ao Quartel-General <span className="sr-only">para concluir: {mission.instructions}</span>
    </button>
  )
}

const ITEM_CLASS =
  'rounded-lg border border-slate-700/70 bg-slate-900/60 p-4 shadow-sm ' +
  'focus-within:ring-2 focus-within:ring-emerald-400'

function TrailDay({
  day,
  isToday,
  onOpenHeadquarters,
}: {
  day: PlanDay
  isToday: boolean
  onOpenHeadquarters?: () => void
}) {
  return (
    <li
      data-testid="trail-day"
      data-day={day.day}
      data-availability={day.availability}
      className={ITEM_CLASS}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-100">
          <time dateTime={day.day}>{formatCivilDate(day.day)}</time>
          {isToday && (
            <>
              {' '}
              <span
                data-testid="trail-today"
                className="ml-1 rounded bg-emerald-900/60 px-1.5 py-0.5 text-xs font-medium text-emerald-200"
              >
                Hoje
              </span>
            </>
          )}
        </h3>
        <AvailabilityBadge availability={day.availability} />
      </div>
      {day.mission === null ? (
        <Chest>{`Missão de ${civilWeekday(day.day)} — revelada no dia`}</Chest>
      ) : (
        <>
          <MissionContent mission={day.mission} />
          {day.availability === 'disponivel' && (
            <HeadquartersHint mission={day.mission} onOpenHeadquarters={onOpenHeadquarters} />
          )}
        </>
      )}
    </li>
  )
}

/**
 * A especial. Bloqueada, e um bau com o "N de 7" (o progresso ate o PROXIMO
 * marco). Desbloqueada -- disponivel, concluida ou expirada --, mostra o
 * conteudo e NAO o "N de 7": ao lado da especial deste marco, a contagem do
 * proximo pareceria contradizer o que esta na tela.
 */
function TrailSpecial({
  special,
  onOpenHeadquarters,
}: {
  special: PlanSpecial
  onOpenHeadquarters?: () => void
}) {
  return (
    <section
      aria-labelledby="trail-special-heading"
      data-testid="trail-special"
      className={`${ITEM_CLASS} mt-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id="trail-special-heading" className="text-base font-semibold text-emerald-200">
          Missão especial — bônus da sequência
        </h3>
        <AvailabilityBadge availability={special.availability} />
      </div>
      {special.mission === null ? (
        <>
          <Chest>{`Missão especial — revelada ao completar ${String(DAYS_PER_MILESTONE)} dias seguidos`}</Chest>
          <p data-testid="trail-special-progress" className="mt-2 text-sm text-slate-300">
            Progresso até a especial: {special.progress} de {DAYS_PER_MILESTONE}
          </p>
        </>
      ) : (
        <>
          <MissionContent mission={special.mission} />
          {special.availability === 'disponivel' && (
            <HeadquartersHint mission={special.mission} onOpenHeadquarters={onOpenHeadquarters} />
          )}
        </>
      )}
    </section>
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
  // Hoje e o ULTIMO dia revelado: a API revela hoje e os anteriores e manda
  // os futuros como bau (B3), e o plano corrente e sempre o da semana de hoje.
  const todayIndex = plan.days.findLastIndex((day) => day.mission !== null)
  return (
    <div>
      <p data-testid="trail-week" className="mb-3 text-sm text-slate-400">
        Semana de {formatCivilDate(plan.week_start)}.
      </p>
      <ol role="list" aria-label="Dias da semana" className="flex flex-col gap-3">
        {plan.days.map((day, index) => (
          <TrailDay
            key={day.day}
            day={day}
            isToday={index === todayIndex}
            onOpenHeadquarters={onOpenHeadquarters}
          />
        ))}
      </ol>
      <TrailSpecial special={plan.special} onOpenHeadquarters={onOpenHeadquarters} />
      {refreshFailed && (
        <div role="alert" data-testid="trail-stale" className="mt-4 text-sm text-amber-200">
          <p>Não foi possível atualizar a trilha.</p>
          <button
            type="button"
            data-testid="trail-refresh"
            onClick={reload}
            className="mt-2 rounded border border-amber-300/60 px-3 py-1 font-medium text-amber-100 hover:bg-amber-900/40 focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:outline-none"
          >
            Atualizar
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Um estado por ramo; `ReactElement` faz um estado novo reprovar o `tsc`.
 *
 * Antes, esta funcao era exportada a parte para o teste do
 * `trail-stale`: nenhum evento chamava `refresh()`, entao o unico jeito
 * de exercitar o ramo `refreshFailed` era dar o estado pronto direto a ela.
 * Com `useRefreshOnReturn` ligando o `refresh` real (a aba que volta a ficar
 * visivel), `CampaignTrail.test.tsx` passou a exercitar o mesmo ramo pelo
 * caminho de verdade -- o export deixou de ter uso e foi removido.
 */
function TrailContent({
  state,
  reload,
  onOpenHeadquarters,
}: {
  state: CurrentPlanState
  reload: () => void
  onOpenHeadquarters?: () => void
}): ReactElement {
  switch (state.status) {
    case 'loading':
      return (
        <p role="status" data-testid="trail-loading" className="text-sm text-slate-400">
          Consultando a trilha…
        </p>
      )
    case 'error':
      return (
        <div
          role="alert"
          data-testid="trail-error"
          className="rounded-lg border border-red-500/50 bg-red-950/40 p-4 text-sm text-red-200"
        >
          <p className="font-semibold">Falha ao carregar a trilha.</p>
          <p className="mt-1">{state.message}</p>
          <button
            type="button"
            data-testid="trail-retry"
            onClick={reload}
            className="mt-3 rounded border border-red-400/60 px-3 py-1 font-medium text-red-100 hover:bg-red-900/50 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:outline-none"
          >
            Tentar novamente
          </button>
        </div>
      )
    case 'no-plan':
      return (
        <p data-testid="trail-no-plan" className="text-sm text-slate-300">
          Sem plano nesta semana. Um dia sem plano não quebra a sequência, e a trilha volta a
          mostrar os dias assim que houver um plano para a semana atual.
        </p>
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
 * Campanhas -- a trilha da semana (Incremento C; spec do ciclo, Frontend).
 *
 * Os sete dias da semana ATUAL, com a disponibilidade em texto e icone; os
 * dias revelados (hoje e anteriores) com o conteudo; os futuros e a especial
 * bloqueada como bau fechado. Nenhuma semana futura.
 *
 * **A trilha so mostra; quem conclui e o Quartel-General** (decisao do C). A
 * spec poe o botao Concluir no Quartel-General, e duplicar o fluxo aqui daria
 * dois lugares com a mesma missao e dois registros de `operation_id` que nao
 * se conhecem -- uma conclusao em voo num deles nao seria vista pelo outro.
 * No lugar do Concluir, o dia disponivel orienta ir ao Quartel-General; com
 * `onOpenHeadquarters` (a navegacao, que e da pagina), a orientacao vira um
 * botao.
 *
 * A trilha e lida ao montar, e atualizada em silencio (`useRefreshOnReturn`,
 * dentro de `useCurrentPlan`) quando a aba volta a ficar visivel ou a janela
 * recebe foco: sem isso, a aba aberta na virada do dia mostraria o dia
 * anterior ate recarregar. Se essa atualizacao falhar, o aviso `trail-stale`
 * avisa que a trilha pode estar desatualizada.
 */
export function CampaignTrail({
  onOpenHeadquarters,
}: {
  onOpenHeadquarters?: () => void
} = {}) {
  const { state, reload } = useCurrentPlan()
  return (
    <section aria-labelledby="campaign-trail-heading" data-testid="campaign-trail">
      <h2 id="campaign-trail-heading" className="mb-3 text-lg font-semibold text-slate-200">
        Trilha da semana
      </h2>
      <TrailContent state={state} reload={reload} onOpenHeadquarters={onOpenHeadquarters} />
    </section>
  )
}
