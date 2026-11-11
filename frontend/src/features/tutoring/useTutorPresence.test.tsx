import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { KairyaPresenceProvider, useKairya } from '../kairya'
import type { PresenceInput } from './tutorPresence'
import { useTutorPresence } from './useTutorPresence'

const noScheduler = () => () => undefined

function setup(initial: PresenceInput, strict = false) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(KairyaPresenceProvider, {
      scheduler: noScheduler,
      random: () => 0,
      greeting: false,
      children,
    })
  return renderHook(
    (input: PresenceInput) => {
      useTutorPresence(input)
      return useKairya().state
    },
    { wrapper, initialProps: initial, reactStrictMode: strict },
  )
}

const IDLE = { status: 'idle', answer: null } as const
const SENDING = { status: 'sending', pending: { clientMessageId: 'c1', content: 'Oi' } } as const

describe('useTutorPresence', () => {
  it('na montagem nao despacha nada, nem com rascunho ou envio em curso', () => {
    const { result } = setup({ send: SENDING, draft: 'oi' })
    expect(result.current.mood).toBe('idle')
  })

  it('sob StrictMode a montagem tambem nao despacha nada', () => {
    const { result } = setup({ send: SENDING, draft: 'oi' }, true)
    expect(result.current.mood).toBe('idle')
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
})
