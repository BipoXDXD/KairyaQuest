import type { ReactElement } from 'react'
import { formatDeadline } from '../../shared/lib/deadline'
import { MAX_DIFFICULTY } from '../../shared/types/mission'
import type { ActionRead } from './types'
import type { ActionKeys } from './useActionKeys'
import { useDecideAction, type DecisionState } from './useDecideAction'

const EXPIRED_TEXT = 'O prazo desta proposta já passou. Peça à Tifa uma nova proposta.'
const FAILED_TEXT = 'Esta proposta não pôde ser executada. Peça à Tifa uma nova proposta.'

const BUTTON =
  'rounded border border-emerald-400/60 px-3 py-1 text-sm font-medium text-emerald-100 ' +
  'hover:bg-emerald-900/50 focus-visible:ring-2 focus-visible:ring-emerald-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

const SECONDARY_BUTTON =
  'rounded border border-slate-400/60 px-3 py-1 text-sm font-medium text-slate-100 ' +
  'hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

function confirmLabel(decision: DecisionState): string {
  if (decision.status === 'confirming') {
    return 'Confirmando…'
  }
  return decision.status === 'failed' && decision.attempted === 'confirm'
    ? 'Tentar de novo'
    : 'Confirmar'
}

function rejectLabel(decision: DecisionState): string {
  if (decision.status === 'rejecting') {
    return 'Recusando…'
  }
  return decision.status === 'failed' && decision.attempted === 'reject'
    ? 'Tentar de novo'
    : 'Recusar'
}

/**
 * Confirmar e Recusar de uma proposta ainda em aberto.
 *
 * - **decidindo**: os DOIS botoes desabilitados. E a guarda contra o clique
 *   duplo (pendencia 34): o hook nao se protege sozinho.
 * - **falha que se repete**: o aviso, e o botao da acao tentada vira "Tentar
 *   de novo"; o outro volta ao normal.
 * - **falha que nao se repete** (ja decidida, nao existe mais): o aviso, e
 *   "Atualizar a conversa" no lugar dos dois. Repetir so daria o mesmo erro.
 *
 * O nome acessivel de cada botao completa QUAL proposta ele afeta, num
 * `sr-only`: com duas propostas na conversa, "Confirmar" sozinho seria o mesmo
 * nome nos dois. O espaco fica FORA do `span` (licao medida no Incremento A).
 */
function DecisionControls({
  instructions,
  decision,
  onConfirm,
  onReject,
  onRefresh,
}: {
  instructions: string
  decision: DecisionState
  onConfirm: () => void
  onReject: () => void
  onRefresh: () => void
}) {
  const failure = decision.status === 'failed' ? decision.failure : null
  const busy = decision.status === 'confirming' || decision.status === 'rejecting'

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {failure?.recovery === 'refresh' ? (
        <button
          type="button"
          data-testid="proposal-refresh"
          onClick={onRefresh}
          className={SECONDARY_BUTTON}
        >
          Atualizar a conversa
        </button>
      ) : (
        <>
          <button
            type="button"
            data-testid="proposal-confirm"
            disabled={busy}
            onClick={onConfirm}
            className={BUTTON}
          >
            {confirmLabel(decision)} <span className="sr-only">a proposta: {instructions}</span>
          </button>
          <button
            type="button"
            data-testid="proposal-reject"
            disabled={busy}
            onClick={onReject}
            className={SECONDARY_BUTTON}
          >
            {rejectLabel(decision)} <span className="sr-only">a proposta: {instructions}</span>
          </button>
        </>
      )}
      {failure !== null && (
        <p role="alert" data-testid="proposal-failure" className="w-full text-sm text-red-300">
          {failure.message}
        </p>
      )}
    </div>
  )
}

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
  action: ActionRead
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
          instructions={action.payload.instructions}
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
          {/* No celular a folha cobre o quadro: quem a desenha passa
              `onGoToBoard` para fecha-la. No desktop o painel fica ao lado, e
              o link so segue o endereco. */}
          <a
            href={boardHref}
            data-testid="proposal-board-link"
            onClick={onGoToBoard}
            className="text-emerald-200 underline hover:text-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
          >
            Ver no Quartel-General
          </a>
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
        <p data-testid="proposal-expired" className="mt-3 text-sm text-amber-200">
          {action.error_code === 'prazo_expirado' ? EXPIRED_TEXT : FAILED_TEXT}
        </p>
      )
  }
}

/**
 * A proposta de missao que a Tifa fez, como cartao.
 *
 * A acao e as chaves moram ACIMA (no painel): uma recarga da conversa remonta
 * este cartao, e o que sobrevive a ela nao pode morar aqui. O cartao guarda so
 * o estado da decisao em andamento.
 */
export function ProposalCard({
  action,
  keys,
  onChanged,
  onMissionCreated,
  onRefresh,
  boardHref,
  onGoToBoard,
}: {
  action: ActionRead
  keys: ActionKeys
  onChanged: (action: ActionRead) => void
  onMissionCreated: () => void
  onRefresh: () => void
  boardHref: string
  onGoToBoard?: () => void
}) {
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
      className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/60 p-3"
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
