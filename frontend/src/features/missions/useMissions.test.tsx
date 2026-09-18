import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMissions } from './useMissions'
import type { Mission } from './types'

const missao: Mission = {
  id: 1,
  instructions: 'Ler o capitulo 3 de algoritmos',
  completion_criterion: 'Resumo de uma pagina entregue',
  difficulty: 3,
  estimated_minutes: 45,
  deadline: '2026-09-20T13:00:00Z',
  state: 'pendente',
  started_at: null,
  completed_at: null,
  xp: 100,
  actual_duration_minutes: null,
}

function pendingForever() {
  return new Promise<Response>(() => {
    // Nunca resolve: e assim que o estado de carregamento fica observavel.
  })
}

describe('useMissions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('comeca carregando, antes de a resposta chegar', () => {
    vi.stubGlobal('fetch', vi.fn(pendingForever))

    const { result } = renderHook(() => useMissions())

    expect(result.current.state).toEqual({ status: 'loading' })
  })

  it('chega em loaded com as missoes quando a API responde uma lista', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([missao])))

    const { result } = renderHook(() => useMissions())

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', missions: [missao] })
    })
  })

  it('chega em empty -- e NAO em erro -- quando a API responde []', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([])))

    const { result } = renderHook(() => useMissions())

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'empty' })
    })
  })

  it('chega em error com a mensagem do ApiError -- e nunca com o detail do backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ detail: 'Banco indisponivel.' }, { status: 503 })),
    )

    const { result } = renderHook(() => useMissions())

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'error',
        message: 'O servidor respondeu 503.',
      })
    })
  })

  it('chega em error com mensagem generica quando a falha nao e um ApiError', async () => {
    // 200 com corpo corrompido: o `response.json()` do cliente lanca
    // SyntaxError, que nao passa pela traducao em ApiError.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nao e json')))

    const { result } = renderHook(() => useMissions())

    await waitFor(() => {
      expect(result.current.state.status).toBe('error')
    })
    expect(result.current.state).toEqual({
      status: 'error',
      message: expect.stringMatching(/inesperad/i),
    })
  })

  it('ignora o cancelamento do pedido descartado pelo StrictMode', async () => {
    // O StrictMode monta, limpa e remonta o efeito no MESMO componente. A
    // limpeza aborta o primeiro pedido, e a rejeicao do abort chega quando o
    // componente ainda esta vivo -- sem a guarda de `signal.aborted`, ela
    // vira estado de erro por cima da resposta boa do segundo pedido.
    let chamadas = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        chamadas += 1
        if (chamadas === 1) {
          return new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          })
        }
        return Promise.resolve(Response.json([missao]))
      }),
    )

    const { result } = renderHook(() => useMissions(), { wrapper: StrictMode })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', missions: [missao] })
    })
    expect(chamadas).toBe(2)
  })

  it('reload volta a carregar e refaz o pedido', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ detail: 'Caiu.' }, { status: 500 }))
      .mockResolvedValueOnce(Response.json([missao]))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useMissions())
    await waitFor(() => {
      expect(result.current.state.status).toBe('error')
    })

    act(() => {
      result.current.reload()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', missions: [missao] })
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
