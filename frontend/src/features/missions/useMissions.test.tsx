import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mission } from '../../shared/types/mission'
import { useMissions } from './useMissions'

/** O 503 vira o texto do catalogo pelo `kind`; a `message` de depuracao nao sai do hook. */
const HTTP_FAILURE = {
  kind: 'api',
  text: { message: 'shared.apiError.http.message', recovery: 'shared.apiError.http.recovery' },
} as const

const missao: Mission = {
  id: 1,
  instructions: 'Ler o capitulo 3 de algoritmos',
  completion_criterion: 'Resumo de uma pagina entregue',
  difficulty: 3,
  estimated_minutes: 45,
  mission_type: 'avulsa',
  day: null,
  deadline: '2026-09-20T13:00:00Z',
  state: 'pendente',
  availability: 'disponivel',
  started_at: null,
  completed_at: null,
  xp: 100,
  actual_duration_minutes: null,
  verification: null,
  evidence: null,
  evaluation: null,
  reschedules: [],
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

  it('chega em error com o texto do catalogo pelo kind -- e nunca com o detail do backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ detail: 'Banco indisponivel.' }, { status: 503 })),
    )

    const { result } = renderHook(() => useMissions())

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'error',
        failure: HTTP_FAILURE,
      })
    })
  })

  it('chega em error como falha inesperada, sem texto, quando a falha nao e um ApiError', async () => {
    // 200 com corpo corrompido: o `response.json()` do cliente lanca
    // SyntaxError, que nao passa pela traducao em ApiError.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nao e json')))

    const { result } = renderHook(() => useMissions())

    await waitFor(() => {
      expect(result.current.state.status).toBe('error')
    })
    expect(result.current.state).toEqual({
      status: 'error',
      failure: { kind: 'unexpected' },
    })
  })

  it('ignora o cancelamento do pedido descartado pelo StrictMode', async () => {
    // O StrictMode monta, limpa e remonta o efeito no MESMO componente. A
    // limpeza aborta o primeiro pedido, e a rejeição chega com o componente
    // ainda vivo. As guardas de cancelamento e geração impedem que ela
    // substitua a resposta boa do segundo pedido.
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

  it('depois do reload, a resposta do pedido antigo, que chega por ultimo, nao sobrescreve a nova', async () => {
    // O `fetch` falso IGNORA o abort (o de verdade costuma rejeitar tambem a
    // leitura do corpo, mas uma resposta ja em processamento pode escapar): a
    // resposta velha chega DEPOIS da nova, e so a guarda de `signal.aborted`
    // no sucesso impede que ela grave o estado por cima.
    const respostas: Array<(response: Response) => void> = []
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          respostas.push(resolve)
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const velha: Mission = { ...missao, id: 1, instructions: 'Missao velha' }
    const nova: Mission = { ...missao, id: 2, instructions: 'Missao nova' }

    const { result } = renderHook(() => useMissions())
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
      respostas[1]?.(Response.json([nova]))
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', missions: [nova] })
    })
    await act(async () => {
      respostas[0]?.(Response.json([velha]))
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(result.current.state).toEqual({ status: 'loaded', missions: [nova] })
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
      const { result } = renderHook(useMissions)
      act(() => result.current.reload())
      await act(async () => {
        if (outcome === 'success') finishOld(Response.json([]))
        else failOld(new Error('falha antiga'))
      })
      expect(result.current.state).toEqual({ status: 'loading' })
      await act(async () => finishCurrent(Response.json([missao])))
      expect(result.current.state).toEqual({ status: 'loaded', missions: [missao] })
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
      const { result } = renderHook(useMissions)
      await act(async () => {
        result.current.reload()
        if (outcome === 'success') finishOld(Response.json([]))
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
          .mockResolvedValueOnce(Response.json([missao])),
      )
      const { result } = renderHook(useMissions, strict ? { wrapper: StrictMode } : {})
      if (!strict) act(() => result.current.reload())
      await waitFor(() =>
        expect(result.current.state).toEqual({ status: 'loaded', missions: [missao] }),
      )
      await act(async () => finishOld(Response.json([])))
      expect(result.current.state).toEqual({ status: 'loaded', missions: [missao] })
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
    const { result } = renderHook(useMissions)
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    const errorState = result.current.state
    await act(async () => finishOld(Response.json([])))
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
        .mockResolvedValueOnce(Response.json([missao])),
    )
    const { result } = renderHook(useMissions)
    act(() => result.current.reload())
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'loaded', missions: [missao] }),
    )
    await act(async () => failOld(new Error('falha antiga')))
    expect(result.current.state).toEqual({ status: 'loaded', missions: [missao] })
  })
})
