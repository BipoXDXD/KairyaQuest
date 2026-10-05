import type { ReactElement } from 'react'
import { formatDeadline } from '../../shared/lib/deadline'
import { RESCHEDULE_REASON_LABELS } from '../../shared/types/mission'
import { BoardLink, DecisionControls, RecordedFailure } from './DecisionControls'
import type { ProposalCardProps, RescheduleMissionAction } from './types'
import { useDecideAction, type DecisionState } from './useDecideAction'

/**
 * O fim do cartao, um ramo por estado da acao.
 *
 * Tipo de retorno declarado: um estado novo em `ActionState` torna o fim
 * alcancavel e o `tsc` reprova (mesma tecnica do `ProposalCard`). O estado cru
 * e o `error_code` nunca vao para a tela.
 */
function Outcome({
  action,
  decision,
  onConfirm,
  onReject,
  onRefresh,
  boardHref,
  onGoToBoard,
}: {
  action: RescheduleMissionAction
  decision: DecisionState
  onConfirm: () => void
  onReject: () => void
  onRefresh: () => void
  boardHref: string
  onGoToBoard?: () => void
}): ReactElement {
  switch (action.state) {
    case 'proposta':
      return (
        <DecisionControls
          target={`o reagendamento: ${action.payload.instructions}`}
          decision={decision}
          onConfirm={onConfirm}
          onReject={onReject}
          onRefresh={onRefresh}
        />
      )
    case 'executada':
      return (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <p data-testid="proposal-rescheduled" className="font-medium text-emerald-300">
            Prazo reagendado
          </p>
          <BoardLink href={boardHref} onGoToBoard={onGoToBoard} />
        </div>
      )
    case 'recusada':
      return (
        <p data-testid="proposal-rejected" className="mt-3 text-sm text-slate-400">
          Proposta recusada
        </p>
      )
    case 'falhou':
      return (
        <RecordedFailure errorCode={action.error_code} announce={decision.status === 'failed'} />
      )
  }
}

/**
 * A proposta de reagendamento que a Tifa fez, como cartao (F22).
 *
 * Mostra o RETRATO que o backend gravou com a proposta (F16): a missao pelas
 * `instructions` e o prazo "de quando a Tifa propos" (`previous_deadline`).
 * Nao busca a missao -- isso seria importar `missions` (`docs/ARCHITECTURE.md`
 * §5, regra 1) -- e por isso o "Prazo atual" pode estar velho na hora de
 * confirmar (pendencia 114). A confirmacao revalida tudo no backend (F17), e
 * se a missao mudou a acao volta `falhou`/`reagendamento_invalido`.
 *
 * Como o cartao da criacao, guarda so o estado da decisao em andamento; a
 * acao e as chaves moram no painel.
 */
export function RescheduleProposalCard({
  action,
  keys,
  onChanged,
  onMissionCreated,
  onRefresh,
  boardHref,
  onGoToBoard,
}: ProposalCardProps<RescheduleMissionAction>) {
  const {
    state: decision,
    confirm,
    reject,
  } = useDecideAction(action, keys, {
    changed: onChanged,
    missionCreated: onMissionCreated,
  })
  const { payload } = action

  return (
    <div
      data-testid="tutor-reschedule-proposal"
      data-action-id={action.id}
      data-state={action.state}
      className="mt-3 min-w-0 wrap-anywhere rounded-lg border border-slate-700/70 bg-slate-900/60 p-3"
    >
      <h3 className="text-sm font-semibold text-slate-50">Proposta de reagendamento</h3>
      <p data-testid="reschedule-instructions" className="mt-1 text-sm text-slate-100">
        {payload.instructions}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-slate-300">
        <dt className="text-slate-400">Prazo atual</dt>
        <dd>
          <time data-testid="reschedule-previous-deadline" dateTime={payload.previous_deadline}>
            {formatDeadline(payload.previous_deadline)}
          </time>
        </dd>

        <dt className="text-slate-400">Prazo proposto</dt>
        <dd>
          <time data-testid="reschedule-new-deadline" dateTime={payload.new_deadline}>
            {formatDeadline(payload.new_deadline)}
          </time>
        </dd>
      </dl>
      <p data-testid="reschedule-reason" className="mt-1 text-sm text-slate-300">
        <span className="text-slate-400">Motivo: </span>
        {RESCHEDULE_REASON_LABELS[payload.reason]}
      </p>
      <Outcome
        action={action}
        decision={decision}
        onConfirm={confirm}
        onReject={reject}
        onRefresh={onRefresh}
        boardHref={boardHref}
        onGoToBoard={onGoToBoard}
      />
    </div>
  )
}
