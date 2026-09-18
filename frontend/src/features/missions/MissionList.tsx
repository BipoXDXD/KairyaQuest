import type { ReactElement } from 'react'
import { MISSION_STATE_LABELS, type Mission } from './types'
import { useMissions, type MissionsState } from './useMissions'

/**
 * Formatador do prazo, criado UMA vez fora do componente.
 *
 * O prazo chega como string ISO com fuso, entao `new Date(...)` produz o
 * instante certo -- nunca se deve cortar a string na mao para formatar. O texto
 * visivel sai no fuso de quem le; o instante original continua exposto no
 * atributo `dateTime` do `<time>`, que e o que um teste (ou um leitor de tela)
 * pode conferir sem depender do fuso da maquina.
 */
const deadlineFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const CARD_CLASS =
  'rounded-lg border border-slate-700/70 bg-slate-900/60 p-4 shadow-sm ' +
  'focus-within:ring-2 focus-within:ring-emerald-400'

function MissionCard({ mission }: { mission: Mission }) {
  return (
    <li data-testid="mission-item" data-mission-id={mission.id} className={CARD_CLASS}>
      <div className="flex items-start justify-between gap-4">
        <h3 data-testid="mission-instructions" className="text-base font-semibold text-slate-100">
          {mission.instructions}
        </h3>
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
            {deadlineFormatter.format(new Date(mission.deadline))}
          </time>
        </dd>

        <dt className="text-slate-400">Dificuldade</dt>
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
    </li>
  )
}

/**
 * Os quatro estados da tela, um por ramo.
 *
 * O tipo de retorno `ReactElement` e declarado de proposito: com ele, um
 * estado novo em `MissionsState` torna o fim da funcao alcancavel e o `tsc`
 * reprova com "lacks ending return statement". Um `default` com mensagem
 * generica compilaria -- e engoliria o estado novo em silencio.
 */
function MissionsContent({
  state,
  onRetry,
}: {
  state: MissionsState
  onRetry: () => void
}): ReactElement {
  switch (state.status) {
    case 'loading':
      return (
        <p role="status" data-testid="missions-loading" className="text-sm text-slate-400">
          Convocando as missões…
        </p>
      )

    // Vazio e erro sao telas DIFERENTES porque pedem acoes opostas: aqui a
    // leitura funcionou e o quadro esta vazio; no erro, nao se sabe o que ha
    // no quadro.
    case 'empty':
      return (
        <p data-testid="missions-empty" className="text-sm text-slate-300">
          Nenhuma missão no quadro. Peça uma nova campanha à Tifa para começar.
        </p>
      )

    case 'error':
      return (
        <div
          role="alert"
          data-testid="missions-error"
          className="rounded-lg border border-red-500/50 bg-red-950/40 p-4 text-sm text-red-200"
        >
          <p className="font-semibold">Falha ao carregar as missões.</p>
          <p className="mt-1">{state.message}</p>
          <button
            type="button"
            data-testid="missions-retry"
            onClick={onRetry}
            className="mt-3 rounded border border-red-400/60 px-3 py-1 font-medium text-red-100 hover:bg-red-900/50 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:outline-none"
          >
            Tentar novamente
          </button>
        </div>
      )

    case 'loaded':
      return (
        <ul data-testid="missions-list" className="flex flex-col gap-3">
          {state.missions.map((mission) => (
            <MissionCard key={mission.id} mission={mission} />
          ))}
        </ul>
      )
  }
}

/**
 * O quadro de missoes do Quartel-General.
 *
 * A feature busca os proprios dados e resolve os proprios estados; ela nao
 * conhece a pagina que a compoe. A ordem da lista e a que a API devolveu
 * (ordenada por prazo) -- reordenar aqui criaria uma segunda politica de
 * ordenacao para discordar da primeira.
 */
export function MissionList() {
  const { state, reload } = useMissions()

  return (
    <section aria-labelledby="missions-heading" data-testid="missions">
      <h2 id="missions-heading" className="mb-3 text-lg font-semibold text-slate-200">
        Missões — tarefas com prazo
      </h2>
      <MissionsContent state={state} onRetry={reload} />
    </section>
  )
}
