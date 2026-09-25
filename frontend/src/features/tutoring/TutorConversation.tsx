import { Fragment, useId, type ReactElement, type Ref } from 'react'
import { UNKNOWN_RESULT } from './messageFailure'
import type { ActionRead, MessageRead, MessageStatus } from './types'
import type { UseTutorConversationResult } from './useTutorConversation'
import type { TutorStatus } from './useTutorStatus'

/** O texto do estado indisponivel, literal da spec. */
export const UNAVAILABLE_TEXT = 'A Tifa está fora do ar: falta configurar o provedor.'

const GREETING =
  'Aqui você conversa com a Tifa, sua tutora. Peça uma missão de estudo ou tire uma dúvida.'

const HISTORY_RETRY_NOTE =
  'A última pergunta ficou sem resposta completa. Tentar de novo é seguro: a pergunta não será duplicada.'

/**
 * A marca de cada estado de mensagem, EXAUSTIVA sobre o tipo: um estado novo
 * reprova o `tsc` ate ganhar marca (ou `null`, decidido). O estado cru nunca
 * vai para a tela.
 */
const STATUS_MARK: Record<MessageStatus, string | null> = {
  completa: null,
  gerando: 'Resposta em andamento',
  interrompida: 'Resposta interrompida',
  falhou: 'Resposta com falha',
}

const BUBBLE = {
  user: 'ml-8 rounded-lg bg-slate-800 p-3 text-sm text-slate-100',
  tutor:
    'mr-8 rounded-lg border border-emerald-700/60 bg-emerald-950/40 p-3 text-sm text-slate-100',
} as const

const BUTTON =
  'rounded border border-emerald-400/60 px-3 py-1 text-sm font-medium text-emerald-100 ' +
  'hover:bg-emerald-900/50 focus-visible:ring-2 focus-visible:ring-emerald-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

function Author({ role }: { role: MessageRead['role'] }) {
  return (
    <p className="mb-1 text-xs font-semibold text-slate-400">{role === 'user' ? 'Você' : 'Tifa'}</p>
  )
}

/**
 * Uma mensagem, e abaixo do texto da Tifa um cartao por acao que ela propos.
 *
 * Quem desenha o cartao e o painel (`renderAction`): e la que moram as chaves
 * de confirmacao e o endereco do quadro, que esta arvore nao conhece.
 */
function MessageItem({
  message,
  renderAction,
}: {
  message: MessageRead
  renderAction: (action: ActionRead) => ReactElement
}) {
  const mark = STATUS_MARK[message.status]
  return (
    <li data-testid="tutor-message" data-message-id={message.id} className={BUBBLE[message.role]}>
      <Author role={message.role} />
      <p className="whitespace-pre-wrap">{message.content}</p>
      {mark !== null && (
        <p data-testid="tutor-message-mark" className="mt-1 text-xs font-medium text-amber-300">
          {mark}
        </p>
      )}
      {message.actions.map((action) => (
        <Fragment key={action.id}>{renderAction(action)}</Fragment>
      ))}
    </li>
  )
}

/**
 * O que aparece no lugar da lista enquanto ela nao existe, ou quando esta
 * vazia. Retorna `null` quando ha lista para mostrar.
 *
 * Tipo de retorno declarado: um estado novo em `HistoryState` torna o fim
 * alcancavel e o `tsc` reprova (mesma tecnica de `MissionList.tsx`).
 */
function HistoryPlaceholder({
  conversation,
}: {
  conversation: UseTutorConversationResult
}): ReactElement | null {
  const { history, messages } = conversation
  switch (history.status) {
    case 'loading':
      return (
        <div data-testid="tutor-history-loading" className="flex flex-col gap-2">
          <p role="status" className="sr-only">
            Carregando a conversa…
          </p>
          {[0, 1, 2].map((n) => (
            <div
              key={n}
              aria-hidden="true"
              className="h-12 rounded-lg bg-slate-800 motion-safe:animate-pulse"
            />
          ))}
        </div>
      )
    case 'error':
      return (
        <div data-testid="tutor-history-error" className="text-sm text-red-200">
          <p>Não foi possível carregar a conversa.</p>
          <button
            type="button"
            data-testid="tutor-history-retry"
            onClick={conversation.reloadHistory}
            className={`mt-2 ${BUTTON}`}
          >
            Tentar novamente
          </button>
        </div>
      )
    case 'loaded':
      return messages.length === 0 && conversation.send.status === 'idle' ? (
        <p data-testid="tutor-greeting" className="text-sm text-slate-300">
          {GREETING}
        </p>
      ) : null
  }
}

/**
 * A bolha da resposta que ESTA sendo escrita. A que falhou ou foi
 * interrompida ja esta na lista (`settleInterrupted`), com a marca do estado.
 */
function PartialAnswer({ send }: { send: UseTutorConversationResult['send'] }) {
  if (send.status !== 'writing') {
    return null
  }
  return (
    <li data-testid="tutor-partial" className={BUBBLE.tutor}>
      <Author role="tutor" />
      <p className="whitespace-pre-wrap">{send.partial}</p>
      <p className="mt-1 text-xs text-emerald-300">Tifa está escrevendo…</p>
    </li>
  )
}

/**
 * A lista que a tela desenha: `messages` sem a linha `gerando` da resposta
 * que o `PartialAnswer` ja esta desenhando.
 *
 * Essa linha chega quando uma atualizacao do historico (a silenciosa de uma
 * falha anterior, atrasada) cai no meio do `writing`: o servidor ja gravou a
 * resposta nova como `gerando`, vazia. Desenhada, seria a mesma resposta duas
 * vezes -- uma bolha "em andamento" ao lado do parcial. So a resposta A ESTA
 * pergunta sai; um `gerando` de outra pergunta continua, com a marca.
 */
function visibleMessages(
  messages: MessageRead[],
  send: UseTutorConversationResult['send'],
): MessageRead[] {
  if (send.status !== 'writing' || send.question === null) {
    return messages
  }
  const questionId = send.question.id
  return messages.filter((m) => m.status !== 'gerando' || m.reply_to_id !== questionId)
}

/** O aviso da falha e o "Tentar de novo", quando ha o que repetir. */
function FailureNotice({
  conversation,
  canRetry,
}: {
  conversation: UseTutorConversationResult
  /** Falso com a Tifa indisponivel ou sem status: reenviar so daria 503. */
  canRetry: boolean
}) {
  const { send, retryTarget, retry } = conversation
  const retryButton =
    retryTarget === null || !canRetry ? null : (
      <button type="button" data-testid="tutor-retry" onClick={retry} className={`mt-2 ${BUTTON}`}>
        Tentar de novo
      </button>
    )
  if (send.status === 'failed' && send.failure.recovery !== 'unavailable') {
    return (
      <div role="alert" data-testid="tutor-failure" className="text-sm text-red-200">
        <p>{send.failure.message}</p>
        {retryButton}
      </div>
    )
  }
  if (send.status === 'unknown') {
    return (
      <div role="alert" data-testid="tutor-failure" className="text-sm text-red-200">
        <p>{UNKNOWN_RESULT.message}</p>
        {retryButton}
      </div>
    )
  }
  if (send.status === 'idle' && retryTarget !== null && canRetry) {
    return (
      <div className="text-sm text-slate-300">
        <p data-testid="tutor-history-retry-note">{HISTORY_RETRY_NOTE}</p>
        {retryButton}
      </div>
    )
  }
  return null
}

/**
 * A conversa desenhada: lista, resposta em voo, aviso de falha e campo.
 *
 * Nao tem estado proprio -- tudo vem de `conversation`, que mora no topo do
 * painel. E o que deixa o painel desenhar esta mesma arvore na lateral do
 * desktop ou na folha do celular sem perder o rascunho.
 */
export function TutorConversation({
  conversation,
  status,
  onReloadStatus,
  renderAction,
  inputRef,
}: {
  conversation: UseTutorConversationResult
  status: TutorStatus
  onReloadStatus: () => void
  /** O cartao de uma acao proposta pela Tifa, montado pelo painel. */
  renderAction: (action: ActionRead) => ReactElement
  inputRef?: Ref<HTMLTextAreaElement>
}) {
  const counterId = useId()
  const { send, length } = conversation
  const unavailable =
    status.status === 'unavailable' ||
    (send.status === 'failed' && send.failure.recovery === 'unavailable')
  const inputDisabled = unavailable || status.status !== 'available'
  const busy = send.status === 'sending' || send.status === 'writing'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {unavailable && (
          <p data-testid="tutor-unavailable" className="mb-3 text-sm font-medium text-amber-200">
            {UNAVAILABLE_TEXT}
          </p>
        )}
        {status.status === 'error' && (
          <div data-testid="tutor-status-error" className="mb-3 text-sm text-red-200">
            <p>Não foi possível verificar se a Tifa está disponível.</p>
            <button
              type="button"
              data-testid="tutor-status-retry"
              onClick={onReloadStatus}
              className={`mt-2 ${BUTTON}`}
            >
              Tentar novamente
            </button>
          </div>
        )}
        <HistoryPlaceholder conversation={conversation} />
        {conversation.messages.length > 0 || send.status !== 'idle' ? (
          <ol role="list" data-testid="tutor-messages" className="flex flex-col gap-2">
            {visibleMessages(conversation.messages, send).map((message) => (
              <MessageItem key={message.id} message={message} renderAction={renderAction} />
            ))}
            <PartialAnswer send={send} />
          </ol>
        ) : null}
        <FailureNotice conversation={conversation} canRetry={!inputDisabled} />
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          conversation.submit()
        }}
      >
        <label htmlFor={`${counterId}-input`} className="text-sm font-medium text-slate-200">
          Sua mensagem para a Tifa
        </label>
        <textarea
          id={`${counterId}-input`}
          ref={inputRef}
          data-testid="tutor-input"
          rows={3}
          value={conversation.draft}
          disabled={inputDisabled}
          aria-describedby={length.counter === null ? undefined : counterId}
          onChange={(event) => {
            conversation.setDraft(event.target.value)
          }}
          className="w-full resize-none rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2">
          <p id={counterId} data-testid="tutor-counter" className="text-xs text-slate-400">
            {length.counter}
          </p>
          <button
            type="submit"
            data-testid="tutor-send"
            disabled={inputDisabled || !conversation.canSubmit}
            className={BUTTON}
          >
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  )
}
