import { Fragment, useId, type ReactElement, type Ref } from 'react'
import { unansweredNote } from './answerOutcome'
import { latestAnswerTo } from './conversationHistory'
import { UNKNOWN_RESULT } from './messageFailure'
import type { ActionRead, MessageRead, MessageStatus } from './types'
import type { UseTutorConversationResult } from './useTutorConversation'
import type { TutorStatus } from './useTutorStatus'
import { FailureMessage } from '../../shared/i18n/FailureMessage'
import type { MessageKey } from '../../shared/i18n/catalog'
import { plural } from '../../shared/i18n/plural'
import { useLocale } from '../../shared/i18n/useLocale'
import { useT } from '../../shared/i18n/useT'
import type { Counter } from '../../shared/types/counter'
import { MAX_QUESTION_LENGTH } from './questionLimit'

/**
 * O texto do estado indisponivel, literal da spec: e o mesmo fato (e o mesmo
 * texto) da falha `provedor_nao_configurado` do envio, por isso a mesma chave.
 */
const UNAVAILABLE_TEXT: MessageKey = 'tutoring.messageFailure.providerNotConfigured.message'

/**
 * A marca de cada estado de mensagem, EXAUSTIVA sobre o tipo: um estado novo
 * reprova o `tsc` ate ganhar marca (ou `null`, decidido). O estado cru nunca
 * vai para a tela.
 */
const STATUS_MARK: Record<MessageStatus, MessageKey | null> = {
  completa: null,
  gerando: 'tutoring.message.mark.generating',
  interrompida: 'tutoring.message.mark.interrupted',
  falhou: 'tutoring.message.mark.failed',
}

/**
 * A frase da bolha quando a Kairya so chamou a ferramenta e devolveu texto
 * vazio (ou so espacos): sem ela a bolha mostraria so o cartao, e o leitor de
 * tela nao leria nada de quem propos. `null` para quem nao tem proposta, ou
 * tem uma de `kind` que esta versao nao conhece (o cartao ja avisa).
 */
function proposalLine(message: MessageRead): MessageKey | null {
  const [first] = message.actions
  if (message.content.trim() !== '' || first === undefined) {
    return null
  }
  switch (first.kind) {
    case 'create_mission':
      return 'tutoring.proposal.line.create'
    case 'reschedule_mission':
      return 'tutoring.proposal.line.reschedule'
    default:
      return null
  }
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
  const t = useT()
  return (
    <p className="mb-1 text-xs font-semibold text-slate-400">
      {t(role === 'user' ? 'tutoring.message.author.user' : 'tutoring.name')}
    </p>
  )
}

/**
 * O texto do contador no idioma. `n` entra como `{count}`; o `{max}` da frase
 * de excesso vem de `MAX_QUESTION_LENGTH`. O excesso nunca e 0, e por isso nao
 * tem forma `zero`.
 */
function CounterText({ counter }: { counter: Counter }) {
  const t = useT()
  const { locale } = useLocale()
  const key =
    counter.kind === 'remaining'
      ? plural(locale, counter.n, {
          zero: 'tutoring.counter.remaining.zero',
          one: 'tutoring.counter.remaining.one',
          other: 'tutoring.counter.remaining.other',
        })
      : plural(locale, counter.n, {
          one: 'tutoring.counter.over.one',
          other: 'tutoring.counter.over.other',
        })
  return <>{t(key, { count: counter.n, max: MAX_QUESTION_LENGTH })}</>
}

/**
 * Uma mensagem, e abaixo do texto da Kairya um cartao por acao que ela propos.
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
  const t = useT()
  const mark = STATUS_MARK[message.status]
  // So proposta, sem texto: a frase padrao ocupa o lugar do texto.
  const line = proposalLine(message)
  const text = line === null ? message.content : t(line)
  return (
    <li data-testid="tutor-message" data-message-id={message.id} className={BUBBLE[message.role]}>
      <Author role={message.role} />
      {/* Sem texto (a recusada, ou a falha antes do primeiro pedaco), a bolha
          fica com o autor e a marca: um paragrafo vazio so abriria espaco. */}
      {text !== '' && (
        <p data-testid="tutor-message-content" className="wrap-anywhere whitespace-pre-wrap">
          {text}
        </p>
      )}
      {mark !== null && (
        <p data-testid="tutor-message-mark" className="mt-1 text-xs font-medium text-amber-300">
          {t(mark)}
        </p>
      )}
      {/* Pendencia 174: outro modelo escreveu a resposta (o fallback do
          servidor depois de uma recusa). Dentro do `li`, para o leitor de
          tela ler junto com a mensagem; sem alarme e sem a categoria. */}
      {message.fallback_model !== null && (
        <p data-testid="tutor-message-fallback" className="mt-1 text-xs text-slate-400">
          {t('tutoring.message.fallback', { model: message.fallback_model })}
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
  const t = useT()
  const { history, messages } = conversation
  switch (history.status) {
    case 'loading':
      return (
        <div data-testid="tutor-history-loading" className="flex flex-col gap-2">
          <p role="status" className="sr-only">
            {t('tutoring.history.loading')}
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
          <p>{t('tutoring.history.loadFailed')}</p>
          <button
            type="button"
            data-testid="tutor-history-retry"
            onClick={conversation.reloadHistory}
            className={`mt-2 ${BUTTON}`}
          >
            {t('tutoring.retryLoad')}
          </button>
        </div>
      )
    case 'loaded':
      return messages.length === 0 && conversation.send.status === 'idle' ? (
        <p data-testid="tutor-greeting" className="text-sm text-slate-300">
          {t('tutoring.conversation.greeting')}
        </p>
      ) : null
  }
}

/**
 * A bolha da resposta que ESTA sendo escrita. A que falhou ou foi
 * interrompida ja esta na lista (`settleInterrupted`), com a marca do estado.
 */
function PartialAnswer({ send }: { send: UseTutorConversationResult['send'] }) {
  const t = useT()
  if (send.status !== 'writing') {
    return null
  }
  return (
    <li data-testid="tutor-partial" className={BUBBLE.tutor}>
      <Author role="tutor" />
      <p className="wrap-anywhere whitespace-pre-wrap">{send.partial}</p>
      <p className="mt-1 text-xs text-emerald-300">{t('tutoring.writing')}</p>
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
  /** Falso com a Kairya indisponivel ou sem status: reenviar so daria 503. */
  canRetry: boolean
}) {
  const t = useT()
  const { send, retryTarget, retry } = conversation
  const retryButton =
    retryTarget === null || !canRetry ? null : (
      <button type="button" data-testid="tutor-retry" onClick={retry} className={`mt-2 ${BUTTON}`}>
        {t('tutoring.retry')}
      </button>
    )
  if (send.status === 'failed' && send.failure.action !== 'unavailable') {
    return (
      <div role="alert" data-testid="tutor-failure" className="text-sm text-red-200">
        <p>
          <FailureMessage failure={send.failure} />
        </p>
        {retryButton}
      </div>
    )
  }
  if (send.status === 'unknown') {
    return (
      <div role="alert" data-testid="tutor-failure" className="text-sm text-red-200">
        <p>
          <FailureMessage failure={UNKNOWN_RESULT} />
        </p>
        {retryButton}
      </div>
    )
  }
  if (send.status === 'idle' && retryTarget !== null && canRetry) {
    return (
      <div className="text-sm text-slate-300">
        <p data-testid="tutor-history-retry-note">
          {t(unansweredNote(latestAnswerTo(conversation.messages, retryTarget.clientMessageId)))}
        </p>
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
  /** O cartao de uma acao proposta pela Kairya, montado pelo painel. */
  renderAction: (action: ActionRead) => ReactElement
  inputRef?: Ref<HTMLTextAreaElement>
}) {
  const t = useT()
  const counterId = useId()
  const { send, length } = conversation
  const unavailable =
    status.status === 'unavailable' ||
    (send.status === 'failed' && send.failure.action === 'unavailable')
  const dailyLimitReached = send.status === 'failed' && send.failure.action === 'daily-limit'
  const inputDisabled = unavailable || dailyLimitReached || status.status !== 'available'
  const busy = send.status === 'sending' || send.status === 'writing'

  return (
    <div className="tutor-conversation flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {/* A regiao rola; sem nada focavel dentro (sem proposta nem Tentar de
          novo), so o tabIndex deixa quem usa teclado rola-la (axe
          scrollable-region-focusable). O nome diz o que o foco alcancou. */}
      <div
        role="region"
        aria-label={t('tutoring.conversation.region')}
        tabIndex={0}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
      >
        {unavailable && (
          <p data-testid="tutor-unavailable" className="mb-3 text-sm font-medium text-amber-200">
            {t(UNAVAILABLE_TEXT)}
          </p>
        )}
        {status.status === 'error' && (
          <div data-testid="tutor-status-error" className="mb-3 text-sm text-red-200">
            <p>{t('tutoring.status.loadFailed')}</p>
            <button
              type="button"
              data-testid="tutor-status-retry"
              onClick={onReloadStatus}
              className={`mt-2 ${BUTTON}`}
            >
              {t('tutoring.retryLoad')}
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
          {t('tutoring.input.label')}
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
          className="w-full resize-none rounded border border-slate-500 bg-slate-900 p-2 text-sm text-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2">
          <p id={counterId} data-testid="tutor-counter" className="text-xs text-slate-400">
            {length.counter !== null && <CounterText counter={length.counter} />}
          </p>
          <button
            type="submit"
            data-testid="tutor-send"
            disabled={inputDisabled || !conversation.canSubmit}
            className={BUTTON}
          >
            {t(busy ? 'tutoring.send.busy' : 'tutoring.send.idle')}
          </button>
        </div>
      </form>
    </div>
  )
}
