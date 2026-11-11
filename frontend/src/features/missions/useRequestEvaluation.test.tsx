import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonBody, pendingUntilAborted, requestsTo, routeFetch } from '../../test/fetchRoutes'
import { EVALUATION_TIMEOUT_MS } from '../../shared/api/client'
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
    vi.useRealTimers()
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

  it('uma resposta SEM a chave reward (contrato violado) nao chama onRewarded', async () => {
    routeFetch({ [KEY]: () => Response.json({ evaluation: avaliacao }) })
    const onRewarded = vi.fn()
    const { result } = renderHook(() => useRequestEvaluation(7, onRewarded))

    act(() => {
      result.current.request()
    })

    await waitFor(() => {
      expect(result.current.state.status).toBe('done')
    })
    expect(onRewarded).not.toHaveBeenCalled()
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
          message: 'missions.evaluationFailure.providerUnavailable.message',
          recovery: 'missions.failure.tryAgain',
          action: 'retry',
        },
      })
    })
  })

  it('falha 422: o id fora da faixa e uma missao que nao existe, entao manda atualizar', async () => {
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
          message: 'missions.failure.notAvailable',
          recovery: 'missions.failure.refresh',
          action: 'refresh',
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

  it('E5 uma avaliacao pendurada falha so ao fim do prazo proprio, oferecendo repetir', async () => {
    vi.useFakeTimers()
    routeFetch({ [KEY]: pendingUntilAborted })
    const { result } = renderHook(() => useRequestEvaluation(7))

    act(() => {
      result.current.request()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EVALUATION_TIMEOUT_MS - 1)
    })
    expect(result.current.state).toEqual({ status: 'requesting' })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(result.current.state).toMatchObject({
      status: 'failed',
      failure: { message: 'shared.transportFailure.timeout', action: 'retry' },
    })
  })

  it('E6 o reenvio depois do prazo que encontra a avaliacao ainda em curso pede para esperar', async () => {
    vi.useFakeTimers()
    routeFetch({
      [KEY]: (init, call) =>
        call === 1
          ? pendingUntilAborted(init, call)
          : Response.json({ code: 'avaliacao_em_andamento', detail: 'x' }, { status: 409 }),
    })
    const { result } = renderHook(() => useRequestEvaluation(7))

    act(() => {
      result.current.request()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EVALUATION_TIMEOUT_MS)
    })
    act(() => {
      result.current.request()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.state).toEqual({
      status: 'failed',
      failure: {
        message: 'missions.evaluationFailure.inProgress.message',
        recovery: 'missions.evaluationFailure.inProgress.recovery',
        action: 'retry',
      },
    })
  })

  it('E7 o prazo e maior que o corte do orfao e que o proxy (90 s)', () => {
    // Valor literal de proposito: espelho manual do backend (60 s + 30 s de
    // folga = proxy_read_timeout do nginx). Mudar um lado exige mudar o outro.
    expect(EVALUATION_TIMEOUT_MS).toBe(105_000)
    expect(EVALUATION_TIMEOUT_MS).toBeGreaterThan(90_000)
  })

  it('E8 um 504 tempo_esgotado antes do prazo mantem o texto proprio e desarma o timer', async () => {
    vi.useFakeTimers()
    let release: (r: Response) => void = () => undefined
    routeFetch({
      [KEY]: () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    })
    const { result } = renderHook(() => useRequestEvaluation(7))

    act(() => {
      result.current.request()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(vi.getTimerCount()).toBe(1)

    await act(async () => {
      release(Response.json({ code: 'tempo_esgotado', detail: 'x' }, { status: 504 }))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.state).toEqual({
      status: 'failed',
      failure: {
        message: 'missions.evaluationFailure.timeout.message',
        recovery: 'missions.failure.tryAgain',
        action: 'retry',
      },
    })
    expect(vi.getTimerCount()).toBe(0)
  })
})
