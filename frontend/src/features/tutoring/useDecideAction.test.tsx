import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonBody, requestsTo, routeFetch, type Route } from '../../test/fetchRoutes'
import type { ActionRead } from './types'
import { useActionKeys } from './useActionKeys'
import { useDecideAction } from './useDecideAction'

const CONFIRM = 'POST /api/tutoring/actions/5/confirm'
const REJECT = 'POST /api/tutoring/actions/5/reject'

// Chaves fixas, na ordem em que `crypto.randomUUID` as devolve: o teste diz
// QUAL chave saiu em cada POST, e nao so "uma chave qualquer".
const K1 = '00000000-0000-4000-8000-000000000001'
const K2 = '00000000-0000-4000-8000-000000000002'
const K3 = '00000000-0000-4000-8000-000000000003'

const proposta = (id: number): ActionRead => ({
  id,
  kind: 'create_mission',
  state: 'proposta',
  payload: {
    instructions: 'Estudar grafos por 40 minutos',
    completion_criterion: 'Resumo de uma pagina',
    difficulty: 2,
    estimated_minutes: 40,
    deadline: '2027-02-15T21:00:00-03:00',
  },
  mission_id: null,
  error_code: null,
})

const executada: ActionRead = { ...proposta(5), state: 'executada', mission_id: 40 }
const recusada: ActionRead = { ...proposta(5), state: 'recusada' }

const confirmed: Route = () =>
  Response.json({ action: executada, mission: { id: 40, instructions: 'Estudar grafos' } })
const networkFailure: Route = () => Promise.reject(new TypeError('Failed to fetch'))
const withCode =
  (status: number, code: string): Route =>
  () =>
    Response.json({ detail: 'x', code }, { status })
/** Uma rota que nunca responde: o POST fica em voo. */
const PENDING: Route = () => new Promise<Response>(() => undefined)

/** Uma rota que responde, pela ordem das chamadas, com cada rota da lista. */
function inSequence(...routes: Route[]): Route {
  return (init, call) => routes[call - 1]!(init, call)
}

function mount() {
  const changed = vi.fn()
  const missionCreated = vi.fn()
  const hook = renderHook(() => {
    const keys = useActionKeys()
    return { keys, decision: useDecideAction(proposta(5), keys, { changed, missionCreated }) }
  })
  return { changed, missionCreated, result: hook.result }
}

function sentKeys(fetchMock: ReturnType<typeof routeFetch>): unknown[] {
  return requestsTo(fetchMock, CONFIRM).map((init) => jsonBody(init))
}

describe('useDecideAction', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(K1)
      .mockReturnValueOnce(K2)
      .mockReturnValueOnce(K3)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('D1 confirmar manda a chave, e o sucesso avisa a acao nova e a missao criada', async () => {
    const fetchMock = routeFetch({ [CONFIRM]: confirmed })
    const { changed, missionCreated, result } = mount()

    act(() => {
      result.current.decision.confirm()
    })

    await waitFor(() => {
      expect(missionCreated).toHaveBeenCalledTimes(1)
    })
    expect(sentKeys(fetchMock)).toEqual([{ operation_id: K1 }])
    expect(changed).toHaveBeenCalledExactlyOnceWith(executada)
    expect(result.current.decision.state).toEqual({ status: 'idle' })
  })

  it('D2 a falha de rede mantem a chave para o reenvio', async () => {
    const fetchMock = routeFetch({ [CONFIRM]: inSequence(networkFailure, confirmed) })
    const { changed, missionCreated, result } = mount()

    act(() => {
      result.current.decision.confirm()
    })
    await waitFor(() => {
      expect(result.current.decision.state.status).toBe('failed')
    })
    expect(result.current.decision.state).toEqual({
      status: 'failed',
      failure: {
        message:
          'Não foi possível confirmar a missão. Tentar de novo é seguro: a missão não será criada duas vezes.',
        recovery: 'retry',
      },
      attempted: 'confirm',
    })
    expect(missionCreated).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()

    act(() => {
      result.current.decision.confirm()
    })
    await waitFor(() => {
      expect(missionCreated).toHaveBeenCalledTimes(1)
    })
    // A MESMA chave: a primeira confirmacao pode ter criado a missao, e o
    // backend so reconhece o reenvio pela chave.
    expect(sentKeys(fetchMock)).toEqual([{ operation_id: K1 }, { operation_id: K1 }])
  })

  it('D3 operacao_reutilizada troca a chave', async () => {
    const fetchMock = routeFetch({
      [CONFIRM]: inSequence(withCode(409, 'operacao_reutilizada'), confirmed),
    })
    const { missionCreated, result } = mount()

    act(() => {
      result.current.decision.confirm()
    })
    await waitFor(() => {
      expect(result.current.decision.state.status).toBe('failed')
    })
    expect(result.current.decision.state).toMatchObject({
      failure: { recovery: 'retry-with-new-operation' },
      attempted: 'confirm',
    })

    act(() => {
      result.current.decision.confirm()
    })
    await waitFor(() => {
      expect(missionCreated).toHaveBeenCalledTimes(1)
    })
    expect(sentKeys(fetchMock)).toEqual([{ operation_id: K1 }, { operation_id: K2 }])
  })

  it('D4 prazo_expirado marca a acao como falhou, como o servidor gravou', async () => {
    const fetchMock = routeFetch({ [CONFIRM]: withCode(422, 'prazo_expirado') })
    const { changed, missionCreated, result } = mount()

    act(() => {
      result.current.decision.confirm()
    })
    await waitFor(() => {
      expect(result.current.decision.state.status).toBe('failed')
    })

    expect(changed).toHaveBeenCalledExactlyOnceWith({
      ...proposta(5),
      state: 'falhou',
      error_code: 'prazo_expirado',
    })
    expect(missionCreated).not.toHaveBeenCalled()
    expect(result.current.decision.state).toMatchObject({
      failure: { recovery: 'expired' },
      attempted: 'confirm',
    })
    // Sem outra ida a rede: o 422 ja diz o que o servidor gravou.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['transicao_ilegal', 'acao_nao_encontrada'])(
    'D5 %s pede atualizar a conversa, e solta a chave',
    async (code) => {
      routeFetch({ [CONFIRM]: withCode(code === 'transicao_ilegal' ? 409 : 404, code) })
      const { changed, missionCreated, result } = mount()

      act(() => {
        result.current.decision.confirm()
      })
      await waitFor(() => {
        expect(result.current.decision.state.status).toBe('failed')
      })

      expect(result.current.decision.state).toMatchObject({
        failure: { recovery: 'refresh' },
        attempted: 'confirm',
      })
      expect(result.current.keys.operationIdFor(5)).toBe(K2)
      expect(changed).not.toHaveBeenCalled()
      expect(missionCreated).not.toHaveBeenCalled()
    },
  )

  it('D6 recusar manda o POST sem chave e avisa a acao recusada', async () => {
    const fetchMock = routeFetch({ [REJECT]: () => Response.json({ action: recusada }) })
    const { changed, missionCreated, result } = mount()

    act(() => {
      result.current.decision.reject()
    })
    await waitFor(() => {
      expect(changed).toHaveBeenCalledExactlyOnceWith(recusada)
    })

    expect(requestsTo(fetchMock, REJECT).map((init) => jsonBody(init))).toEqual([{}])
    expect(missionCreated).not.toHaveBeenCalled()
    expect(result.current.decision.state).toEqual({ status: 'idle' })
    // Recusar nao gasta chave nenhuma.
    expect(crypto.randomUUID).not.toHaveBeenCalled()
  })

  it('D7 a falha ao recusar oferece repetir', async () => {
    routeFetch({ [REJECT]: networkFailure })
    const { changed, result } = mount()

    act(() => {
      result.current.decision.reject()
    })
    await waitFor(() => {
      expect(result.current.decision.state.status).toBe('failed')
    })

    expect(result.current.decision.state).toEqual({
      status: 'failed',
      failure: {
        message: 'Não foi possível recusar a proposta. Tentar de novo é seguro.',
        recovery: 'retry',
      },
      attempted: 'reject',
    })
    expect(changed).not.toHaveBeenCalled()
  })

  it('D8 confirmando e um estado proprio', () => {
    routeFetch({ [CONFIRM]: PENDING })
    const { result } = mount()

    act(() => {
      result.current.decision.confirm()
    })

    expect(result.current.decision.state).toEqual({ status: 'confirming' })
  })

  it('D8 recusando e um estado proprio', () => {
    routeFetch({ [REJECT]: PENDING })
    const { result } = mount()

    act(() => {
      result.current.decision.reject()
    })

    expect(result.current.decision.state).toEqual({ status: 'rejecting' })
  })

  it('D9 o sucesso solta a chave', async () => {
    routeFetch({ [CONFIRM]: confirmed })
    const { missionCreated, result } = mount()

    act(() => {
      result.current.decision.confirm()
    })
    await waitFor(() => {
      expect(missionCreated).toHaveBeenCalledTimes(1)
    })

    // O registro nao cresce sem limite, como no A: a acao decidida sai dele.
    expect(result.current.keys.operationIdFor(5)).toBe(K2)
  })
})
