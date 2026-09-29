import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeFetch } from '../../test/fetchRoutes'
import { useTutorStatus } from './useTutorStatus'

describe('useTutorStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    [true, 'available'],
    [false, 'unavailable'],
  ])('available: %s vira %s', async (available, status) => {
    routeFetch({ 'GET /api/tutoring/status': () => Response.json({ available }) })
    const { result } = renderHook(() => useTutorStatus())
    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status })
    })
  })

  it('a falha vira erro, e o reload tenta de novo', async () => {
    routeFetch({
      'GET /api/tutoring/status': (_init, call) =>
        call === 1 ? Response.json({}, { status: 500 }) : Response.json({ available: true }),
    })
    const { result } = renderHook(() => useTutorStatus())
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'error' })
    })

    act(() => {
      result.current.reload()
    })
    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'available' })
    })
  })

  it('desmontar no meio nao escreve estado de erro', async () => {
    let signal: AbortSignal | undefined
    routeFetch({
      'GET /api/tutoring/status': (init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    })
    const { unmount } = renderHook(() => useTutorStatus())
    unmount()
    await waitFor(() => {
      expect(signal?.aborted).toBe(true)
    })
    // Que o abort nao vira `error` nao se ve aqui (o React descarta o setState
    // depois do `unmount`): quem diz NAO e o caso do StrictMode, abaixo.
  })

  it('ignora o cancelamento do pedido descartado pelo StrictMode', async () => {
    // O StrictMode monta, limpa e remonta o efeito no MESMO componente. A
    // limpeza aborta o primeiro pedido, e a rejeicao do abort chega com o
    // componente vivo -- sem a guarda de `signal.aborted`, ela vira `error`.
    // O segundo pedido fica segurado para o `error` aparecer se escrito.
    let releaseSecond: ((response: Response) => void) | undefined
    routeFetch({
      'GET /api/tutoring/status': (init, call) =>
        new Promise<Response>((resolve, reject) => {
          if (call === 1) {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          } else {
            releaseSecond = resolve
          }
        }),
    })
    const { result } = renderHook(() => useTutorStatus(), { wrapper: StrictMode })
    await waitFor(() => {
      expect(releaseSecond).toBeDefined()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(result.current.state).toEqual({ status: 'loading' })

    act(() => {
      releaseSecond?.(Response.json({ available: true }))
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'available' })
    })
  })

  it('depois do reload, a resposta do pedido antigo, que chega por ultimo, nao sobrescreve a nova', async () => {
    // O `fetch` falso IGNORA o abort: a resposta velha ("indisponivel") chega
    // DEPOIS da nova ("disponivel"), e so a guarda de `signal.aborted` no
    // sucesso impede que ela grave o estado por cima.
    const respostas: Array<(response: Response) => void> = []
    routeFetch({
      'GET /api/tutoring/status': () =>
        new Promise<Response>((resolve) => {
          respostas.push(resolve)
        }),
    })

    const { result } = renderHook(() => useTutorStatus())
    await waitFor(() => {
      expect(respostas).toHaveLength(1)
    })
    act(() => {
      result.current.reload()
    })
    await waitFor(() => {
      expect(respostas).toHaveLength(2)
    })

    act(() => {
      respostas[1]?.(Response.json({ available: true }))
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'available' })
    })
    await act(async () => {
      respostas[0]?.(Response.json({ available: false }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(result.current.state).toEqual({ status: 'available' })
  })
})
