import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { memoryStorage } from '../../test/audioDoubles'
import {
  LANTERN_REVEAL_KEY,
  isRevealPending,
  markRevealSeen,
  useLanternReveal,
} from './lanternReveal'

const HOJE = '2026-09-25'

function quebrado(metodo: 'getItem' | 'setItem'): Storage {
  const storage = memoryStorage()
  vi.spyOn(storage, metodo).mockImplementation(() => {
    throw new DOMException('bloqueado', 'SecurityError')
  })
  return storage
}

describe('isRevealPending', () => {
  it('nunca vista: a lanterna de hoje ainda acende', () => {
    expect(isRevealPending(HOJE, memoryStorage())).toBe(true)
  })

  it('vista hoje: nao acende de novo', () => {
    expect(isRevealPending(HOJE, memoryStorage({ [LANTERN_REVEAL_KEY]: HOJE }))).toBe(false)
  })

  it('vista em outro dia: a de hoje acende', () => {
    expect(isRevealPending(HOJE, memoryStorage({ [LANTERN_REVEAL_KEY]: '2026-09-24' }))).toBe(true)
  })

  it('sem storage: nao anima, porque nao teria como lembrar', () => {
    expect(isRevealPending(HOJE, null)).toBe(false)
  })

  it('storage que lanca na leitura: nao anima', () => {
    expect(isRevealPending(HOJE, quebrado('getItem'))).toBe(false)
  })
})

describe('markRevealSeen', () => {
  it('grava o dia visto, e a lanterna desse dia deixa de estar pendente', () => {
    const storage = memoryStorage({ [LANTERN_REVEAL_KEY]: '2026-09-24' })
    markRevealSeen(HOJE, storage)
    expect(storage.getItem(LANTERN_REVEAL_KEY)).toBe(HOJE)
    expect(isRevealPending(HOJE, storage)).toBe(false)
  })

  it('storage que lanca na escrita: engole a falha', () => {
    expect(() => {
      markRevealSeen(HOJE, quebrado('setItem'))
    }).not.toThrow()
  })

  it('sem storage: nao faz nada', () => {
    expect(() => {
      markRevealSeen(HOJE, null)
    }).not.toThrow()
  })
})

describe('useLanternReveal', () => {
  it('so grava o "ja vista" depois do render, com o render puro', () => {
    const storage = memoryStorage()
    const lidoNoRender: (string | null)[] = []
    const { result } = renderHook(() => {
      const pending = useLanternReveal(HOJE, storage)
      lidoNoRender.push(storage.getItem(LANTERN_REVEAL_KEY))
      return pending
    })
    expect(result.current).toBe(true)
    expect(lidoNoRender[0]).toBeNull()
    expect(storage.getItem(LANTERN_REVEAL_KEY)).toBe(HOJE)
  })
})
