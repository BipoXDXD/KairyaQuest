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
import { useCompleteMission } from './useCompleteMission'
import { useCompletionRegistry } from './useCompletionRegistry'
import { useStartMission } from './useStartMission'

const ROTA = 'POST /api/missions/7/start'

const iniciada: Mission = {
  id: 7,
  instructions: 'Ler o capitulo 3 de algoritmos',
  completion_criterion: 'Resumo de uma pagina entregue',
  difficulty: 3,
  estimated_minutes: 45,
  mission_type: 'avulsa',
  day: null,
  deadline: '2026-09-20T13:00:00Z',
  state: 'em_andamento',
  availability: 'disponivel',
  started_at: '2026-09-18T15:00:00Z',
  completed_at: null,
  xp: 100,
  actual_duration_minutes: null,
  verification: null,
  evidence: null,
  evaluation: null,
  reschedules: [],
}

// Chaves fixas, na ordem em que `crypto.randomUUID` as devolve: o teste diz
// QUAL chave saiu em cada tentativa, e nao so "uma chave qualquer".
const K1 = '00000000-0000-4000-8000-000000000001'
const K2 = '00000000-0000-4000-8000-000000000002'

const sucesso: Route = () => Response.json(iniciada)
const falhaDeRede: Route = () => Promise.reject(new TypeError('Failed to fetch'))
const semResposta: Route = () =>
  new Promise<Response>(() => {
    // Nunca resolve: e assim que o estado de envio fica observavel.
  })

function comCode(code: string, status: number): Route {
  return () => Response.json({ detail: 'x', code }, { status })
}

/** O hook como o quadro o usa: com o registro de verdade, e nao com um falso. */
function renderStart(onStarted?: () => void) {
  const reload = vi.fn()
  const rendered = renderHook(() => {
    const { registry, reload: requestReload } = useCompletionRegistry(reload)
    return {
      ...useStartMission(7, registry, onStarted),
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

describe('useStartMission', () => {
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

    const { result } = renderStart()

    expect(result.current.state).toEqual({ status: 'idle' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(crypto.randomUUID).not.toHaveBeenCalled()
  })

  it('fica em submitting enquanto a resposta nao chega', () => {
    routeFetch({ [ROTA]: semResposta })
    const { result } = renderStart()

    act(() => {
      result.current.start()
    })

    expect(result.current.state).toEqual({ status: 'submitting' })
  })

  it('inicia pelo POST da missao e chega em started com a missao que a API devolveu', async () => {
    const fetchMock = routeFetch({ [ROTA]: sucesso })
    const { result } = renderStart()

    act(() => {
      result.current.start()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'started', mission: iniciada })
    })
    expect(requestsTo(fetchMock, ROTA)).toHaveLength(1)
    // Byte a byte: o corpo do Iniciar e SO a chave.
    expect(requestsTo(fetchMock, ROTA)[0]?.body).toBe(JSON.stringify({ operation_id: K1 }))
  })

  it.each<[string, Route]>([
    ['uma falha de rede', falhaDeRede],
    ['um 500 sem code', () => Response.json({ detail: 'Erro interno.' }, { status: 500 })],
    ['um code desconhecido', comCode('codigo_futuro', 409)],
  ])('depois de %s, a nova tentativa reenvia a MESMA chave', async (_caso, falha) => {
    // Nenhuma dessas respostas diz se o servidor iniciou: so a mesma chave
    // torna o reenvio seguro (F2).
    const fetchMock = routeFetch({
      [ROTA]: (init, call) => (call === 1 ? falha(init, call) : sucesso(init, call)),
    })
    const { result } = renderStart()

    act(() => {
      result.current.start()
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('failed')
    })
    act(() => {
      result.current.start()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'started', mission: iniciada })
    })
    expect(sentKeys(fetchMock)).toEqual([K1, K1])
  })

  it('a falha chega traduzida, com a mensagem e a acao, e nunca o erro cru', async () => {
    routeFetch({ [ROTA]: comCode('transicao_ilegal', 409) })
    const { result } = renderStart()

    act(() => {
      result.current.start()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'failed',
        failure: {
          message: 'Esta missão já foi iniciada ou concluída. Atualize para ver o estado atual.',
          recovery: 'refresh',
        },
      })
    })
  })

  it.each<[string, Route]>([
    ['o sucesso', sucesso],
    ['transicao_ilegal', comCode('transicao_ilegal', 409)],
    ['missao_expirada', comCode('missao_expirada', 409)],
    ['missao_nao_encontrada', comCode('missao_nao_encontrada', 404)],
    ['operacao_reutilizada', comCode('operacao_reutilizada', 409)],
  ])('depois de %s, a chave sai do registro: um novo envio gera outra', async (_caso, rota) => {
    const fetchMock = routeFetch({
      [ROTA]: (init, call) => (call === 1 ? rota(init, call) : semResposta(init, call)),
    })
    const { result } = renderStart()

    act(() => {
      result.current.start()
    })
    await waitFor(() => {
      expect(result.current.state.status).not.toBe('submitting')
    })
    act(() => {
      result.current.start()
    })

    expect(sentKeys(fetchMock)).toEqual([K1, K2])
  })

  it('a chave do Iniciar e outra que a do Concluir da mesma missao', async () => {
    // A UNIQUE do banco e sobre a chave: dividir a chave faria o Concluir
    // falhar com `operacao_reutilizada` depois de um Iniciar (F20).
    const fetchMock = routeFetch({
      [ROTA]: semResposta,
      'POST /api/missions/7/complete': semResposta,
    })
    const { result } = renderStart()

    act(() => {
      result.current.complete()
      result.current.start()
    })

    expect(sentKeys(fetchMock, 'POST /api/missions/7/complete')).toEqual([K1])
    expect(sentKeys(fetchMock)).toEqual([K2])
  })

  it('um segundo start() com o primeiro em voo nao faz outro POST', () => {
    const fetchMock = routeFetch({ [ROTA]: semResposta })
    const { result } = renderStart()

    act(() => {
      result.current.start()
      result.current.start()
    })

    expect(requestsTo(fetchMock, ROTA)).toHaveLength(1)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it('terminado o voo, o start() volta a poder enviar', async () => {
    const fetchMock = routeFetch({
      [ROTA]: (init, call) => (call === 1 ? falhaDeRede(init, call) : sucesso(init, call)),
    })
    const { result } = renderStart()
    act(() => {
      result.current.start()
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('failed')
    })

    act(() => {
      result.current.start()
    })

    await waitFor(() => {
      expect(result.current.state.status).toBe('started')
    })
    expect(requestsTo(fetchMock, ROTA)).toHaveLength(2)
  })

  it('se a chave nao pode ser gerada, nada muda: nem estado, nem voo no registro', () => {
    // `crypto.randomUUID` lanca em contexto inseguro. A chave vem ANTES de
    // qualquer mudanca: com a ordem inversa, o contador do registro ficaria
    // preso em 1 e a recarga esperaria para sempre.
    vi.mocked(crypto.randomUUID)
      .mockReset()
      .mockImplementation(() => {
        throw new Error('sem contexto seguro')
      })
    const fetchMock = routeFetch({ [ROTA]: sucesso })
    const { result, reload } = renderStart()

    expect(() => {
      act(() => {
        result.current.start()
      })
    }).toThrow('sem contexto seguro')

    expect(result.current.state).toEqual({ status: 'idle' })
    expect(fetchMock).not.toHaveBeenCalled()
    act(() => {
      result.current.requestReload()
    })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('chama onStarted depois do sucesso, e nao na falha', async () => {
    const onStarted = vi.fn()
    routeFetch({ [ROTA]: sucesso })
    const { result } = renderStart(onStarted)

    act(() => {
      result.current.start()
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('started')
    })
    expect(onStarted).toHaveBeenCalledTimes(1)

    onStarted.mockClear()
    routeFetch({ [ROTA]: comCode('transicao_ilegal', 409) })
    const { result: resultFalha } = renderStart(onStarted)
    act(() => {
      resultFalha.current.start()
    })
    await waitFor(() => {
      expect(resultFalha.current.state.status).toBe('failed')
    })
    expect(onStarted).not.toHaveBeenCalled()
  })

  it('um onStarted que lanca nao vira falha: o inicio ja aconteceu no servidor', async () => {
    const erro = new Error('secao quebrou')
    const onStarted = vi.fn(() => {
      throw erro
    })
    const registrar = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    routeFetch({ [ROTA]: sucesso })
    const { result } = renderStart(onStarted)

    act(() => {
      result.current.start()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'started', mission: iniciada })
    })
    expect(registrar).toHaveBeenCalledWith(expect.any(String), erro)
  })

  it('avisa o registro do voo: com o POST pendente, a recarga espera; quando ele termina, sai', async () => {
    let responder: (response: Response) => void = () => undefined
    routeFetch({
      [ROTA]: () =>
        new Promise<Response>((resolve) => {
          responder = resolve
        }),
    })
    const { result, reload } = renderStart()

    act(() => {
      result.current.start()
      result.current.requestReload()
    })
    expect(reload).not.toHaveBeenCalled()

    await act(async () => {
      responder(Response.json(iniciada))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1)
    })
  })

  it('avisa o fim do voo tambem quando o POST falha', async () => {
    routeFetch({ [ROTA]: falhaDeRede })
    const { result, reload } = renderStart()

    act(() => {
      result.current.start()
      result.current.requestReload()
    })
    expect(reload).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1)
    })
  })
  it('um Iniciar pendurado falha ao fim do prazo, solta o cartao e a espera do quadro', async () => {
    vi.useFakeTimers()
    routeFetch({ [ROTA]: pendingUntilAborted })
    const { result, reload } = renderStart()

    act(() => {
      result.current.start()
    })
    act(() => {
      result.current.requestReload()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MUTATION_TIMEOUT_MS - 1)
    })
    // Antes do prazo nada muda: o Iniciar continua em voo e o quadro espera.
    expect(result.current.state).toEqual({ status: 'submitting' })
    expect(reload).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(result.current.state).toMatchObject({
      status: 'failed',
      failure: { recovery: 'retry' },
    })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('depois do prazo, o "tentar de novo" reenvia a MESMA chave', async () => {
    // O servidor pode ter iniciado a missao sem que a resposta chegasse: so a
    // mesma chave torna o reenvio seguro (F2).
    vi.useFakeTimers()
    const fetchMock = routeFetch({
      [ROTA]: (init, call) => (call === 1 ? pendingUntilAborted(init, call) : sucesso(init, call)),
    })
    const { result } = renderStart()

    act(() => {
      result.current.start()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MUTATION_TIMEOUT_MS)
    })
    act(() => {
      result.current.start()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.state).toEqual({ status: 'started', mission: iniciada })
    expect(sentKeys(fetchMock)).toEqual([K1, K1])
  })
})
