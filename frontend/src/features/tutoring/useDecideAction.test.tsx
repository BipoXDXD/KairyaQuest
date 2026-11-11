import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MUTATION_TIMEOUT_MS } from '../../shared/api/client'
import {
  jsonBody,
  pendingUntilAborted,
  requestsTo,
  routeFetch,
  type Route,
} from '../../test/fetchRoutes'
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
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('D1 confirmar manda a chave, e o sucesso avisa a acao nova e a missao criada', async () => {
    const fetchMock = routeFetch({ [CONFIRM]: confirmed })
    const { changed, missionCreated, result } = mount()

    act(() => {
      result.current.decision.confirm()
    })

    // O estado entra no `waitFor`: o `then` do hook chama os callbacks fora de
    // `act`, e o render com `idle` pode chegar depois deles.
    await waitFor(() => {
      expect(result.current.decision.state).toEqual({ status: 'idle' })
    })
    expect(missionCreated).toHaveBeenCalledTimes(1)
    expect(sentKeys(fetchMock)).toEqual([{ operation_id: K1 }])
    expect(changed).toHaveBeenCalledExactlyOnceWith(executada)
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
          'Não foi possível confirmar a missão: sem conexão com o servidor. Tentar de novo é seguro: a missão não será criada duas vezes.',
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

  it.each(['estimativa_fora_do_limite', 'prazo_fora_do_limite'])(
    'D4 %s marca a acao como falhou com esse code, como o servidor gravou, e solta a chave',
    async (code) => {
      const fetchMock = routeFetch({ [CONFIRM]: withCode(422, code) })
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
        error_code: code,
      })
      expect(missionCreated).not.toHaveBeenCalled()
      expect(result.current.decision.state).toMatchObject({
        failure: { recovery: 'out-of-bounds' },
        attempted: 'confirm',
      })
      expect(result.current.keys.operationIdFor(5)).toBe(K2)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

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
    // O estado entra no `waitFor` pelo mesmo motivo do D1.
    await waitFor(() => {
      expect(result.current.decision.state).toEqual({ status: 'idle' })
    })
    expect(changed).toHaveBeenCalledExactlyOnceWith(recusada)
    expect(requestsTo(fetchMock, REJECT).map((init) => jsonBody(init))).toEqual([{}])
    expect(missionCreated).not.toHaveBeenCalled()
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
        message:
          'Não foi possível recusar a proposta: sem conexão com o servidor. Tentar de novo é seguro.',
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

  it('D10 reagendamento_invalido marca a acao como falhou com esse code, e solta a chave', async () => {
    const fetchMock = routeFetch({ [CONFIRM]: withCode(409, 'reagendamento_invalido') })
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
      error_code: 'reagendamento_invalido',
    })
    expect(missionCreated).not.toHaveBeenCalled()
    expect(result.current.decision.state).toMatchObject({
      failure: { recovery: 'invalidated' },
      attempted: 'confirm',
    })
    expect(result.current.keys.operationIdFor(5)).toBe(K2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('D11 uma confirmacao pendurada falha ao fim do prazo e o reenvio usa a MESMA chave', async () => {
    // A confirmacao pode ter executado no servidor sem que a resposta chegasse.
    vi.useFakeTimers()
    const fetchMock = routeFetch({
      [CONFIRM]: (init, call) =>
        call === 1 ? pendingUntilAborted(init, call) : confirmed(init, call),
    })
    const { changed, missionCreated, result } = mount()

    act(() => {
      result.current.decision.confirm()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MUTATION_TIMEOUT_MS - 1)
    })
    expect(result.current.decision.state).toEqual({ status: 'confirming' })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(result.current.decision.state).toMatchObject({
      status: 'failed',
      failure: { recovery: 'retry' },
      attempted: 'confirm',
    })
    expect(missionCreated).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()

    act(() => {
      result.current.decision.confirm()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(missionCreated).toHaveBeenCalledTimes(1)
    expect(sentKeys(fetchMock)).toEqual([{ operation_id: K1 }, { operation_id: K1 }])
  })

  it('D12 uma recusa pendurada falha ao fim do prazo e oferece repetir', async () => {
    vi.useFakeTimers()
    routeFetch({ [REJECT]: pendingUntilAborted })
    const { changed, result } = mount()

    act(() => {
      result.current.decision.reject()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MUTATION_TIMEOUT_MS - 1)
    })
    expect(result.current.decision.state).toEqual({ status: 'rejecting' })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(result.current.decision.state).toMatchObject({
      status: 'failed',
      failure: { recovery: 'retry' },
      attempted: 'reject',
    })
    expect(changed).not.toHaveBeenCalled()
  })
})

describe('useDecideAction — uma decisao em voo por instancia', () => {
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

  it.each([
    ['confirm', 'confirm'],
    ['reject', 'reject'],
    ['confirm', 'reject'],
    ['reject', 'confirm'],
  ] as const)(
    '%s seguido de %s no mesmo tick envia somente a primeira decisao',
    async (primeira, segunda) => {
      let responder: (response: Response) => void = () => undefined
      const pendente = new Promise<Response>((resolve) => {
        responder = resolve
      })
      const fetchMock = routeFetch({ [CONFIRM]: () => pendente, [REJECT]: () => pendente })
      const { changed, missionCreated, result } = mount()
      act(() => {
        result.current.decision[primeira]()
        result.current.decision[segunda]()
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result.current.decision.state).toEqual({
        status: primeira === 'confirm' ? 'confirming' : 'rejecting',
      })
      expect(sentKeys(fetchMock)).toEqual(primeira === 'confirm' ? [{ operation_id: K1 }] : [])
      expect(requestsTo(fetchMock, REJECT).map((init) => jsonBody(init))).toEqual(
        primeira === 'reject' ? [{}] : [],
      )
      const acao = primeira === 'confirm' ? executada : recusada
      await act(async () => {
        responder(Response.json({ action: acao, mission: { id: 40 } }))
      })
      expect(result.current.decision.state).toEqual({ status: 'idle' })
      expect(changed).toHaveBeenCalledExactlyOnceWith(acao)
      expect(missionCreated).toHaveBeenCalledTimes(primeira === 'confirm' ? 1 : 0)
      expect(crypto.randomUUID).toHaveBeenCalledTimes(primeira === 'confirm' ? 1 : 0)
    },
  )

  it('UUID que lanca preserva idle e permite confirmar na proxima tentativa', async () => {
    vi.mocked(crypto.randomUUID)
      .mockReset()
      .mockImplementationOnce(() => {
        throw new Error('UUID indisponivel')
      })
      .mockReturnValueOnce(K1)
    const fetchMock = routeFetch({ [CONFIRM]: confirmed })
    const { changed, missionCreated, result } = mount()
    act(() => {
      expect(() => result.current.decision.confirm()).toThrow('UUID indisponivel')
    })
    expect(result.current.decision.state).toEqual({ status: 'idle' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
    expect(missionCreated).not.toHaveBeenCalled()
    act(() => {
      result.current.decision.confirm()
    })
    // O estado entra no `waitFor` pelo mesmo motivo do D1.
    await waitFor(() => {
      expect(result.current.decision.state).toEqual({ status: 'idle' })
    })
    expect(changed).toHaveBeenCalledExactlyOnceWith(executada)
    expect(sentKeys(fetchMock)).toEqual([{ operation_id: K1 }])
    expect(missionCreated).toHaveBeenCalledTimes(1)
  })

  it.each(['confirm', 'reject'] as const)(
    'apos falha ao recusar, libera uma nova decisao %s',
    async (proxima) => {
      let falhar: (error: Error) => void = () => undefined
      const pendente = new Promise<Response>((_resolve, reject) => {
        falhar = reject
      })
      const fetchMock = routeFetch({
        [REJECT]: inSequence(
          () => pendente,
          () => Response.json({ action: recusada }),
        ),
        [CONFIRM]: confirmed,
      })
      const { changed, missionCreated, result } = mount()
      act(() => {
        result.current.decision.reject()
      })
      await act(async () => {
        falhar(new TypeError('Failed to fetch'))
      })
      expect(result.current.decision.state).toMatchObject({
        status: 'failed',
        attempted: 'reject',
        failure: { recovery: 'retry' },
      })
      expect(changed).not.toHaveBeenCalled()
      act(() => {
        result.current.decision[proxima]()
      })
      const acao = proxima === 'confirm' ? executada : recusada
      await waitFor(() => {
        expect(changed).toHaveBeenCalledExactlyOnceWith(acao)
      })
      expect(result.current.decision.state).toEqual({ status: 'idle' })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(sentKeys(fetchMock)).toEqual(proxima === 'confirm' ? [{ operation_id: K1 }] : [])
      expect(missionCreated).toHaveBeenCalledTimes(proxima === 'confirm' ? 1 : 0)
    },
  )

  it('callbacks capturados e novos apos rerender compartilham a guarda ativa', async () => {
    let responder: (response: Response) => void = () => undefined
    const pendente = new Promise<Response>((resolve) => {
      responder = resolve
    })
    const fetchMock = routeFetch({ [CONFIRM]: () => pendente, [REJECT]: PENDING })
    const antigo = { changed: vi.fn(), missionCreated: vi.fn() }
    const novo = { changed: vi.fn(), missionCreated: vi.fn() }
    const { result, rerender } = renderHook(
      ({ action, on }) => {
        const keys = useActionKeys()
        return useDecideAction(action, keys, on)
      },
      { initialProps: { action: proposta(5), on: antigo } },
    )
    const confirmarCapturado = result.current.confirm
    const recusarCapturado = result.current.reject
    act(() => {
      confirmarCapturado()
    })
    rerender({ action: proposta(5), on: novo })
    act(() => {
      confirmarCapturado()
      recusarCapturado()
      result.current.confirm()
      result.current.reject()
    })
    expect(sentKeys(fetchMock)).toEqual([{ operation_id: K1 }])
    expect(requestsTo(fetchMock, REJECT)).toEqual([])
    await act(async () => {
      responder(Response.json({ action: executada, mission: { id: 40 } }))
    })
    expect(result.current.state).toEqual({ status: 'idle' })
    expect(antigo.changed).toHaveBeenCalledExactlyOnceWith(executada)
    expect(antigo.missionCreated).toHaveBeenCalledTimes(1)
    expect(novo.changed).not.toHaveBeenCalled()
    expect(novo.missionCreated).not.toHaveBeenCalled()
  })

  it.each(['confirm', 'reject'] as const)(
    'mantem a guarda durante changed de %s',
    async (primeira) => {
      let responder: (response: Response) => void = () => undefined
      const pendente = new Promise<Response>((resolve) => {
        responder = resolve
      })
      const fetchMock = routeFetch({ [CONFIRM]: () => pendente, [REJECT]: () => pendente })
      let tentarOutra: () => void = () => undefined
      const changed = vi.fn(() => {
        tentarOutra()
      })
      const missionCreated = vi.fn(() => {
        tentarOutra()
      })
      const { result } = renderHook(() => {
        const keys = useActionKeys()
        return useDecideAction(proposta(5), keys, { changed, missionCreated })
      })
      tentarOutra = primeira === 'confirm' ? result.current.reject : result.current.confirm
      act(() => {
        result.current[primeira]()
      })
      const acao = primeira === 'confirm' ? executada : recusada
      await act(async () => {
        responder(Response.json({ action: acao, mission: { id: 40 } }))
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result.current.state).toEqual({ status: 'idle' })
      expect(changed).toHaveBeenCalledExactlyOnceWith(acao)
      expect(missionCreated).toHaveBeenCalledTimes(primeira === 'confirm' ? 1 : 0)
    },
  )

  it('duas instancias podem confirmar independentemente', () => {
    const fetchMock = routeFetch({ [CONFIRM]: PENDING })
    const primeira = mount()
    const segunda = mount()
    act(() => {
      primeira.result.current.decision.confirm()
      segunda.result.current.decision.confirm()
    })
    expect(sentKeys(fetchMock)).toEqual([{ operation_id: K1 }, { operation_id: K2 }])
    expect(primeira.result.current.decision.state).toEqual({ status: 'confirming' })
    expect(segunda.result.current.decision.state).toEqual({ status: 'confirming' })
  })
})
