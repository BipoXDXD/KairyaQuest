import type { ReactElement } from 'react'
import { formatDeadline } from '../../shared/lib/deadline'
import { MAX_DIFFICULTY } from '../../shared/types/mission'
import { BoardLink, DecisionControls, RecordedFailure } from './DecisionControls'
import { RescheduleProposalCard } from './RescheduleProposalCard'
import type { CreateMissionAction, ProposalCardProps } from './types'
import { useDecideAction, type DecisionState } from './useDecideAction'

/**
 * O fim do cartao, um ramo por estado da acao.
 *
 * Tipo de retorno declarado: um estado novo em `ActionState` torna o fim
 * alcancavel e o `tsc` reprova (mesma tecnica de `MissionList.tsx`). O estado
 * cru e o `error_code` nunca vao para a tela.
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
  action: CreateMissionAction
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
          target={`a proposta: ${action.payload.instructions}`}
          decision={decision}
          onConfirm={onConfirm}
          onReject={onReject}
          onRefresh={onRefresh}
        />
      )
    case 'executada':
      return (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <p data-testid="proposal-created" className="font-medium text-emerald-300">
            Missão criada
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
 * A proposta de missao que a Kairya fez, como cartao.
 *
 * A acao e as chaves moram ACIMA (no painel): uma recarga da conversa remonta
 * este cartao, e o que sobrevive a ela nao pode morar aqui. O cartao guarda so
 * o estado da decisao em andamento.
 */
function MissionProposalCard({
  action,
  keys,
  onChanged,
  onMissionCreated,
  onRefresh,
  boardHref,
  onGoToBoard,
}: ProposalCardProps<CreateMissionAction>) {
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
      data-testid="tutor-proposal"
      data-action-id={action.id}
      data-state={action.state}
      className="mt-3 min-w-0 wrap-anywhere rounded-lg border border-slate-700/70 bg-slate-900/60 p-3"
    >
      <h3 className="text-sm font-semibold text-slate-50">Proposta de missão</h3>
      <p data-testid="proposal-instructions" className="mt-1 text-sm text-slate-100">
        {payload.instructions}
      </p>
      <p className="mt-1 text-sm text-slate-300">
        <span className="text-slate-400">Critério de conclusão: </span>
        {payload.completion_criterion}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-slate-300">
        <dt className="text-slate-400">Dificuldade</dt>
        {/* O teto vem de `MAX_DIFFICULTY`, em `shared/types/mission.ts`: esta
            feature importa so de `shared/`, nunca de `missions/`
            (`docs/ARCHITECTURE.md` §5, regra 1). */}
        <dd data-testid="proposal-difficulty">
          {payload.difficulty} de {MAX_DIFFICULTY}
        </dd>

        <dt className="text-slate-400">Estimativa</dt>
        <dd data-testid="proposal-estimated-minutes">{payload.estimated_minutes} min</dd>

        <dt className="text-slate-400">Prazo</dt>
        <dd>
          <time data-testid="proposal-deadline" dateTime={payload.deadline}>
            {formatDeadline(payload.deadline)}
          </time>
        </dd>
      </dl>
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

/**
 * A acao de um `kind` que esta versao nao conhece -- uma API mais nova, com
 * uma ferramenta que este cliente ainda nao sabe desenhar.
 *
 * O parametro e `never`: com um ramo faltando no `switch` do `ProposalCard`,
 * a acao que chega aqui deixa de ser `never` e o `tsc` reprova. Em tempo de
 * execucao, o valor fora do tipo cai aqui e a conversa continua; o `kind` cru
 * nao vai para a tela, e nada pode ser decidido (o que confirmar faria, este
 * cliente nao sabe dizer).
 */
function UnknownProposal({ action }: { action: never }): ReactElement {
  const { id } = action as { id: unknown }
  return (
    <p
      data-testid="tutor-proposal-unknown"
      data-action-id={String(id)}
      className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/60 p-3 text-sm text-slate-300"
    >
      Proposta que esta versão não sabe mostrar.
    </p>
  )
}

/**
 * O cartao de uma acao proposta pela Kairya, escolhido pelo `kind` (F22).
 *
 * Os dois cartoes mostram coisas diferentes -- uma missao nova; dois prazos e
 * um motivo -- e compartilham so os controles de decisao, o link do quadro e
 * o texto da falha gravada (`DecisionControls`, `BoardLink`,
 * `failedActionText`).
 *
 * A escolha mora AQUI, e nao no painel, porque quem monta o cartao guarda a
 * acao como a uniao `ActionRead` (o estado da conversa, e o `Harness` dos
 * testes do cartao da criacao, que nao mudaram).
 *
 * Tipo de retorno declarado e `default` com `never`: um `kind` novo em
 * `ActionRead` reprova o `tsc` ate ganhar cartao.
 */
export function ProposalCard(props: ProposalCardProps): ReactElement {
  const { action } = props
  switch (action.kind) {
    case 'create_mission':
      return <MissionProposalCard {...props} action={action} />
    case 'reschedule_mission':
      return <RescheduleProposalCard {...props} action={action} />
    default:
      return <UnknownProposal action={action} />
  }
}
