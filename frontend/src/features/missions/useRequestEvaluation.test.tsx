import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonBody, requestsTo, routeFetch } from '../../test/fetchRoutes'
import type { EvaluationSummary } from '../../shared/types/mission'
import type { Reward } from '../../shared/types/reward'
import type { EvaluationResult } from './types'
import { useRequestEvaluation } from './useRequestEvaluation'

const KEY = 'POST /api/missions/7/evaluation'

const avaliacao: EvaluationSummary = {
  state: 'concluida',
  verdict: 'atende',
  feedback: 'Bom trabalho.',
  error_code: null,
  model: 'modelo-x',
  finished_at: '2026-09-28T12:00:00Z',
}

const recompensa: Reward = {
  xp_awarded: 50,
  xp_total: 1390,
  level_before: 4,
  level_after: 4,
  achievements_unlocked: [],
}

const comBonus: EvaluationResult = { evaluation: avaliacao, reward: recompensa }
const semBonus: EvaluationResult = {
  evaluation: { ...avaliacao, verdict: 'parcial' },
  reward: null,
}

describe('useRequestEvaluation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('comeca parado e nao vai a rede', () => {
    const fetchMock = routeFetch({})

    const { result } = renderHook(() => useRequestEvaluation(7))

    expect(result.current.state).toEqual({ status: 'idle' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('faz POST com corpo {}, passa por requesting e chega em done com o resultado', async () => {
    let release: (r: Response) => void = () => undefined
    const fetchMock = routeFetch({
      [KEY]: () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    })
    const { result } = renderHook(() => useRequestEvaluation(7))

    act(() => {
      result.current.request()
    })
    expect(result.current.state).toEqual({ status: 'requesting' })

    await act(async () => {
      release(Response.json(comBonus))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'done', result: comBonus })
    })
    const [init] = requestsTo(fetchMock, KEY)
    expect(init).toBeDefined()
    expect(jsonBody(init as RequestInit)).toEqual({})
  })

  it('chama onRewarded quando ha reward', async () => {
    routeFetch({ [KEY]: () => Response.json(comBonus) })
    const onRewarded = vi.fn()
    const { result } = renderHook(() => useRequestEvaluation(7, onRewarded))

    act(() => {
      result.current.request()
    })

    await waitFor(() => {
      expect(result.current.state.status).toBe('done')
    })
    expect(onRewarded).toHaveBeenCalledTimes(1)
  })

  it('um onRewarded que lanca nao vira falha: o bonus ja foi concedido no servidor', async () => {
    routeFetch({ [KEY]: () => Response.json(comBonus) })
    const erro = new Error('quadro quebrou')
    const onRewarded = vi.fn(() => {
      throw erro
    })
    const registrar = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useRequestEvaluation(7, onRewarded))

    act(() => {
      result.current.request()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'done', result: comBonus })
    })
    expect(onRewarded).toHaveBeenCalledTimes(1)
    // A excecao nao some: fica registrada, sem mexer no estado.
    expect(registrar).toHaveBeenCalledWith(expect.any(String), erro)
  })

  it('NAO chama onRewarded quando reward e null', async () => {
    routeFetch({ [KEY]: () => Response.json(semBonus) })
    const onRewarded = vi.fn()
    const { result } = renderHook(() => useRequestEvaluation(7, onRewarded))

    act(() => {
      result.current.request()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'done', result: semBonus })
    })
    expect(onRewarded).not.toHaveBeenCalled()
  })

  it('funciona sem onRewarded', async () => {
    routeFetch({ [KEY]: () => Response.json(comBonus) })
    const { result } = renderHook(() => useRequestEvaluation(7))

    act(() => {
      result.current.request()
    })

    await waitFor(() => {
      expect(result.current.state.status).toBe('done')
    })
  })

  it('falha 502 vira failed com a traducao', async () => {
    routeFetch({
      [KEY]: () => Response.json({ code: 'provedor_indisponivel', detail: 'x' }, { status: 502 }),
    })
    const { result } = renderHook(() => useRequestEvaluation(7))

    act(() => {
      result.current.request()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'failed',
        failure: {
          message: 'A Tifa não conseguiu avaliar agora. Tente de novo.',
          recovery: 'retry',
        },
      })
    })
  })

  it('falha 422: a evidencia foi recusada, e nao "tente de novo"', async () => {
    routeFetch({
      [KEY]: () => Response.json({ detail: [{ msg: 'x' }] }, { status: 422 }),
    })
    const { result } = renderHook(() => useRequestEvaluation(7))

    act(() => {
      result.current.request()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'failed',
        failure: {
          message: 'A evidência não foi aceita. Revise o texto e o link.',
          recovery: 'unavailable',
        },
      })
    })
  })

  it('um segundo request com um pedido em voo NAO faz outro POST', async () => {
    let release: (r: Response) => void = () => undefined
    const fetchMock = routeFetch({
      [KEY]: () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    })
    const { result } = renderHook(() => useRequestEvaluation(7))

    act(() => {
      result.current.request()
      result.current.request()
    })
    act(() => {
      result.current.request()
    })

    expect(requestsTo(fetchMock, KEY)).toHaveLength(1)
    await act(async () => {
      release(Response.json(semBonus))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('done')
    })
  })

  it('depois de failed, request tenta de novo', async () => {
    const fetchMock = routeFetch({
      [KEY]: (_init, call) =>
        call === 1
          ? Response.json({ code: 'tempo_esgotado', detail: 'x' }, { status: 504 })
          : Response.json(semBonus),
    })
    const { result } = renderHook(() => useRequestEvaluation(7))

    act(() => {
      result.current.request()
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('failed')
    })
    act(() => {
      result.current.request()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'done', result: semBonus })
    })
    expect(requestsTo(fetchMock, KEY)).toHaveLength(2)
  })
})
