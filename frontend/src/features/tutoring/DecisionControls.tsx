import { failedActionText } from './actionFailure'
import type { DecisionState } from './useDecideAction'
import { FailureMessage } from '../../shared/i18n/FailureMessage'
import type { MessageKey } from '../../shared/i18n/catalog'
import { useT } from '../../shared/i18n/useT'

const BUTTON =
  'rounded border border-emerald-400/60 px-3 py-1 text-sm font-medium text-emerald-100 ' +
  'hover:bg-emerald-900/50 focus-visible:ring-2 focus-visible:ring-emerald-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

const SECONDARY_BUTTON =
  'rounded border border-slate-400/60 px-3 py-1 text-sm font-medium text-slate-100 ' +
  'hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

function confirmLabel(decision: DecisionState): MessageKey {
  if (decision.status === 'confirming') {
    return 'tutoring.decision.confirming'
  }
  return decision.status === 'failed' && decision.attempted === 'confirm'
    ? 'tutoring.retry'
    : 'tutoring.decision.confirm'
}

function rejectLabel(decision: DecisionState): MessageKey {
  if (decision.status === 'rejecting') {
    return 'tutoring.decision.rejecting'
  }
  return decision.status === 'failed' && decision.attempted === 'reject'
    ? 'tutoring.retry'
    : 'tutoring.decision.reject'
}

/**
 * Confirmar e Recusar de uma proposta ainda em aberto, de qualquer `kind`.
 *
 * - **decidindo**: os DOIS botoes desabilitados. E a guarda contra o clique
 *   duplo (pendencia 34): o hook nao se protege sozinho.
 * - **falha que se repete**: o aviso, e o botao da acao tentada vira "Tentar
 *   de novo"; o outro volta ao normal.
 * - **falha que nao se repete** (ja decidida, nao existe mais): o aviso, e
 *   "Atualizar a conversa" no lugar dos dois. Repetir so daria o mesmo erro.
 *
 * `target` completa o nome acessivel de cada botao com QUAL proposta ele
 * afeta, num `sr-only` ("a proposta: ...", "o reagendamento: ..."): com duas
 * propostas na conversa, "Confirmar" sozinho seria o mesmo nome nos dois. O
 * espaco fica FORA do `span` (licao medida no Incremento A).
 *
 * Extraido do `ProposalCard` no Incremento F (F22) sem mudar o que desenha:
 * os testes do cartao da criacao continuam os mesmos.
 */
export function DecisionControls({
  target,
  decision,
  onConfirm,
  onReject,
  onRefresh,
}: {
  target: string
  decision: DecisionState
  onConfirm: () => void
  onReject: () => void
  onRefresh: () => void
}) {
  const t = useT()
  const failure = decision.status === 'failed' ? decision.failure : null
  const busy = decision.status === 'confirming' || decision.status === 'rejecting'

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {failure?.action === 'refresh' ? (
        <button
          type="button"
          data-testid="proposal-refresh"
          onClick={onRefresh}
          className={SECONDARY_BUTTON}
        >
          {t('tutoring.decision.refresh')}
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
            {t(confirmLabel(decision))} <span className="sr-only">{target}</span>
          </button>
          <button
            type="button"
            data-testid="proposal-reject"
            disabled={busy}
            onClick={onReject}
            className={SECONDARY_BUTTON}
          >
            {t(rejectLabel(decision))} <span className="sr-only">{target}</span>
          </button>
        </>
      )}
      {failure !== null && (
        <p role="alert" data-testid="proposal-failure" className="w-full text-sm text-red-300">
          <FailureMessage failure={failure} />
        </p>
      )}
    </div>
  )
}

/**
 * O texto de uma proposta que ja esta `falhou`, comum aos dois cartoes.
 *
 * `announce` diz se a falha acabou de ser gravada POR ESTA TELA (a decisao do
 * cartao terminou em `failed`). So nesse caso o texto nasce como `role="alert"`:
 * o clique fez sumir o botao focado e o alerta da falha que se repete
 * (`DecisionControls`), e sem um aviso novo quem usa leitor de tela fica com o
 * foco no `body` e nenhuma fala. Uma falha que ja veio gravada do historico
 * NAO e anunciada -- abrir a conversa nao pode ler, de uma vez, todas as
 * propostas que cairam em outros dias.
 *
 * O cartao continua montado quando a acao vira `falhou` (a lista chaveia pelo
 * id da acao), e e por isso que o `decision` dele ainda sabe que a falha foi
 * daqui.
 */
export function RecordedFailure({
  errorCode,
  announce,
}: {
  errorCode: string | null
  announce: boolean
}) {
  return (
    <p
      data-testid="proposal-expired"
      role={announce ? 'alert' : undefined}
      className="mt-3 text-sm text-amber-200"
    >
      <FailureMessage failure={failedActionText(errorCode)} />
    </p>
  )
}

/**
 * O link para o quadro depois de uma proposta executada.
 *
 * No celular a folha cobre o quadro: quem a desenha passa `onGoToBoard` para
 * fecha-la. No desktop o painel fica ao lado, e o link so segue o endereco.
 */
export function BoardLink({ href, onGoToBoard }: { href: string; onGoToBoard?: () => void }) {
  const t = useT()
  return (
    <a
      href={href}
      data-testid="proposal-board-link"
      onClick={onGoToBoard}
      className="text-emerald-200 underline hover:text-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
    >
      {t('tutoring.proposal.boardLink')}
    </a>
  )
}
