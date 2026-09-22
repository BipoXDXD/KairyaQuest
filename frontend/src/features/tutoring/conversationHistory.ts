import type { ActionRead, MessageRead } from './types'

/**
 * Uma pergunta a (re)enviar: o id que a torna idempotente e o texto.
 *
 * O backend amarra os dois: o mesmo id com OUTRO texto e `operacao_reutilizada`.
 */
export interface PendingQuestion {
  clientMessageId: string
  content: string
}

/**
 * A lista depois de um `done`: a pergunta entra se ainda nao estiver (um
 * reenvio a traz de novo), e a resposta entra ou TROCA a de mesmo id (uma
 * pergunta ja respondida recebe a resposta que ja existia). Nunca duplica.
 */
export function appendTurn(
  messages: MessageRead[],
  question: MessageRead | null,
  answer: MessageRead,
): MessageRead[] {
  const next =
    question === null || messages.some((m) => m.id === question.id)
      ? [...messages]
      : [...messages, question]
  const at = next.findIndex((m) => m.id === answer.id)
  if (at === -1) {
    next.push(answer)
  } else {
    next[at] = answer
  }
  return next
}

/**
 * A lista depois de um turno que NAO terminou bem, mas cuja pergunta foi
 * gravada (`error` no stream, ou queda depois do `user_message`).
 *
 * A spec manda o parcial "ficar visivel e marcado". Guardado so no estado do
 * envio, ele sumiria no "Tentar de novo" (que volta a `sending`), ao enviar
 * outra pergunta, e porque o `done` so acrescenta turnos que terminaram bem.
 * Aqui ele entra na LISTA, como uma resposta provisoria com id negativo (o
 * hook os gera: -1, -2, ...), ate a atualizacao silenciosa trazer a linha que
 * o backend gravou -- o backend grava `falhou` ANTES de emitir o `error`.
 */
export function settleInterrupted(
  messages: MessageRead[],
  question: MessageRead,
  partial: string,
  status: 'falhou' | 'interrompida',
  placeholderId: number,
): MessageRead[] {
  const next = messages.some((m) => m.id === question.id) ? [...messages] : [...messages, question]
  next.push({
    id: placeholderId,
    role: 'tutor',
    content: partial,
    status,
    client_message_id: null,
    reply_to_id: question.id,
    error_code: null,
    created_at: question.created_at,
    actions: [],
  })
  return next
}

/** A lista com a acao de mesmo id trocada pela versao nova. */
export function replaceAction(messages: MessageRead[], action: ActionRead): MessageRead[] {
  return messages.map((m) =>
    m.actions.some((a) => a.id === action.id)
      ? { ...m, actions: m.actions.map((a) => (a.id === action.id ? action : a)) }
      : m,
  )
}

/**
 * A pergunta que a tela oferece reenviar depois de recarregar a pagina.
 *
 * So a ULTIMA pergunta conta, e so se nao ha resposta `completa` (nada a
 * fazer) nem `gerando` (o backend responderia 409) depois dela. E o que a spec
 * promete para quem recarrega no meio de uma resposta: ela fica `interrompida`
 * "e a tela oferece Tentar de novo".
 */
export function pendingFromHistory(messages: MessageRead[]): PendingQuestion | null {
  const last = messages.findLast((m) => m.role === 'user')
  if (last === undefined || last.client_message_id === null) {
    return null
  }
  const settled = messages.some(
    (m) => m.reply_to_id === last.id && (m.status === 'completa' || m.status === 'gerando'),
  )
  return settled ? null : { clientMessageId: last.client_message_id, content: last.content }
}
