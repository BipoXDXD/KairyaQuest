import { describe, expect, it } from 'vitest'
import { INITIAL_PRESENCE, presenceReducer, type PresenceState } from '../kairya/useKairyaMood'
import type { KairyaEvent } from '../kairya'
import { PRE_STREAM_FAILURE_BY_CODE, UNKNOWN_RESULT, type MessageFailure } from './messageFailure'
import { presenceEvents, type PresenceInput } from './tutorPresence'
import type { MessageRead } from './types'
import type { SendState } from './useTutorConversation'

const PENDING = { clientMessageId: 'c1', content: 'Oi' }
const ANSWER: MessageRead = {
  id: 2,
  role: 'tutor',
  content: 'Oi!',
  status: 'completa',
  client_message_id: null,
  reply_to_id: 1,
  error_code: null,
  fallback_model: null,
  created_at: '2026-09-22T12:00:01Z',
  actions: [],
}

const IDLE: SendState = { status: 'idle', answer: null }
const IDLE_ANSWERED: SendState = { status: 'idle', answer: ANSWER }
const SENDING: SendState = { status: 'sending', pending: PENDING }
const writing = (partial: string): SendState => ({
  status: 'writing',
  pending: PENDING,
  question: null,
  partial,
})
const failed = (failure: MessageFailure): SendState => ({
  status: 'failed',
  pending: PENDING,
  question: null,
  partial: '',
  failure,
})
const UNKNOWN: SendState = { status: 'unknown', pending: PENDING, question: null, partial: '' }

const input = (send: SendState, draft = ''): PresenceInput => ({ send, draft })

const FAILURE_OF = (action: MessageFailure['action']): MessageFailure => ({
  message: UNKNOWN_RESULT.message,
  recovery: UNKNOWN_RESULT.recovery,
  action,
})

/** Dobra os eventos no reducer, com a semente 0 (a primeira fala do grupo). */
function fold(events: readonly KairyaEvent[], from: PresenceState = INITIAL_PRESENCE) {
  return events.reduce((state, event) => presenceReducer(state, { event, seed: 0 }), from)
}

describe('presenceEvents: rascunho', () => {
  it('vazio para nao vazio: userTyped', () => {
    expect(presenceEvents(input(IDLE, ''), input(IDLE, 'o'))).toEqual([{ type: 'userTyped' }])
  })

  it('nao vazio para vazio: draftCleared', () => {
    expect(presenceEvents(input(IDLE, 'o'), input(IDLE, ''))).toEqual([{ type: 'draftCleared' }])
  })

  it('nao vazio para outro nao vazio: nada', () => {
    expect(presenceEvents(input(IDLE, 'o'), input(IDLE, 'oi'))).toEqual([])
  })

  it('digita, apaga, digita, envia: userTyped, draftCleared, userTyped, draftCleared, questionSent', () => {
    const steps: PresenceInput[] = [
      input(IDLE, ''),
      input(IDLE, 'a'),
      input(IDLE, ''),
      input(IDLE, 'b'),
      input(SENDING, ''),
    ]
    const events = steps.slice(1).flatMap((next, i) => presenceEvents(steps[i]!, next))
    expect(events).toEqual([
      { type: 'userTyped' },
      { type: 'draftCleared' },
      { type: 'userTyped' },
      { type: 'draftCleared' },
      { type: 'questionSent' },
    ])
  })
})

describe('presenceEvents: envio', () => {
  it('idle para sending: questionSent', () => {
    expect(presenceEvents(input(IDLE), input(SENDING))).toEqual([{ type: 'questionSent' }])
  })

  it('reenviar depois de falha: questionSent', () => {
    expect(presenceEvents(input(failed(FAILURE_OF('retry'))), input(SENDING))).toEqual([
      { type: 'questionSent' },
    ])
    expect(presenceEvents(input(UNKNOWN), input(SENDING))).toEqual([{ type: 'questionSent' }])
  })

  it('sending para writing vazio: nada', () => {
    expect(presenceEvents(input(SENDING), input(writing('')))).toEqual([])
  })

  it('writing para sending nao repete questionSent', () => {
    expect(presenceEvents(input(writing('a')), input(SENDING))).toEqual([])
  })

  it('sem mudanca: nada', () => {
    const same = input(writing('abc'), 'x')
    expect(presenceEvents(same, same)).toEqual([])
    expect(presenceEvents(input(SENDING), input(SENDING))).toEqual([])
  })
})

describe('presenceEvents: resposta', () => {
  it('writing com partial vindo de sending: firstToken', () => {
    expect(presenceEvents(input(SENDING), input(writing('O')))).toEqual([{ type: 'firstToken' }])
  })

  it('writing com partial vindo de partial vazio: firstToken', () => {
    expect(presenceEvents(input(writing('')), input(writing('O')))).toEqual([
      { type: 'firstToken' },
    ])
  })

  it('partial crescendo dispara firstToken uma vez so', () => {
    const states = [SENDING, writing('O'), writing('Ol'), writing('Olá')]
    const events = states.slice(1).flatMap((s, i) => presenceEvents(input(states[i]!), input(s)))
    expect(events).toEqual([{ type: 'firstToken' }])
  })

  it('writing com partial vindo de falha: firstToken', () => {
    expect(presenceEvents(input(UNKNOWN), input(writing('O')))).toEqual([{ type: 'firstToken' }])
  })

  it('writing para idle com resposta: answerFinished', () => {
    expect(presenceEvents(input(writing('Oi!')), input(IDLE_ANSWERED))).toEqual([
      { type: 'answerFinished' },
    ])
  })

  it('sending para idle com resposta: answerFinished', () => {
    expect(presenceEvents(input(SENDING), input(IDLE_ANSWERED))).toEqual([
      { type: 'answerFinished' },
    ])
  })

  it('idle sem resposta, ou idle respondido vindo de idle: nada', () => {
    expect(presenceEvents(input(writing('x')), input(IDLE))).toEqual([])
    expect(presenceEvents(input(IDLE), input(IDLE_ANSWERED))).toEqual([])
  })

  it('Review Focus 4: resposta vazia passa por thinking e termina em idle', () => {
    const states = [IDLE, SENDING, writing(''), IDLE_ANSWERED]
    const events = states.slice(1).flatMap((s, i) => presenceEvents(input(states[i]!), input(s)))
    expect(events).toEqual([{ type: 'questionSent' }, { type: 'answerFinished' }])
    expect(fold(events.slice(0, 1)).mood).toBe('thinking')
    expect(fold(events).mood).toBe('idle')
  })
})

describe('presenceEvents: falha', () => {
  it('stream cortado (unknown): offline true, concerned com tutor_offline_1', () => {
    const events = presenceEvents(input(writing('x')), input(UNKNOWN))
    expect(events).toEqual([{ type: 'tutorFailed', offline: true }])
    const state = fold([{ type: 'questionSent' }, ...events])
    expect(state.mood).toBe('concerned')
    expect(state.cue?.line).toBe('tutor_offline_1')
  })

  it('unavailable (provedor_nao_configurado): offline true', () => {
    const failure = PRE_STREAM_FAILURE_BY_CODE.provedor_nao_configurado
    expect(failure.action).toBe('unavailable')
    expect(presenceEvents(input(SENDING), input(failed(failure)))).toEqual([
      { type: 'tutorFailed', offline: true },
    ])
  })

  it('retry: offline true', () => {
    expect(presenceEvents(input(SENDING), input(failed(FAILURE_OF('retry'))))).toEqual([
      { type: 'tutorFailed', offline: true },
    ])
  })

  it.each(['edit', 'retry-with-new-id'] as const)('%s: offline false', (action) => {
    expect(presenceEvents(input(SENDING), input(failed(FAILURE_OF(action))))).toEqual([
      { type: 'tutorFailed', offline: false },
    ])
  })

  it('daily-limit: offline false e sem fala', () => {
    const events = presenceEvents(input(SENDING), input(failed(FAILURE_OF('daily-limit'))))
    expect(events).toEqual([{ type: 'tutorFailed', offline: false }])
    const state = fold([{ type: 'questionSent' }, ...events])
    expect(state.mood).toBe('concerned')
    expect(state.cue).toBeNull()
  })

  it('failed para failed: nada', () => {
    const f = input(failed(FAILURE_OF('retry')))
    expect(presenceEvents(f, f)).toEqual([])
    expect(presenceEvents(input(UNKNOWN), input(UNKNOWN))).toEqual([])
  })

  it('failed para unknown: dispara de novo (outro estado)', () => {
    expect(presenceEvents(input(failed(FAILURE_OF('edit'))), input(UNKNOWN))).toEqual([
      { type: 'tutorFailed', offline: true },
    ])
  })
})

describe('presenceEvents: ordem', () => {
  it('rascunho antes do envio na mesma mudanca', () => {
    expect(presenceEvents(input(IDLE, 'oi'), input(SENDING, ''))).toEqual([
      { type: 'draftCleared' },
      { type: 'questionSent' },
    ])
  })
})
