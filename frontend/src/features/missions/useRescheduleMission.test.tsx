import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mission } from '../../shared/types/mission'
import { MUTATION_TIMEOUT_MS } from '../../shared/api/client'
import {
  jsonBody,
  pendingUntilAborted,
  requestsTo,
  routeFetch,
  type Route,
} from '../../test/fetchRoutes'
import type { RescheduleDraft } from './types'
import { useCompleteMission } from './useCompleteMission'
import { useCompletionRegistry } from './useCompletionRegistry'
import { useRescheduleMission } from './useRescheduleMission'
import { useStartMission } from './useStartMission'

const ROTA = 'POST /api/missions/7/reschedule'

const reagendada: Mission = {
  id: 7,
  instructions: 'Ler o capitulo 3 de algoritmos',
  completion_criterion: 'Resumo de uma pagina entregue',
  difficulty: 3,
  estimated_minutes: 45,
  mission_type: 'avulsa',
  day: null,
  deadline: '2026-10-05T21:00:00Z',
  state: 'pendente',
  availability: 'disponivel',
  started_at: null,
  completed_at: null,
  xp: 100,
  actual_duration_minutes: null,
  verification: null,
  evidence: null,
  evaluation: null,
  reschedules: [
    {
      previous_deadline: '2026-10-02T21:00:00Z',
      new_deadline: '2026-10-05T21:00:00Z',
      reason: 'falta_de_tempo',
      origin: 'usuario',
      rescheduled_at: '2026-10-01T14:03:11Z',
    },
  ],
}

// O rascunho valido do teste: 18:00 em Sao Paulo (-03:00 em 2026) sao 21:00Z.
const RASCUNHO: RescheduleDraft = { civil: '2026-10-05T18:00', reason: 'falta_de_tempo' }

const K1 = '00000000-0000-4000-8000-000000000001'
const K2 = '00000000-0000-4000-8000-000000000002'

const sucesso: Route = () => Response.json(reagendada)
const falhaDeRede: Route = () => Promise.reject(new TypeError('Failed to fetch'))
const semResposta: Route = () =>
  new Promise<Response>(() => {
    // Nunca resolve: e assim que o estado de envio fica observavel.
  })

function comCode(code: string, status: number): Route {
  return () => Response.json({ detail: 'x', code }, { status })
}

/** O hook como o quadro o usa: com o registro de verdade, e nao com um falso. */
function renderReschedule() {
  const reload = vi.fn()
  const rendered = renderHook(() => {
    const { registry, reload: requestReload } = useCompletionRegistry(reload)
    return {
      registry,
      ...useRescheduleMission(7, registry),
      start: useStartMission(7, registry).start,
      complete: useCompleteMission(7, registry).complete,
      requestReload,
    }
  })
  return { ...rendered, reload }
}

function sentKeys(fetchMock: ReturnType<typeof routeFetch>, rota = ROTA): unknown[] {
  return requestsTo(fetchMock, rota).map(
    (init) => (jsonBody(init) as { operation_id: string }).operation_id,
  )
}

describe('useRescheduleMission', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(K1).mockReturnValueOnce(K2)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('comeca parado, sem ir a rede e sem gerar chave', () => {
    const fetchMock = routeFetch({})

    const { result } = renderReschedule()

    expect(result.current.state).toEqual({ status: 'idle' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(crypto.randomUUID).not.toHaveBeenCalled()
  })

  it('fica em submitting enquanto a resposta nao chega', () => {
    routeFetch({ [ROTA]: semResposta })
    const { result } = renderReschedule()

    act(() => {
      result.current.reschedule(RASCUNHO)
    })

    expect(result.current.state).toEqual({ status: 'submitting' })
  })

  it('manda o prazo de Sao Paulo como instante UTC e chega em rescheduled com a missao da API', async () => {
    const fetchMock = routeFetch({ [ROTA]: sucesso })
    const { result } = renderReschedule()

    act(() => {
      result.current.reschedule(RASCUNHO)
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'rescheduled', mission: reagendada })
    })
    expect(requestsTo(fetchMock, ROTA)).toHaveLength(1)
    expect(jsonBody(requestsTo(fetchMock, ROTA)[0] as RequestInit)).toEqual({
      operation_id: K1,
      new_deadline: '2026-10-05T21:00:00.000Z',
      reason: 'falta_de_tempo',
    })
  })

  it.each([
    ['2026-10-05T18:00', '2026-10-05T21:00:59.123456Z'],
    ['2026-10-05T18:00', '2026-10-05T18:00:59.123456-03:00'],
    ['2019-02-16T23:30', '2019-02-17T02:30:59.123456Z'],
  ])(
    'conserva o ISO original %s / %s quando a hora civil nao mudou',
    async (civil, originalDeadline) => {
      const fetchMock = routeFetch({ [ROTA]: comCode('prazo_inalterado', 409) })
      const { result } = renderReschedule()
      const draft = { ...RASCUNHO, civil, originalDeadline }

      act(() => {
        result.current.reschedule(draft)
      })

      await waitFor(() => {
        expect(result.current.state).toEqual({
          status: 'failed',
          failure: {
            message: 'O novo prazo é igual ao atual. Escolha outro horário.',
            recovery: 'edit',
          },
        })
      })
      expect(requestsTo(fetchMock, ROTA).map(jsonBody)).toEqual([
        {
          operation_id: K1,
          new_deadline: originalDeadline,
          reason: 'falta_de_tempo',
        },
      ])
      expect(result.current.lastRescheduled).toBeNull()
    },
  )

  it('depois de editar a hora civil usa a conversao de minutos, sem conservar segundos antigos', async () => {
    const fetchMock = routeFetch({ [ROTA]: sucesso })
    const { result } = renderReschedule()
    const draft = {
      ...RASCUNHO,
      civil: '2026-10-06T18:00',
      originalDeadline: '2026-10-05T21:00:59.123456Z',
    }
    act(() => {
      result.current.reschedule(draft)
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'rescheduled', mission: reagendada })
    })
    expect(requestsTo(fetchMock, ROTA).map(jsonBody)).toEqual([
      {
        operation_id: K1,
        new_deadline: '2026-10-06T21:00:00.000Z',
        reason: 'falta_de_tempo',
      },
    ])
  })

  it('retry do prazo original conserva a chave e o corpo literal ate a recusa conhecida', async () => {
    const fetchMock = routeFetch({
      [ROTA]: (_, call) =>
        call === 1
          ? Promise.reject(new TypeError('Failed to fetch'))
          : Response.json({ detail: 'x', code: 'prazo_inalterado' }, { status: 409 }),
    })
    const { result } = renderReschedule()
    const draft = { ...RASCUNHO, originalDeadline: '2026-10-05T21:00:59.123456Z' }
    act(() => {
      result.current.reschedule(draft)
    })
    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        status: 'failed',
        failure: { recovery: 'retry' },
      })
    })
    act(() => {
      result.current.reschedule(draft)
    })
    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        status: 'failed',
        failure: { recovery: 'edit' },
      })
    })
    expect(requestsTo(fetchMock, ROTA).map(jsonBody)).toEqual([
      { operation_id: K1, new_deadline: '2026-10-05T21:00:59.123456Z', reason: 'falta_de_tempo' },
      { operation_id: K1, new_deadline: '2026-10-05T21:00:59.123456Z', reason: 'falta_de_tempo' },
    ])
    expect(result.current.lastRescheduled).toBeNull()
  })

  it('depois de uma falha "retry", outro conteudo sai com chave NOVA ja no primeiro envio (pendencia 112)', async () => {
    const fetchMock = routeFetch({
      [ROTA]: (_, call) =>
        call === 1 ? Promise.reject(new TypeError('Failed to fetch')) : Response.json(reagendada),
    })
    const { result } = renderReschedule()
    act(() => {
      result.current.reschedule(RASCUNHO)
    })
    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        status: 'failed',
        failure: { recovery: 'retry' },
      })
    })
    expect(result.current.registry.sentRescheduleFor(7)).toEqual(RASCUNHO)

    act(() => {
      result.current.reschedule({ ...RASCUNHO, reason: 'dificuldade' })
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'rescheduled', mission: reagendada })
    })
    expect(sentKeys(fetchMock)).toEqual([K1, K2])
    expect(result.current.registry.sentRescheduleFor(7)).toBeNull()
  })

  it('o sucesso apaga o reagendamento aberto do registro; a falha o conserva', async () => {
    routeFetch({
      [ROTA]: (_, call) =>
        call === 1
          ? Response.json({ detail: 'x', code: 'prazo_expirado' }, { status: 422 })
          : Response.json(reagendada),
    })
    const { result } = renderReschedule()
    const aberto = { openedFor: '2026-10-02T21:00:00Z', openedAtMs: 0, draft: RASCUNHO }
    result.current.registry.saveRescheduleDraft(7, aberto)
    act(() => {
      result.current.reschedule(RASCUNHO)
    })
    await waitFor(() => {
      expect(result.current.state).toMatchObject({ status: 'failed' })
    })
    expect(result.current.registry.rescheduleDraftFor(7)).toEqual(aberto)

    act(() => {
      result.current.reschedule(RASCUNHO)
    })

    await waitFor(() => {
      expect(result.current.state).toMatchObject({ status: 'rescheduled' })
    })
    expect(result.current.registry.rescheduleDraftFor(7)).toBeNull()
  })

  it('usa o horario de verao historico: o processo esta em Tokyo, o prazo e de Sao Paulo', async () => {
    const fetchMock = routeFetch({ [ROTA]: sucesso })
    const { result } = renderReschedule()

    act(() => {
      result.current.reschedule({ civil: '2018-12-01T12:00', reason: 'dificuldade' })
    })

    await waitFor(() => {
      expect(result.current.state.status).toBe('rescheduled')
    })
    expect(jsonBody(requestsTo(fetchMock, ROTA)[0] as RequestInit)).toEqual({
      operation_id: K1,
      new_deadline: '2018-12-01T14:00:00.000Z',
      reason: 'dificuldade',
    })
  })

  it.each<[string, RescheduleDraft]>([
    ['sem motivo', { civil: '2026-10-05T18:00', reason: null }],
    ['sem data', { civil: '', reason: 'falta_de_tempo' }],
    [
      'com a hora que nao existe em Sao Paulo',
      { civil: '2018-11-04T00:30', reason: 'dificuldade' },
    ],
    ['com a data inexistente', { civil: '2026-02-31T10:00', reason: 'dificuldade' }],
  ])('um rascunho %s nao faz POST, nao gasta chave e nao muda o estado', (_caso, rascunho) => {
    const fetchMock = routeFetch({ [ROTA]: sucesso })
    const { result, reload } = renderReschedule()

    act(() => {
      result.current.reschedule(rascunho)
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(crypto.randomUUID).not.toHaveBeenCalled()
    expect(result.current.state).toEqual({ status: 'idle' })
    // Nem o voo foi contado: a recarga sai na hora.
    act(() => {
      result.current.requestReload()
    })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('um rascunho invalido depois de uma falha deixa a falha como esta', async () => {
    routeFetch({ [ROTA]: comCode('prazo_inalterado', 409) })
    const { result } = renderReschedule()
    act(() => {
      result.current.reschedule(RASCUNHO)
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('failed')
    })
    const antes = result.current.state

    act(() => {
      result.current.reschedule({ civil: '2026-10-05T18:00', reason: null })
    })

    expect(result.current.state).toBe(antes)
  })

  it.each<[string, Route]>([
    ['uma falha de rede', falhaDeRede],
    ['um 500 sem code', () => Response.json({ detail: 'Erro interno.' }, { status: 500 })],
    ['um code desconhecido', comCode('codigo_futuro', 409)],
  ])('depois de %s, a nova tentativa reenvia a MESMA chave', async (_caso, falha) => {
    // Nenhuma dessas respostas diz se o prazo mudou: so a mesma chave, com o
    // mesmo conteudo, torna o reenvio seguro (F13).
    const fetchMock = routeFetch({
      [ROTA]: (init, call) => (call === 1 ? falha(init, call) : sucesso(init, call)),
    })
    const { result } = renderReschedule()

    act(() => {
      result.current.reschedule(RASCUNHO)
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('failed')
    })
    act(() => {
      result.current.reschedule(RASCUNHO)
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'rescheduled', mission: reagendada })
    })
    expect(sentKeys(fetchMock)).toEqual([K1, K1])
  })

  it.each<[string, RescheduleDraft, Route, string]>([
    [
      'prazo_expirado',
      RASCUNHO,
      comCode('prazo_expirado', 422),
      'O novo prazo precisa estar no futuro.',
    ],
    [
      'prazo_inalterado',
      RASCUNHO,
      comCode('prazo_inalterado', 409),
      'O novo prazo é igual ao atual. Escolha outro horário.',
    ],
    [
      'um 422 sem code',
      RASCUNHO,
      () => Response.json({ detail: [] }, { status: 422 }),
      'O novo prazo não foi aceito. Revise a data e o motivo.',
    ],
  ])(
    'depois de %s (edit), a falha chega traduzida e a chave sai',
    async (_caso, rascunho, rota, mensagem) => {
      const fetchMock = routeFetch({
        [ROTA]: (init, call) => (call === 1 ? rota(init, call) : semResposta(init, call)),
      })
      const { result } = renderReschedule()

      act(() => {
        result.current.reschedule(rascunho)
      })
      await waitFor(() => {
        expect(result.current.state).toEqual({
          status: 'failed',
          failure: { message: mensagem, recovery: 'edit' },
        })
      })
      act(() => {
        result.current.reschedule(rascunho)
      })

      expect(sentKeys(fetchMock)).toEqual([K1, K2])
    },
  )

  it.each<[string, Route]>([
    ['o sucesso', sucesso],
    ['transicao_ilegal', comCode('transicao_ilegal', 409)],
    ['prazo_derivado', comCode('prazo_derivado', 409)],
    ['missao_nao_encontrada', comCode('missao_nao_encontrada', 404)],
    ['operacao_reutilizada', comCode('operacao_reutilizada', 409)],
  ])('depois de %s, a chave sai do registro: um novo envio gera outra', async (_caso, rota) => {
    const fetchMock = routeFetch({
      [ROTA]: (init, call) => (call === 1 ? rota(init, call) : semResposta(init, call)),
    })
    const { result } = renderReschedule()

    act(() => {
      result.current.reschedule(RASCUNHO)
    })
    await waitFor(() => {
      expect(result.current.state.status).not.toBe('submitting')
    })
    act(() => {
      result.current.reschedule(RASCUNHO)
    })

    expect(sentKeys(fetchMock)).toEqual([K1, K2])
  })

  it('a chave do Reagendar e outra que a do Concluir e a do Iniciar da mesma missao', () => {
    // A UNIQUE do banco e sobre a chave sozinha (F2): dividir a chave faria a
    // segunda operacao falhar com `operacao_reutilizada`.
    vi.mocked(crypto.randomUUID).mockReset()
    const K3 = '00000000-0000-4000-8000-000000000003'
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce(K1)
      .mockReturnValueOnce(K2)
      .mockReturnValueOnce(K3)
    const fetchMock = routeFetch({
      [ROTA]: semResposta,
      'POST /api/missions/7/start': semResposta,
      'POST /api/missions/7/complete': semResposta,
    })
    const { result } = renderReschedule()

    act(() => {
      result.current.complete()
      result.current.start()
      result.current.reschedule(RASCUNHO)
    })

    expect(sentKeys(fetchMock, 'POST /api/missions/7/complete')).toEqual([K1])
    expect(sentKeys(fetchMock, 'POST /api/missions/7/start')).toEqual([K2])
    expect(sentKeys(fetchMock)).toEqual([K3])
  })

  it('um segundo reschedule() com o primeiro em voo nao faz outro POST', () => {
    const fetchMock = routeFetch({ [ROTA]: semResposta })
    const { result } = renderReschedule()

    act(() => {
      result.current.reschedule(RASCUNHO)
      result.current.reschedule(RASCUNHO)
    })

    expect(requestsTo(fetchMock, ROTA)).toHaveLength(1)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it('se a chave nao pode ser gerada, nada muda: nem estado, nem voo no registro', () => {
    vi.mocked(crypto.randomUUID)
      .mockReset()
      .mockImplementation(() => {
        throw new Error('sem contexto seguro')
      })
    const fetchMock = routeFetch({ [ROTA]: sucesso })
    const { result, reload } = renderReschedule()

    expect(() => {
      act(() => {
        result.current.reschedule(RASCUNHO)
      })
    }).toThrow('sem contexto seguro')

    expect(result.current.state).toEqual({ status: 'idle' })
    expect(fetchMock).not.toHaveBeenCalled()
    act(() => {
      result.current.requestReload()
    })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('avisa o registro do voo: com o POST pendente, a recarga espera; quando ele termina, sai', async () => {
    let responder: (response: Response) => void = () => undefined
    routeFetch({
      [ROTA]: () =>
        new Promise<Response>((resolve) => {
          responder = resolve
        }),
    })
    const { result, reload } = renderReschedule()

    act(() => {
      result.current.reschedule(RASCUNHO)
      result.current.requestReload()
    })
    expect(reload).not.toHaveBeenCalled()

    await act(async () => {
      responder(Response.json(reagendada))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1)
    })
  })

  it('avisa o fim do voo tambem quando o POST falha', async () => {
    routeFetch({ [ROTA]: falhaDeRede })
    const { result, reload } = renderReschedule()

    act(() => {
      result.current.reschedule(RASCUNHO)
      result.current.requestReload()
    })
    expect(reload).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1)
    })
  })

  it('lastRescheduled guarda o ultimo SUCESSO, e ele sobrevive ao envio seguinte e a falha dele', async () => {
    const segunda = { ...reagendada, deadline: '2026-10-09T21:00:00Z' }
    routeFetch({
      [ROTA]: (_, call) => {
        if (call === 1) return Response.json(reagendada)
        if (call === 2) return Promise.reject(new TypeError('Failed to fetch'))
        return Response.json(segunda)
      },
    })
    const { result } = renderReschedule()
    expect(result.current.lastRescheduled).toBeNull()

    act(() => {
      result.current.reschedule(RASCUNHO)
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('rescheduled')
    })
    expect(result.current.lastRescheduled).toEqual(reagendada)

    act(() => {
      result.current.reschedule({ civil: '2026-10-09T18:00', reason: 'dificuldade' })
    })
    expect(result.current.state.status).toBe('submitting')
    expect(result.current.lastRescheduled).toEqual(reagendada)
    await waitFor(() => {
      expect(result.current.state.status).toBe('failed')
    })
    expect(result.current.lastRescheduled).toEqual(reagendada)

    act(() => {
      result.current.reschedule({ civil: '2026-10-09T18:00', reason: 'dificuldade' })
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('rescheduled')
    })
    expect(result.current.lastRescheduled).toEqual(segunda)
  })

  it('um Reagendar pendurado falha ao fim do prazo, com a acao de repetir', async () => {
    vi.useFakeTimers()
    routeFetch({ [ROTA]: pendingUntilAborted })
    const { result } = renderReschedule()

    act(() => {
      result.current.reschedule(RASCUNHO)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MUTATION_TIMEOUT_MS - 1)
    })
    expect(result.current.state).toEqual({ status: 'submitting' })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(result.current.state).toMatchObject({
      status: 'failed',
      failure: { recovery: 'retry' },
    })
  })

  it('depois do prazo, o "tentar de novo" reenvia a MESMA chave', async () => {
    // O prazo pode ter mudado no servidor sem que a resposta chegasse: so a
    // mesma chave torna o reenvio seguro (F13).
    vi.useFakeTimers()
    const fetchMock = routeFetch({
      [ROTA]: (init, call) => (call === 1 ? pendingUntilAborted(init, call) : sucesso(init, call)),
    })
    const { result } = renderReschedule()

    act(() => {
      result.current.reschedule(RASCUNHO)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MUTATION_TIMEOUT_MS)
    })
    act(() => {
      result.current.reschedule(RASCUNHO)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.state).toEqual({ status: 'rescheduled', mission: reagendada })
    expect(sentKeys(fetchMock)).toEqual([K1, K1])
  })
})
