import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

function stubReducedMotion(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  const removeEventListener = vi.fn((_type: 'change', listener: () => void) => {
    listeners.delete(listener)
  })
  const queries: string[] = []
  vi.stubGlobal('matchMedia', (query: string) => {
    queries.push(query)
    return {
      media: query,
      get matches() {
        return matches
      },
      addEventListener: (_type: 'change', listener: () => void) => {
        listeners.add(listener)
      },
      removeEventListener,
    }
  })
  return {
    queries,
    listeners,
    removeEventListener,
    set: (value: boolean) => {
      matches = value
      for (const listener of listeners) listener()
    },
  }
}

describe('usePrefersReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('le a preferencia de movimento reduzido', () => {
    const media = stubReducedMotion(true)

    const { result } = renderHook(() => usePrefersReducedMotion())

    expect(result.current).toBe(true)
    expect(media.queries).toContain('(prefers-reduced-motion: reduce)')
  })

  it('e falso quando a pessoa nao pediu', () => {
    stubReducedMotion(false)

    const { result } = renderHook(() => usePrefersReducedMotion())

    expect(result.current).toBe(false)
  })

  it('acompanha a troca ao vivo pelo evento change', () => {
    const media = stubReducedMotion(false)
    const { result } = renderHook(() => usePrefersReducedMotion())

    act(() => {
      media.set(true)
    })

    expect(result.current).toBe(true)
  })

  it('remove o ouvinte ao desmontar', () => {
    const media = stubReducedMotion(false)
    const { unmount } = renderHook(() => usePrefersReducedMotion())
    expect(media.listeners.size).toBe(1)

    unmount()

    expect(media.removeEventListener).toHaveBeenCalledTimes(1)
    expect(media.listeners.size).toBe(0)
  })
})
