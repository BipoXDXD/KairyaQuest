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

  it('dois refresh concorrentes em que o primeiro responde por ultimo: fica o dado do segundo', async () => {
    // `visibilitychange` e `focus` podem chamar `refresh()` os dois quando a
    // aba volta -- duas chamadas ficam em voo ao mesmo tempo, sem garantia
    // de que a mais VELHA responde primeiro. Sem a guarda de sequencia, a
    // resposta do primeiro chegando por ultimo sobrescreveria o dado do
    // segundo com um dado desatualizado.
    let resolverPrimeiro: (resposta: Response) => void = () => undefined
    let resolverSegundo: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/plans/current': (_init, call) => {
        if (call === 1) return Response.json({ plan: plano })
        if (call === 2)
          return new Promise<Response>((resolve) => {
            resolverPrimeiro = resolve
          })
        if (call === 3)
          return new Promise<Response>((resolve) => {
            resolverSegundo = resolve
          })
        return new Promise<Response>(() => undefined)
      },
    })
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })

    act(() => {
      result.current.refresh()
      result.current.refresh()
    })

    // O SEGUNDO (mais recente) responde primeiro, com sucesso.
    await act(async () => {
      resolverSegundo(Response.json({ plan: planoAtualizado }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      plan: planoAtualizado,
      refreshFailed: false,
    })

    // O PRIMEIRO (mais velho) so responde DEPOIS, com um dado diferente --
    // e ignorado.
    const planoDesatualizado: Plan = {
      ...plano,
      special: { availability: 'bloqueada', progress: 1, mission: null },
    }
    await act(async () => {
      resolverPrimeiro(Response.json({ plan: planoDesatualizado }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      plan: planoAtualizado,
      refreshFailed: false,
    })
  })

  it('o primeiro refresh tem sucesso e o segundo (mais recente) falha depois: o aviso reflete o pedido mais recente', async () => {
    // Mesma decisao de desenho do `useCycle`: a resposta que conta e sempre
    // a do pedido mais RECENTE, sucesso ou falha, sem tratar erro como caso
    // especial.
    let resolverPrimeiro: (resposta: Response) => void = () => undefined
    let resolverSegundo: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/plans/current': (_init, call) => {
        if (call === 1) return Response.json({ plan: plano })
        if (call === 2)
          return new Promise<Response>((resolve) => {
            resolverPrimeiro = resolve
          })
        if (call === 3)
          return new Promise<Response>((resolve) => {
            resolverSegundo = resolve
          })
        return new Promise<Response>(() => undefined)
      },
    })
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })

    act(() => {
      result.current.refresh()
      result.current.refresh()
    })

    // O PRIMEIRO (mais velho) responde com sucesso primeiro -- mas o
    // SEGUNDO ja esta em voo, entao esta resposta e descartada (o plano
    // continua o da carga inicial).
    await act(async () => {
      resolverPrimeiro(Response.json({ plan: planoAtualizado }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      plan: plano,
      refreshFailed: false,
    })

    // O SEGUNDO (mais recente) falha depois: e o unico que conta.
    await act(async () => {
      resolverSegundo(new Response(null, { status: 500 }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      plan: plano,
      refreshFailed: true,
    })
  })

  it('o segundo refresh (mais recente) tem sucesso, e o primeiro (mais velho) falha por ultimo: sem aviso de desatualizado', async () => {
    let resolverPrimeiro: (resposta: Response) => void = () => undefined
    let resolverSegundo: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/plans/current': (_init, call) => {
        if (call === 1) return Response.json({ plan: plano })
        if (call === 2)
          return new Promise<Response>((resolve) => {
            resolverPrimeiro = resolve
          })
        if (call === 3)
          return new Promise<Response>((resolve) => {
            resolverSegundo = resolve
          })
        return new Promise<Response>(() => undefined)
      },
    })
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })

    act(() => {
      result.current.refresh()
      result.current.refresh()
    })

    // O SEGUNDO (mais recente) tem sucesso primeiro.
    await act(async () => {
      resolverSegundo(Response.json({ plan: planoAtualizado }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      plan: planoAtualizado,
      refreshFailed: false,
    })

    // O PRIMEIRO (mais velho) falha por ultimo -- e ignorado: nao liga o
    // aviso por cima de um dado que ja esta atualizado.
    await act(async () => {
      resolverPrimeiro(new Response(null, { status: 500 }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      plan: planoAtualizado,
      refreshFailed: false,
    })
  })

  it('um reload que comeca com um refresh em voo invalida a resposta atrasada do refresh', async () => {
    let resolverRefresh: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/plans/current': (_init, call) => {
        if (call === 1) return Response.json({ plan: plano })
        if (call === 2)
          return new Promise<Response>((resolve) => {
            resolverRefresh = resolve
          })
        if (call === 3) return Response.json({ plan: planoAtualizado })
        return new Promise<Response>(() => undefined)
      },
    })
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })

    act(() => {
      result.current.refresh() // call 2, fica em voo
    })
    act(() => {
      result.current.reload() // call 3, ja completa
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        plan: planoAtualizado,
        refreshFailed: false,
      })
    })

    // O refresh antigo (call 2) so responde AGORA, com um dado diferente do
    // reload -- e ignorado.
    const planoAntigo: Plan = {
      ...plano,
      special: { availability: 'bloqueada', progress: 6, mission: null },
    }
    await act(async () => {
      resolverRefresh(Response.json({ plan: planoAntigo }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      plan: planoAtualizado,
      refreshFailed: false,
    })
  })

  it('o sucesso do pedido inicial que chega DEPOIS de um refresh mais novo ja ter assentado nao sobrescreve o dado mais novo', async () => {
    // A mesma guarda de sequencia vale para a carga do EFEITO (montagem),
    // nao so para `refresh`: aqui e o pedido inicial que fica velho.
    let resolverInicial: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/plans/current': (_init, call) => {
        if (call === 1)
          return new Promise<Response>((resolve) => {
            resolverInicial = resolve
          })
        if (call === 2) return Response.json({ plan: planoAtualizado })
        return new Promise<Response>(() => undefined)
      },
    })
    const { result } = renderHook(() => useCurrentPlan())
    expect(result.current.state).toEqual({ status: 'loading' })

    act(() => {
      result.current.refresh() // call 2, mais novo -- responde com sucesso primeiro
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        plan: planoAtualizado,
        refreshFailed: false,
      })
    })

    // O pedido inicial (mais velho) so responde AGORA, com um dado
    // diferente -- e ignorado.
    await act(async () => {
      resolverInicial(Response.json({ plan: plano }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      plan: planoAtualizado,
      refreshFailed: false,
    })
  })

  // Falha do `refresh` com a tela ainda em "carregando". `refresh()` incrementa a
  // sequencia, entao a resposta da carga inicial do efeito passa a ser
  // descartada quando chegar -- quem decide o estado e o refresh. Se ele
  // falha com a tela ainda em "carregando", "carregando" vira ERRO (com o
  // "Tentar novamente"): antes, o `catch` so sabia marcar `refreshFailed`
  // num estado `loaded` e devolvia o `loading` intacto, e a tela ficava
  // presa em "Consultando..." para sempre. A carga inicial ASSENTA depois,
  // de proposito: e isso que mostra que nada mais tiraria a tela de
  // "carregando" (um teste em que ela nunca assenta passaria vacuamente).
  it.each([
    ['com sucesso', () => Response.json({ plan: plano })],
    ['com falha', () => new Response(null, { status: 502 })],
  ])(
    'o refresh que falha antes da carga inicial assentar vira erro, e a carga inicial que assenta depois (%s) nao muda isso',
    async (_caso, respostaInicial) => {
      let resolverInicial: (resposta: Response) => void = () => undefined
      let resolverRefresh: (resposta: Response) => void = () => undefined
      routeFetch({
        'GET /api/plans/current': (_init, call) => {
          if (call === 1)
            return new Promise<Response>((resolve) => {
              resolverInicial = resolve
            })
          if (call === 2)
            return new Promise<Response>((resolve) => {
              resolverRefresh = resolve
            })
          return new Promise<Response>(() => undefined)
        },
      })
      const { result } = renderHook(() => useCurrentPlan())
      expect(result.current.state).toEqual({ status: 'loading' })

      act(() => {
        result.current.refresh()
      })
      await act(async () => {
        resolverRefresh(new Response(null, { status: 503 }))
        await Promise.resolve()
      })
      await waitFor(() => {
        expect(result.current.state).toEqual({
          status: 'error',
          message: 'O servidor respondeu 503.',
        })
      })

      // Um macrotask inteiro: deixa a resposta inicial percorrer todo o
      // `requestJson` (corpo, JSON, `then`/`catch` do efeito) antes da
      // assercao -- so microtasks poderiam afirmar antes de ela chegar.
      await act(async () => {
        resolverInicial(respostaInicial())
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(result.current.state).toEqual({
        status: 'error',
        message: 'O servidor respondeu 503.',
      })
    },
  )

  it('o refresh que falha com a tela ja no erro deixa o erro como esta, com a mensagem da carga', async () => {
    // O terceiro ramo do `catch` do refresh: nem `loaded` (marcaria
    // desatualizado) nem `loading` (viraria erro) -- o erro que ja esta na
    // tela, com o "Tentar novamente", continua sendo a saida.
    routeFetch({
      'GET /api/plans/current': (_init, call) =>
        call === 1 ? new Response(null, { status: 503 }) : new Response(null, { status: 500 }),
    })
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'error',
        message: 'O servidor respondeu 503.',
      })
    })
    await act(async () => {
      result.current.refresh()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(result.current.state).toEqual({ status: 'error', message: 'O servidor respondeu 503.' })
  })

  it('a aba que volta a ficar visivel atualiza a trilha em silencio', async () => {
    routeFetch({
      'GET /api/plans/current': (_init, call) =>
        Response.json({ plan: call === 1 ? plano : planoAtualizado }),
    })
    const { result } = renderHook(() => useCurrentPlan())
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', plan: plano, refreshFailed: false })
    })

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // Logo apos o evento: nao virou "carregando". Se a fiacao usasse `reload`
    // no lugar de `refresh`, este `state.status` seria `loading` aqui.
    expect(result.current.state.status).toBe('loaded')

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        plan: planoAtualizado,
        refreshFailed: false,
      })
    })
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
