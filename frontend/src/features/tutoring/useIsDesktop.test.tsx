import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewport } from '../../test/viewport'
import { useIsDesktop } from './useIsDesktop'

describe('useIsDesktop', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['desktop', true],
    ['mobile', false],
  ] as const)('%s responde %s', (kind, expected) => {
    stubViewport(kind)
    expect(renderHook(() => useIsDesktop()).result.current).toBe(expected)
  })

  it('acompanha a janela cruzando o limite, e solta o ouvinte ao desmontar', () => {
    const viewport = stubViewport('mobile')
    const { result, unmount } = renderHook(() => useIsDesktop())
    act(() => {
      viewport.setDesktop(true)
    })
    expect(result.current).toBe(true)
    unmount()
    // Sem ouvinte, mudar de novo nao chama nada que ja desmontou.
    expect(() => {
      viewport.setDesktop(false)
    }).not.toThrow()
  })
})
