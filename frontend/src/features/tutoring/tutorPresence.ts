import type { KairyaEvent } from '../kairya'
import type { SendState } from './useTutorConversation'

/** O que da conversa move a expressao da Kairya: o envio e o rascunho. */
export interface PresenceInput {
  send: SendState
  draft: string
}

/**
 * "Falha de conexao" (R7): o stream cortado e as falhas em que a Kairya nao
 * respondeu e repetir ajuda (fora do ar, tempo esgotado, falha de proposta).
 * `edit`, `daily-limit` e `retry-with-new-id` nao sao problema de conexao: o
 * rosto fica preocupado, mas sem fala.
 */
function isOffline(send: SendState): boolean {
  if (send.status === 'unknown') return true
  return (
    send.status === 'failed' &&
    (send.failure.action === 'unavailable' || send.failure.action === 'retry')
  )
}

function draftEvents(prev: string, next: string): KairyaEvent[] {
  if (prev === '' && next !== '') return [{ type: 'userTyped' }]
  if (prev !== '' && next === '') return [{ type: 'draftCleared' }]
  return []
}

const isSettled = (send: SendState) => send.status !== 'sending' && send.status !== 'writing'

function sendEvents(prev: SendState, next: SendState): KairyaEvent[] {
  switch (next.status) {
    case 'sending':
      return isSettled(prev) ? [{ type: 'questionSent' }] : []
    case 'writing':
      return next.partial !== '' && (prev.status !== 'writing' || prev.partial === '')
        ? [{ type: 'firstToken' }]
        : []
    case 'idle':
      return next.answer !== null && !isSettled(prev) ? [{ type: 'answerFinished' }] : []
    case 'failed':
    case 'unknown':
      return prev.status === next.status ? [] : [{ type: 'tutorFailed', offline: isOffline(next) }]
  }
}

/**
 * Os eventos da presenca que a mudanca de `prev` para `next` provoca, na ordem
 * em que saem: rascunho primeiro, depois o envio. Pura: sem mudanca, `[]`.
 */
export function presenceEvents(prev: PresenceInput, next: PresenceInput): KairyaEvent[] {
  return [...draftEvents(prev.draft, next.draft), ...sendEvents(prev.send, next.send)]
}
