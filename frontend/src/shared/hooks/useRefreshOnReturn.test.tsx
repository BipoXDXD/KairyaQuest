import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRefreshOnReturn } from './useRefreshOnReturn'

/** Troca `document.visibilityState`, como o navegador faz ao trocar de aba. */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

describe('useRefreshOnReturn', () => {
  afterEach(() => {
    setVisibility('visible')
    vi.unstubAllGlobals()
  })

  it('chama o refresh quando a aba volta a ficar visivel', () => {
    const refresh = vi.fn()
    setVisibility('visible')
    renderHook(() => {
      useRefreshOnReturn(refresh)
    })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('nao chama o refresh quando o documento fica oculto', () => {
    const refresh = vi.fn()
    renderHook(() => {
      useRefreshOnReturn(refresh)
    })
    setVisibility('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('chama o refresh quando a janela recebe foco', () => {
    const refresh = vi.fn()
    renderHook(() => {
      useRefreshOnReturn(refresh)
    })
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('para de chamar depois de desmontar', () => {
    const refresh = vi.fn()
    const { unmount } = renderHook(() => {
      useRefreshOnReturn(refresh)
    })
    unmount()
    setVisibility('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('usa sempre o refresh mais recente, sem reinscrever os ouvintes quando ele troca de identidade', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const primeiroRefresh = vi.fn()
    const segundoRefresh = vi.fn()
    const { rerender } = renderHook(
      ({ refresh }: { refresh: () => void }) => {
        useRefreshOnReturn(refresh)
      },
      { initialProps: { refresh: primeiroRefresh } },
    )

    rerender({ refresh: segundoRefresh })
    rerender({ refresh: segundoRefresh })

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(segundoRefresh).toHaveBeenCalledTimes(1)
    expect(primeiroRefresh).not.toHaveBeenCalled()
    // O ouvinte de `visibilitychange` foi registrado uma UNICA vez: se o
    // efeito dependesse de `refresh`, cada troca de identidade reinscreveria.
    expect(addSpy.mock.calls.filter(([nome]) => nome === 'visibilitychange')).toHaveLength(1)
  })
})
