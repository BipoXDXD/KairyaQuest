import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { postStream, requestJson } from '../../shared/api/client'
import {
  appendTurn,
  pendingFromHistory,
  replaceAction,
  settleInterrupted,
  type PendingQuestion,
} from './conversationHistory'
import {
  describePreStreamFailure,
  describeStreamFailure,
  UNKNOWN_RESULT,
  type MessageFailure,
} from './messageFailure'
import { describeQuestionLength, type QuestionLength } from './questionLimit'
import type { ActionRead, MessageRead } from './types'

export type HistoryState =
  { status: 'loading' } | { status: 'error' } | { status: 'loaded'; messages: MessageRead[] }

/**
 * O envio de UMA pergunta, como uniao discriminada.
 *
 * - `sending`: o POST saiu e o `user_message` ainda nao chegou. Nada foi
 *   confirmado; o texto continua no campo.
 * - `writing`: a pergunta foi GRAVADA (`user_message`) e os `delta` chegam.
 *   `question` e `null` so num stream fora do contrato (delta antes do
 *   `user_message`).
 * - `failed`: sabe-se o que houve -- o `code`, antes do stream ou no `error`.
 * - `unknown`: nao se sabe se a resposta chegou: o stream acabou sem `done`
 *   nem `error`, ou caiu no meio. Repetir com o mesmo id e seguro.
 *
 * `idle.answer` distingue "nada aconteceu ainda" (`null`, na montagem) de
 * "a Kairya acabou de responder" (a resposta do `done`): e o que deixa a regiao
 * viva do painel anunciar o FIM da resposta (spec, "Escrevendo") -- e dizer se
 * ela chegou inteira ou cortada (pendencia 121).
 */
export type SendState =
  | { status: 'idle'; answer: MessageRead | null }
  | { status: 'sending'; pending: PendingQuestion }
  | { status: 'writing'; pending: PendingQuestion; question: MessageRead | null; partial: string }
  | {
      status: 'failed'
      pending: PendingQuestion
      question: MessageRead | null
      partial: string
      failure: MessageFailure
    }
  | { status: 'unknown'; pending: PendingQuestion; question: MessageRead | null; partial: string }

export interface UseTutorConversationResult {
  history: HistoryState
  /** O historico mais a pergunta em voo, se ela ainda nao estiver nele. */
  messages: MessageRead[]
  send: SendState
  draft: string
  setDraft: (text: string) => void
  length: QuestionLength
  /** Ha o que enviar e nada em andamento. (A disponibilidade e do painel.) */
  canSubmit: boolean
  submit: () => void
  /** O que "Tentar de novo" reenvia, ou `null` quando nao ha o que repetir. */
  retryTarget: PendingQuestion | null
  retry: () => void
  reloadHistory: () => void
  updateAction: (action: ActionRead) => void
}

type HistoryReadKind = 'reload' | 'silent'

/** Só decisões conhecidas DEPOIS do início desta leitura corrigem seu snapshot. */
function reconcileActions(
  messages: MessageRead[],
  updates: Map<number, ActionRead>,
): MessageRead[] {
  let reconciled = messages
  for (const action of updates.values()) {
    reconciled = replaceAction(reconciled, action)
  }
  return reconciled
}

type TurnOutcome =
  | { kind: 'done'; question: MessageRead | null; answer: MessageRead }
  | { kind: 'failed'; question: MessageRead | null; partial: string; failure: MessageFailure }
  | { kind: 'unknown'; question: MessageRead | null; partial: string }
  | { kind: 'aborted' }

/**
 * Consome o stream de um turno e diz como ele terminou.
 *
 * O final e decidido so por `done` e `error` (spec, "O stream"). Um nome de
 * evento desconhecido e IGNORADO: um backend mais novo pode acrescentar
 * evento, e sem final o resultado e `unknown` do mesmo jeito -- ignorar nao
 * esconde nada.
 */
async function runTurn(
  pending: PendingQuestion,
  signal: AbortSignal,
  onQuestion: (question: MessageRead) => void,
  onDelta: (question: MessageRead | null, partial: string) => void,
): Promise<TurnOutcome> {
  let question: MessageRead | null = null
  let partial = ''
  try {
    const events = postStream(
      '/tutoring/messages',
      { client_message_id: pending.clientMessageId, content: pending.content },
      signal,
    )
    for await (const { event, data } of events) {
      if (event === 'user_message') {
        question = data as MessageRead
        onQuestion(question)
      } else if (event === 'delta') {
        partial += (data as { text: string }).text
        onDelta(question, partial)
      } else if (event === 'done') {
        return { kind: 'done', question, answer: data as MessageRead }
      } else if (event === 'error') {
        const failure = describeStreamFailure((data as { code: string }).code)
        return { kind: 'failed', question, partial, failure }
      }
    }
  } catch (error) {
    if (signal.aborted) {
      return { kind: 'aborted' }
    }
    // Depois do `user_message`, qualquer queda e resultado desconhecido: a
    // pergunta esta gravada e a resposta pode ter terminado. Antes dele, o
    // `code` diz o que houve -- ou nao diz, e tambem e desconhecido.
    const failure = question === null ? describePreStreamFailure(error) : UNKNOWN_RESULT
    return failure === UNKNOWN_RESULT
      ? { kind: 'unknown', question, partial }
      : { kind: 'failed', question, partial, failure }
  }
  return { kind: 'unknown', question, partial }
}

/** O que "Tentar de novo" reenvia em cada estado. */
function retryTargetOf(send: SendState, history: HistoryState): PendingQuestion | null {
  if (send.status === 'unknown') {
    return send.pending
  }
  if (send.status === 'failed') {
    const repeatable =
      send.failure.action === 'retry' || send.failure.action === 'retry-with-new-id'
    return repeatable ? send.pending : null
  }
  if (send.status === 'idle' && history.status === 'loaded') {
    return pendingFromHistory(history.messages)
  }
  return null
}

/**
 * A conversa com a Kairya: historico, rascunho, envio e reenvio.
 *
 * Vive no TOPO do painel (`TutorPanel`), acima dos conteineres de desktop e de
 * celular: trocar de layout remonta o conteiner, e o rascunho e o stream
 * precisam sobreviver a isso (README §7: o texto digitado nao se perde).
 *
 * O stream usa o sinal de um `AbortController` que nasce com a montagem e
 * aborta na desmontagem. Abortar e a desconexao que o backend grava como
 * `interrompida`; o reenvio com o mesmo id, depois, e seguro.
 */
export function useTutorConversation(): UseTutorConversationResult {
  const [history, setHistory] = useState<HistoryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [send, setSend] = useState<SendState>({ status: 'idle', answer: null })
  const [draft, setDraft] = useState('')
  const lifetime = useRef<AbortController | null>(null)
  // No máximo dois candidatos: a recarga atual e a leitura silenciosa atual.
  // Cada um guarda só o último callback por ação desde seu início. Leituras
  // posteriores começam vazias: o servidor volta a ser a fonte autoritativa.
  const historyReads = useRef<Record<HistoryReadKind, Map<number, ActionRead> | null>>({
    reload: null,
    silent: null,
  })
  const beginHistoryRead = useCallback((kind: HistoryReadKind) => {
    historyReads.current[kind]?.clear()
    const updates = new Map<number, ActionRead>()
    historyReads.current[kind] = updates
    return updates
  }, [])
  const finishHistoryRead = useCallback(
    (kind: HistoryReadKind, updates: Map<number, ActionRead>) => {
      if (historyReads.current[kind] === updates) {
        historyReads.current[kind] = null
      }
      updates.clear()
    },
    [],
  )

  useEffect(() => {
    // Um controlador POR montagem: no StrictMode o efeito roda, limpa e roda
    // de novo, e um controlador criado uma vez so ficaria abortado para sempre.
    const controller = new AbortController()
    lifetime.current = controller
    const reads = historyReads.current
    return () => {
      controller.abort()
      reads.silent?.clear()
      reads.silent = null
    }
  }, [])

  const reloadHistory = useCallback(() => {
    setHistory({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  // Geracao do historico: cada recarga pega um numero novo, e o `done` tambem
  // (ele sabe mais que qualquer GET que saiu antes dele). Uma lista que chega
  // so e gravada se nada mais novo aconteceu desde que o pedido saiu: sem
  // isso, um GET lento que chegasse depois do `done` voltaria a lista para a
  // versao sem a resposta, ou com a linha `gerando` vazia.
  const generation = useRef(0)
  // O status do historico para o `done`, que chega numa promessa com o
  // `history` da closure ja velho.
  const historyStatus = useRef<HistoryState['status']>('loading')
  useEffect(() => {
    historyStatus.current = history.status
  }, [history.status])

  useEffect(() => {
    const controller = new AbortController()
    generation.current += 1
    // A recarga supera também a leitura silenciosa da geração anterior.
    // Libera suas decisões mesmo se aquele GET continuar pendente na rede.
    const previousSilent = historyReads.current.silent
    if (previousSilent !== null) {
      finishHistoryRead('silent', previousSilent)
    }
    const requested = generation.current
    const updates = beginHistoryRead('reload')
    requestJson<MessageRead[]>('/tutoring/messages', controller.signal)
      .then((messages) => {
        if (requested === generation.current) {
          setHistory({ status: 'loaded', messages: reconcileActions(messages, updates) })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistory({ status: 'error' })
        }
      })
      .finally(() => finishHistoryRead('reload', updates))
    return () => {
      controller.abort()
      finishHistoryRead('reload', updates)
    }
  }, [attempt, beginHistoryRead, finishHistoryRead])

  // Ids das respostas provisorias (-1, -2, ...): nunca colidem com os do banco.
  const placeholderIds = useRef(0)
  // O numero da atualizacao silenciosa mais recente (ver `refreshSilently`).
  const silentRequest = useRef(0)

  /**
   * Busca o historico SEM passar por `loading`: a lista da tela fica ate a do
   * servidor chegar. Falhar aqui nao e erro para mostrar -- a resposta
   * provisoria continua na lista, marcada, e a proxima recarga corrige.
   */
  const refreshSilently = useCallback(() => {
    // Nao pega geracao nova: uma recarga em voo e tao nova quanto ela, e e a
    // fonte (a lista so e gravada aqui se ja estiver carregada) -- invalida-la
    // deixaria a tela em "carregando" para sempre.
    const requested = generation.current
    // Entre si, as atualizacoes silenciosas usam o proprio numero (o
    // `requestId` de `useCycle`/`useCurrentPlan`): duas falhas seguidas, sem
    // `done` entre elas, disparam duas com a MESMA geracao, e so a mais
    // recente pode gravar -- a mais antiga, chegando por ultimo, traria a
    // lista de antes do segundo turno.
    const id = (silentRequest.current += 1)
    const updates = beginHistoryRead('silent')
    requestJson<MessageRead[]>('/tutoring/messages', lifetime.current!.signal)
      .then((messages) => {
        if (requested === generation.current && id === silentRequest.current) {
          const reconciled = reconcileActions(messages, updates)
          setHistory((current) =>
            current.status === 'loaded' ? { status: 'loaded', messages: reconciled } : current,
          )
        }
      })
      .catch(() => undefined)
      .finally(() => finishHistoryRead('silent', updates))
  }, [beginHistoryRead, finishHistoryRead])

  const run = useCallback(
    (pending: PendingQuestion) => {
      // O efeito de montagem ja rodou: `run` so e chamado por clique.
      const signal = lifetime.current!.signal
      setSend({ status: 'sending', pending })
      void runTurn(
        pending,
        signal,
        (question) => {
          // So agora a pergunta esta gravada, e so agora o campo pode ser limpo
          // -- e so se ainda contem ESTA pergunta: o que foi digitado depois do
          // envio e outra pergunta, e nao pode sumir.
          setDraft((current) => (current.trim() === pending.content ? '' : current))
          setSend({ status: 'writing', pending, question, partial: '' })
        },
        (question, partial) => {
          setSend({ status: 'writing', pending, question, partial })
        },
      ).then((outcome) => {
        if (outcome.kind === 'aborted') {
          return
        }
        if (outcome.kind === 'done') {
          // O `done` e mais novo que todo historico pedido antes dele: esses
          // pedidos deixam de gravar. Com a lista carregada, o turno entra
          // nela; com uma recarga em voo (ou em erro), a recarga saiu ANTES do
          // `done` e pode nao ter o fim da resposta -- pede-se outra.
          generation.current += 1
          // Esses candidatos perderam a geração: não precisam reter decisões
          // enquanto um GET obsoleto continua pendente na rede.
          for (const kind of ['reload', 'silent'] as const) {
            const updates = historyReads.current[kind]
            if (updates !== null) {
              finishHistoryRead(kind, updates)
            }
          }
          setHistory((current) =>
            current.status === 'loaded'
              ? {
                  status: 'loaded',
                  messages: appendTurn(current.messages, outcome.question, outcome.answer),
                }
              : current,
          )
          if (historyStatus.current !== 'loaded') {
            setAttempt((n) => n + 1)
          }
          setSend({ status: 'idle', answer: outcome.answer })
          return
        }
        const { question } = outcome
        if (question !== null) {
          // A pergunta foi gravada: o parcial entra na LISTA, marcado, e o
          // historico do servidor (que ja tem a linha `falhou`, ou a
          // `interrompida`/`completa` que a queda deixou) o substitui.
          placeholderIds.current -= 1
          const placeholderId = placeholderIds.current
          const status = outcome.kind === 'failed' ? 'falhou' : 'interrompida'
          // A recusa descarta o parcial (pendencia 120), como o backend.
          const partial =
            outcome.kind === 'failed' && outcome.failure.discardsPartial ? '' : outcome.partial
          setHistory((current) =>
            current.status === 'loaded'
              ? {
                  status: 'loaded',
                  messages: settleInterrupted(
                    current.messages,
                    question,
                    partial,
                    status,
                    placeholderId,
                  ),
                }
              : current,
          )
          refreshSilently()
        }
        setSend(
          outcome.kind === 'failed'
            ? {
                status: 'failed',
                pending,
                question: outcome.question,
                partial: outcome.partial,
                failure: outcome.failure,
              }
            : { status: 'unknown', pending, question: outcome.question, partial: outcome.partial },
        )
      })
    },
    [refreshSilently, finishHistoryRead],
  )

  const retryTarget = retryTargetOf(send, history)
  const length = describeQuestionLength(draft)
  const busy = send.status === 'sending' || send.status === 'writing'
  const canSubmit = length.sendable && !busy && history.status === 'loaded'
  const needsNewId = send.status === 'failed' && send.failure.action === 'retry-with-new-id'

  const submit = useCallback(() => {
    if (!canSubmit) {
      return
    }
    const content = draft.trim()
    // O mesmo texto depois de uma falha e a MESMA pergunta: um id novo
    // duplicaria uma pergunta que talvez ja esteja gravada.
    const reuse = retryTarget !== null && retryTarget.content === content && !needsNewId
    run(reuse ? retryTarget : { clientMessageId: crypto.randomUUID(), content })
  }, [canSubmit, draft, needsNewId, retryTarget, run])

  const retry = useCallback(() => {
    if (retryTarget === null) {
      return
    }
    run(needsNewId ? { ...retryTarget, clientMessageId: crypto.randomUUID() } : retryTarget)
  }, [needsNewId, retryTarget, run])

  const updateAction = useCallback((action: ActionRead) => {
    // Não invalida uma recarga necessária nem mantém override global. Só os
    // GETs que já saíram podem conter a versão anterior à decisão conhecida.
    for (const updates of Object.values(historyReads.current)) {
      updates?.set(action.id, action)
    }
    setHistory((current) =>
      current.status === 'loaded'
        ? { status: 'loaded', messages: replaceAction(current.messages, action) }
        : current,
    )
  }, [])

  const messages = useMemo(() => {
    if (history.status !== 'loaded') {
      return []
    }
    // So o turno ESCREVENDO fica fora da lista; o que falhou ja entrou nela
    // (`settleInterrupted`), e continua visivel durante o proximo `sending`.
    const inFlight = send.status === 'writing' ? send.question : null
    return inFlight === null || history.messages.some((m) => m.id === inFlight.id)
      ? history.messages
      : [...history.messages, inFlight]
  }, [history, send])

  return {
    history,
    messages,
    send,
    draft,
    setDraft,
    length,
    canSubmit,
    submit,
    retryTarget,
    retry,
    reloadHistory,
    updateAction,
  }
}
