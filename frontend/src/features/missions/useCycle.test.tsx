import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeFetch } from '../../test/fetchRoutes'
import type { Cycle } from './types'
import { useCycle } from './useCycle'

const semPlano: Cycle = {
  today: '2026-09-23',
  mission: null,
  streak: 0,
  days_to_milestone: 7,
  special: null,
}
const comSequencia: Cycle = { ...semPlano, streak: 1, days_to_milestone: 6 }

describe('useCycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('carrega o ciclo', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(semPlano) })
    const { result } = renderHook(() => useCycle())
    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        cycle: semPlano,
        refreshFailed: false,
      })
    })
  })

  it('mostra o erro com a mensagem do cliente HTTP, e o reload tenta de novo', async () => {
    routeFetch({
      'GET /api/cycle': (_init, call) =>
        call === 1 ? new Response(null, { status: 503 }) : Response.json(semPlano),
    })
    const { result } = renderHook(() => useCycle())
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
      expect(result.current.state.status).toBe('loaded')
    })
  })

  it('uma falha que nao e ApiError tem mensagem propria', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nao e json', { status: 200 })))
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'error',
        message: 'Falha inesperada ao carregar o ciclo.',
      })
    })
  })

  it('o refresh atualiza sem passar por carregando', async () => {
    routeFetch({
      'GET /api/cycle': (_init, call) => Response.json(call === 1 ? semPlano : comSequencia),
    })
    const { result } = renderHook(() => useCycle())
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
        cycle: comSequencia,
        refreshFailed: false,
      })
    })
  })

  it('o refresh que falha mantem o ciclo e marca que pode estar desatualizado', async () => {
    routeFetch({
      'GET /api/cycle': (_init, call) =>
        call === 1 ? Response.json(semPlano) : new Response(null, { status: 500 }),
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
    act(() => {
      result.current.refresh()
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        cycle: semPlano,
        refreshFailed: true,
      })
    })
  })

  it('o refresh que falha durante um reload nao troca o carregando por nada', async () => {
    let falharRefresh: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/cycle': (_init, call) => {
        if (call === 1) return Response.json(semPlano)
        if (call === 2)
          return new Promise<Response>((resolve) => {
            falharRefresh = resolve
          })
        return new Promise<Response>(() => undefined) // o reload fica em voo
      },
    })
    const { result } = renderHook(() => useCycle())
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

  it('a aba que volta a ficar visivel atualiza o ciclo em silencio (a virada do dia)', async () => {
    // O cenario da meia-noite: a aba ficou aberta de um dia para o outro, e
    // `today` precisa mudar sem passar por "carregando" -- e o motivo de
    // existir o `refresh` silencioso, agora ligado ao evento real.
    const ontem: Cycle = { ...semPlano, today: '2026-09-23' }
    const hoje: Cycle = { ...semPlano, today: '2026-09-24' }
    routeFetch({
      'GET /api/cycle': (_init, call) => Response.json(call === 1 ? ontem : hoje),
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', cycle: ontem, refreshFailed: false })
    })

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // Logo apos o evento, ainda na mesma volta de eventos: nao virou
    // "carregando". Se a fiacao usasse `reload` no lugar de `refresh`, este
    // `state.status` seria `loading` aqui.
    expect(result.current.state.status).toBe('loaded')

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', cycle: hoje, refreshFailed: false })
    })
  })

  it('um pedido cancelado que so rejeita DEPOIS do bom ja ter assentado nao vira erro', async () => {
    // A guarda `controller.signal.aborted` existe para o pedido cancelado que
    // demora a notificar: o StrictMode (ou uma troca de tela) aborta o
    // primeiro pedido e monta o segundo, mas a rejeicao do PRIMEIRO so chega
    // depois -- as vezes depois de o segundo ja ter assentado com sucesso. Sem
    // a guarda, essa rejeicao tardia sobrescreveria o `loaded` bom com erro.
    //
    // Um teste que so desmonta e verifica `result.current` NAO prova nada: o
    // `renderHook` para de re-renderizar apos a desmontagem, entao
    // `result.current` fica congelado no ultimo valor (`loading`) mesmo se a
    // guarda for removida e o `setState` do erro for chamado -- medido tirando
    // a guarda e vendo aquele teste continuar verde. E um teste que rejeita o
    // primeiro pedido NO PROPRIO evento de abort tambem nao prova nada aqui:
    // a rejeicao chegaria antes do segundo pedido assentar, e o `loaded`
    // que vem depois esconderia o defeito. Por isso a rejeicao do primeiro
    // pedido e deliberadamente ADIADA para depois do `loaded` ja estar na tela.
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
        return Promise.resolve(Response.json(semPlano))
      }),
    )

    const { result } = renderHook(() => useCycle(), { wrapper: StrictMode })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        cycle: semPlano,
        refreshFailed: false,
      })
    })
    expect(chamadas).toBe(2)

    await act(async () => {
      rejeitarPrimeiro(new DOMException('Aborted', 'AbortError'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.state).toEqual({
      status: 'loaded',
      cycle: semPlano,
      refreshFailed: false,
    })
  })
})
