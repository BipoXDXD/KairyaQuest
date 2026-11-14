import type { ReactElement } from 'react'
import { formatDeadline } from '../../shared/lib/deadline'
import { MAX_DIFFICULTY } from '../../shared/types/mission'
import { BoardLink, DecisionControls, RecordedFailure } from './DecisionControls'
import { RescheduleProposalCard } from './RescheduleProposalCard'
import type { CreateMissionAction, ProposalCardProps } from './types'
import { useDecideAction, type DecisionState } from './useDecideAction'
import { useLocale } from '../../shared/i18n/useLocale'
import { useT } from '../../shared/i18n/useT'
import { Panel } from '../../shared/ui'

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
  const t = useT()
  switch (action.state) {
    case 'proposta':
      return (
        <DecisionControls
          target={t('tutoring.proposal.target', { instructions: action.payload.instructions })}
          decision={decision}
          onConfirm={onConfirm}
          onReject={onReject}
          onRefresh={onRefresh}
        />
      )
    case 'executada':
      return (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <p data-testid="proposal-created" className="font-bold text-feedback-success">
            {t('tutoring.proposal.created')}
          </p>
          <BoardLink href={boardHref} onGoToBoard={onGoToBoard} />
        </div>
      )
    case 'recusada':
      return (
        <p data-testid="proposal-rejected" className="mt-3 text-sm text-text-muted">
          {t('tutoring.proposal.rejected')}
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
  const t = useT()
  const { locale } = useLocale()
  const { payload } = action

  return (
    <div
      data-testid="tutor-proposal"
      data-action-id={action.id}
      data-state={action.state}
      className="mt-3 min-w-0 wrap-anywhere"
    >
      <Panel>
        <h3 className="text-sm text-text-primary">{t('tutoring.proposal.title')}</h3>
        <p data-testid="proposal-instructions" className="mt-1 text-sm text-text-primary">
          {payload.instructions}
        </p>
        <p className="mt-1 text-sm text-text-primary">
          <span className="text-text-muted">{t('tutoring.proposal.criterion')} </span>
          {payload.completion_criterion}
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-text-primary">
          <dt className="text-text-muted">{t('tutoring.proposal.difficulty')}</dt>
          {/* O teto vem de `MAX_DIFFICULTY`, em `shared/types/mission.ts`: esta
            feature importa so de `shared/`, nunca de `missions/`
            (`docs/ARCHITECTURE.md` §5, regra 1). */}
          <dd data-testid="proposal-difficulty">
            {t('tutoring.proposal.difficultyValue', {
              value: payload.difficulty,
              max: MAX_DIFFICULTY,
            })}
          </dd>

          <dt className="text-text-muted">{t('tutoring.proposal.estimate')}</dt>
          <dd data-testid="proposal-estimated-minutes">
            {t('tutoring.proposal.minutes', { minutes: payload.estimated_minutes })}
          </dd>

          <dt className="text-text-muted">{t('tutoring.proposal.deadline')}</dt>
          <dd>
            <time data-testid="proposal-deadline" dateTime={payload.deadline}>
              {formatDeadline(payload.deadline, locale)}
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
      </Panel>
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
  const t = useT()
  const { id } = action as { id: unknown }
  return (
    <div data-testid="tutor-proposal-unknown" data-action-id={String(id)} className="mt-3">
      <Panel>
        <p className="text-sm text-text-muted">{t('tutoring.proposal.unknown')}</p>
      </Panel>
    </div>
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
