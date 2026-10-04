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
    // limpeza aborta o primeiro pedido, e a rejeição chega com o componente
    // vivo. As guardas de cancelamento e geração preservam o estado atual.
    // O segundo pedido fica retido para observar qualquer erro indevido.
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

  it.each(['success', 'error'] as const)(
    'ignora %s antigo enquanto a recarga atual ainda carrega',
    async (outcome) => {
      let finishOld!: (response: Response) => void
      let failOld!: (error: Error) => void
      let finishCurrent!: (response: Response) => void
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise<Response>((resolve, reject) => {
                finishOld = resolve
                failOld = reject
              }),
          )
          .mockImplementationOnce(
            () =>
              new Promise<Response>((resolve) => {
                finishCurrent = resolve
              }),
          ),
      )
      const { result } = renderHook(useTutorStatus)
      act(() => result.current.reload())
      await act(async () => {
        if (outcome === 'success') finishOld(Response.json({ available: false }))
        else failOld(new Error('falha antiga'))
      })
      expect(result.current.state).toEqual({ status: 'loading' })
      await act(async () => finishCurrent(Response.json({ available: true })))
      expect(result.current.state).toEqual({ status: 'available' })
    },
  )

  it.each(['success', 'error'] as const)(
    'invalida %s antigo na chamada de reload, antes do próximo efeito',
    async (outcome) => {
      let finishOld!: (response: Response) => void
      let failOld!: (error: Error) => void
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise<Response>((resolve, reject) => {
                finishOld = resolve
                failOld = reject
              }),
          )
          .mockImplementationOnce(() => new Promise<Response>(() => undefined)),
      )
      const { result } = renderHook(useTutorStatus)
      await act(async () => {
        result.current.reload()
        if (outcome === 'success') finishOld(Response.json({ available: false }))
        else failOld(new Error('falha antiga'))
        // A atualização fica agrupada no act: a resposta antecede a limpeza.
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(result.current.state).toEqual({ status: 'loading' })
    },
  )

  it.each([false, true])(
    'mantém a resposta atual quando chega sucesso antigo (StrictMode: %s)',
    async (strict) => {
      let finishOld!: (response: Response) => void
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise<Response>((resolve) => {
                finishOld = resolve
              }),
          )
          .mockResolvedValueOnce(Response.json({ available: true })),
      )
      const { result } = renderHook(useTutorStatus, strict ? { wrapper: StrictMode } : {})
      if (!strict) act(() => result.current.reload())
      await waitFor(() => expect(result.current.state).toEqual({ status: 'available' }))
      await act(async () => finishOld(Response.json({ available: false })))
      expect(result.current.state).toEqual({ status: 'available' })
    },
  )

  it('preserva a falha da recarga atual quando chega sucesso antigo', async () => {
    let finishOld!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              finishOld = resolve
            }),
        )
        .mockResolvedValueOnce(Response.json({}, { status: 503 })),
    )
    const { result } = renderHook(useTutorStatus)
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    const errorState = result.current.state
    await act(async () => finishOld(Response.json({ available: false })))
    expect(result.current.state).toEqual(errorState)
  })

  it('mantém o dado atual quando chega erro antigo', async () => {
    let failOld!: (error: Error) => void
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((_resolve, reject) => {
              failOld = reject
            }),
        )
        .mockResolvedValueOnce(Response.json({ available: true })),
    )
    const { result } = renderHook(useTutorStatus)
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.state).toEqual({ status: 'available' }))
    await act(async () => failOld(new Error('falha antiga')))
    expect(result.current.state).toEqual({ status: 'available' })
  })
})
