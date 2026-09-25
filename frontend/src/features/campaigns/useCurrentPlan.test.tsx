import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestsTo, routeFetch } from '../../test/fetchRoutes'
import type { Plan } from './types'
import { useCurrentPlan } from './useCurrentPlan'

const plano: Plan = {
  week_start: '2026-09-21',
  days: [],
  special: { availability: 'bloqueada', progress: 2, mission: null },
}
const planoAtualizado: Plan = {
  ...plano,
  special: { availability: 'bloqueada', progress: 3, mission: null },
}

describe('useCurrentPlan', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('carrega a trilha da semana atual pela rota do plano corrente', async () => {
    const fetchMock = routeFetch({ 'GET /api/plans/current': () => Response.json({ plan: plano }) })
    const { result } = renderHook(() => useCurrentPlan())
    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', plan: plano, refreshFailed: false })
    })
    expect(requestsTo(fetchMock, 'GET /api/plans/current')).toHaveLength(1)
  })

  it('sem plano na semana e estado proprio, e nao erro', async () => {
    routeFetch({ 'GET /api/plans/current': () => Response.json({ plan: null }) })
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'no-plan' })
    })
  })

  it('mostra o erro com a mensagem do cliente HTTP, e o reload tenta de novo', async () => {
    routeFetch({
      'GET /api/plans/current': (_init, call) =>
        call === 1 ? new Response(null, { status: 503 }) : Response.json({ plan: plano }),
    })
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'error',
        message: 'O servidor respondeu 503.',
      })
    })
    act(() => {
      result.current.reload()
    })
    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', plan: plano, refreshFailed: false })
    })
  })

  it('uma falha que nao e ApiError tem mensagem propria', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nao e json', { status: 200 })))
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'error',
        message: 'Falha inesperada ao carregar a trilha.',
      })
    })
  })

  it('o refresh atualiza sem passar por carregando', async () => {
    routeFetch({
      'GET /api/plans/current': (_init, call) =>
        Response.json({ plan: call === 1 ? plano : planoAtualizado }),
    })
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
    act(() => {
      result.current.refresh()
    })
    expect(result.current.state.status).toBe('loaded')
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        plan: planoAtualizado,
        refreshFailed: false,
      })
    })
  })

  it('o refresh que descobre que a semana ficou sem plano troca para no-plan', async () => {
    routeFetch({
      'GET /api/plans/current': (_init, call) => Response.json({ plan: call === 1 ? plano : null }),
    })
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
    act(() => {
      result.current.refresh()
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'no-plan' })
    })
  })

  it('o refresh que falha mantem o plano e marca que pode estar desatualizado', async () => {
    routeFetch({
      'GET /api/plans/current': (_init, call) =>
        call === 1 ? Response.json({ plan: plano }) : new Response(null, { status: 500 }),
    })
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
    act(() => {
      result.current.refresh()
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        plan: plano,
        refreshFailed: true,
      })
    })
  })

  it('o refresh que falha durante um reload nao troca o carregando por nada', async () => {
    let falharRefresh: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/plans/current': (_init, call) => {
        if (call === 1) return Response.json({ plan: plano })
        if (call === 2)
          return new Promise<Response>((resolve) => {
            falharRefresh = resolve
          })
        return new Promise<Response>(() => undefined) // o reload fica em voo
      },
    })
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
    act(() => {
      result.current.refresh()
      result.current.reload()
    })
    await act(async () => {
      falharRefresh(new Response(null, { status: 500 }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({ status: 'loading' })
  })

  it('um pedido cancelado que so rejeita DEPOIS do bom ja ter assentado nao vira erro', async () => {
    // Mesmo desenho do teste de `useCycle`: a rejeicao do pedido que o
    // StrictMode abortou e ADIADA para depois de o segundo pedido ja ter
    // assentado. Rejeitar no proprio abort, ou so desmontar, deixaria o teste
    // verde sem a guarda `signal.aborted` (medido la).
    let rejeitarPrimeiro: (error: unknown) => void = () => undefined
    let chamadas = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        chamadas += 1
        if (chamadas === 1) {
          return new Promise<Response>((_resolve, reject) => {
            rejeitarPrimeiro = reject
          })
        }
        return Promise.resolve(Response.json({ plan: plano }))
      }),
    )

    const { result } = renderHook(() => useCurrentPlan(), { wrapper: StrictMode })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', plan: plano, refreshFailed: false })
    })
    expect(chamadas).toBe(2)

    await act(async () => {
      rejeitarPrimeiro(new DOMException('Aborted', 'AbortError'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.state).toEqual({ status: 'loaded', plan: plano, refreshFailed: false })
  })
})
