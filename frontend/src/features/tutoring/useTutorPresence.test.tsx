import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { AudioProvider } from '../../shared/audio/AudioProvider'
import { fakeAudio, memoryStorage, type FakeAudio } from '../../test/audioDoubles'
import { KairyaPresenceProvider, useKairya } from '../kairya'
import { UNKNOWN_RESULT, type MessageFailure } from './messageFailure'
import type { PresenceInput } from './tutorPresence'
import type { ActionRead } from './types'
import type { SendState } from './useTutorConversation'
import { useTutorPresence } from './useTutorPresence'

const noScheduler = () => () => undefined

const SOUND_ON = { 'kairyaquest.sound': '{"voice":true,"sfx":true}' }

/** Os elementos de audio criados, para ver qual efeito tocou. */
function setup(initial: PresenceInput, strict = false, entries: Record<string, string> = SOUND_ON) {
  const elements: FakeAudio[] = []
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(AudioProvider, {
      storage: memoryStorage(entries),
      createElement: () => {
        const element = fakeAudio()
        elements.push(element)
        return element
      },
      children: createElement(KairyaPresenceProvider, {
        scheduler: noScheduler,
        random: () => 0,
        greeting: false,
        children,
      }),
    })
  const hook = renderHook(
    (input: PresenceInput) => {
      useTutorPresence(input)
      return useKairya().state
    },
    { wrapper, initialProps: initial, reactStrictMode: strict },
  )
  /** Os efeitos tocados ate agora, em ordem. */
  const played = () =>
    elements.flatMap((element) =>
      element.play.mock.calls.map(() => /\/audio\/sfx\/(\w+)\.mp3$/.exec(element.src)?.[1]),
    )
  return { ...hook, played }
}

const IDLE = { status: 'idle', answer: null } as const
const PENDING = { clientMessageId: 'c1', content: 'Oi' }
const SENDING = { status: 'sending', pending: PENDING } as const
const writing = (partial: string): SendState => ({
  status: 'writing',
  pending: PENDING,
  question: null,
  partial,
})
const failedRetry: SendState = {
  status: 'failed',
  pending: PENDING,
  question: null,
  partial: '',
  failure: {
    message: UNKNOWN_RESULT.message,
    recovery: UNKNOWN_RESULT.recovery,
    action: 'retry',
  } satisfies MessageFailure,
}
const UNKNOWN: SendState = { status: 'unknown', pending: PENDING, question: null, partial: '' }

const PROPOSTA: ActionRead = {
  id: 5,
  kind: 'create_mission',
  state: 'proposta',
  payload: {
    instructions: 'Estudar grafos',
    completion_criterion: 'Resumo',
    difficulty: 2,
    estimated_minutes: 40,
    deadline: '2027-02-15T21:00:00-03:00',
  },
  mission_id: null,
  error_code: null,
}
const answer = (actions: ActionRead[]): SendState => ({
  status: 'idle',
  answer: {
    id: 2,
    role: 'tutor',
    content: 'Oi!',
    status: 'completa',
    client_message_id: null,
    reply_to_id: 1,
    error_code: null,
    fallback_model: null,
    created_at: '2026-09-22T12:00:01Z',
    actions,
  },
})

describe('useTutorPresence', () => {
  it('na montagem nao despacha nada, nem com rascunho ou envio em curso', () => {
    const { result, played } = setup({ send: SENDING, draft: 'oi' })
    expect(result.current.mood).toBe('idle')
    expect(played()).toEqual([])
  })

  it('sob StrictMode a montagem tambem nao despacha nada', () => {
    const { result, played } = setup({ send: SENDING, draft: 'oi' }, true)
    expect(result.current.mood).toBe('idle')
    expect(played()).toEqual([])
  })

  it('uma mudanca vira o evento correspondente, uma vez', () => {
    const { result, rerender } = setup({ send: IDLE, draft: '' }, true)
    rerender({ send: IDLE, draft: 'o' })
    expect(result.current.mood).toBe('listening')
    rerender({ send: IDLE, draft: 'oi' })
    expect(result.current.mood).toBe('listening')
    rerender({ send: SENDING, draft: '' })
    expect(result.current.mood).toBe('thinking')
  })

  it('digitar nao toca nada', () => {
    const { rerender, played } = setup({ send: IDLE, draft: '' })
    rerender({ send: IDLE, draft: 'o' })
    rerender({ send: IDLE, draft: '' })
    expect(played()).toEqual([])
  })

  it('a pergunta enviada toca message_sent', () => {
    const { rerender, played } = setup({ send: IDLE, draft: 'oi' })
    rerender({ send: SENDING, draft: '' })
    expect(played()).toEqual(['message_sent'])
  })

  it.each([
    ['failed', failedRetry],
    ['unknown', UNKNOWN],
  ])('falha %s toca soft_error', (_name, failure) => {
    const { rerender, played } = setup({ send: writing('Oi'), draft: '' })
    rerender({ send: failure, draft: '' })
    expect(played()).toEqual(['soft_error'])
  })

  it('resposta com proposta toca proposal_arrived', () => {
    const { rerender, played } = setup({ send: writing('Oi'), draft: '' })
    rerender({ send: answer([PROPOSTA]), draft: '' })
    expect(played()).toEqual(['proposal_arrived'])
  })

  it('resposta sem proposta nao toca', () => {
    const { rerender, played } = setup({ send: writing('Oi'), draft: '' })
    rerender({ send: answer([]), draft: '' })
    expect(played()).toEqual([])
  })

  it('com o som desligado nenhum elemento de efeito nasce', () => {
    const { rerender, played } = setup({ send: IDLE, draft: 'oi' }, false, {})
    rerender({ send: SENDING, draft: '' })
    rerender({ send: answer([PROPOSTA]), draft: '' })
    expect(played()).toEqual([])
  })
})
