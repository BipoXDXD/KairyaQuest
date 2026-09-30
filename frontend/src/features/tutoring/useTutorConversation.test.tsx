import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonBody, requestsTo, routeFetch, type Route } from '../../test/fetchRoutes'
import { controlledStream, sseFrame, streamResponse } from '../../test/sse'
import type { ActionRead, MessageRead } from './types'
import { useTutorConversation } from './useTutorConversation'

const HISTORY = 'GET /api/tutoring/messages'
const SEND = 'POST /api/tutoring/messages'

const question = (id: number, content: string, cmid: string): MessageRead => ({
  id,
  role: 'user',
  content,
  status: 'completa',
  client_message_id: cmid,
  reply_to_id: null,
  error_code: null,
  created_at: '2026-09-22T12:00:00Z',
  actions: [],
})

const answer = (
  id: number,
  replyTo: number,
  content: string,
  status: MessageRead['status'] = 'completa',
): MessageRead => ({
  id,
  role: 'tutor',
  content,
  status,
  client_message_id: null,
  reply_to_id: replyTo,
  error_code: status === 'falhou' ? 'provedor_indisponivel' : null,
  created_at: '2026-09-22T12:00:01Z',
  actions: [],
})

/** Monta o hook com o historico dado e a rota de envio dada, e espera carregar. */
async function mountWith(history: MessageRead[] | Route, send: Route) {
  // Uma lista fixa, ou uma rota por chamada: a atualizacao silenciosa depois
  // de uma falha e a SEGUNDA chamada do historico, e devolve o que o servidor
  // gravou.
  const historyRoute: Route = Array.isArray(history) ? () => Response.json(history) : history
  const fetchMock = routeFetch({ [HISTORY]: historyRoute, [SEND]: send })
  const hook = renderHook(() => useTutorConversation())
  await waitFor(() => {
    expect(hook.result.current.history.status).toBe('loaded')
  })
  return { ...hook, fetchMock }
}

/** O `client_message_id` e o `content` do n-esimo envio (1, 2, ...). */
function sent(fetchMock: ReturnType<typeof routeFetch>, n: number) {
  return jsonBody(requestsTo(fetchMock, SEND)[n - 1] as RequestInit) as {
    client_message_id: string
    content: string
  }
}

beforeEach(() => {
  let n = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    n += 1
    return `00000000-0000-4000-8000-00000000000${String(n)}` as `${string}-${string}-${string}-${string}-${string}`
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Uma rota de envio que o teste nao espera ver chamada. */
const NO_SEND: Route = () => Promise.reject(new Error('envio inesperado no teste'))

const ID_1 = '00000000-0000-4000-8000-000000000001'
const ID_2 = '00000000-0000-4000-8000-000000000002'

const preStreamError =
  (status: number, code: string): Route =>
  () =>
    Response.json({ code }, { status })

/** Deixa as promessas pendentes (a atualizacao silenciosa, o fim abortado) andarem. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

/**
 * Esvazia a fila de microtarefas sem relogio: uma resposta ja resolvida a mao
 * atravessa o `json()` e o `.then` do hook. Nao espera tempo nenhum -- quem
 * prova que basta e o teste que reprova sem a guarda.
 */
async function flushPromises() {
  await act(async () => {
    for (let n = 0; n < 50; n += 1) {
      await Promise.resolve()
    }
  })
}

describe('useTutorConversation: historico', () => {
  it('carrega o historico e o expoe em messages', async () => {
    const q1 = question(1, 'Oi', 'c1')
    const a1 = answer(2, 1, 'Olá')
    const { result } = await mountWith([q1, a1], NO_SEND)

    expect(result.current.history).toEqual({ status: 'loaded', messages: [q1, a1] })
    expect(result.current.messages).toEqual([q1, a1])
    expect(result.current.send).toEqual({ status: 'idle', answer: null })
    expect(result.current.retryTarget).toBeNull()
  })

  it('o historico que falha vira erro, e reloadHistory recarrega', async () => {
    routeFetch({
      [HISTORY]: (_init, call) =>
        call === 1 ? Response.json({}, { status: 500 }) : Response.json([]),
    })
    const { result } = renderHook(() => useTutorConversation())
    expect(result.current.messages).toEqual([])
    await waitFor(() => {
      expect(result.current.history).toEqual({ status: 'error' })
    })

    act(() => {
      result.current.reloadHistory()
    })
    expect(result.current.history).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.history).toEqual({ status: 'loaded', messages: [] })
    })
  })

  it('desmontar durante o carregamento aborta sem escrever erro', async () => {
    let signal: AbortSignal | undefined
    routeFetch({
      [HISTORY]: (init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    })
    const { unmount } = renderHook(() => useTutorConversation())
    unmount()
    await waitFor(() => {
      expect(signal?.aborted).toBe(true)
    })
    // Que o abort nao vira `error` nao se ve aqui (o React descarta o setState
    // depois do `unmount`): quem diz NAO e o caso do StrictMode, abaixo.
  })

  it('ignora o cancelamento do historico descartado pelo StrictMode', async () => {
    // O StrictMode monta, limpa e remonta o efeito no MESMO componente. A
    // limpeza aborta o primeiro pedido, e a rejeicao do abort chega com o
    // componente vivo -- sem a guarda de `signal.aborted`, ela vira `error`.
    // O segundo pedido fica segurado para o `error` aparecer se escrito.
    let releaseSecond: ((response: Response) => void) | undefined
    routeFetch({
      [HISTORY]: (init, call) =>
        new Promise<Response>((resolve, reject) => {
          if (call === 1) {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          } else {
            releaseSecond = resolve
          }
        }),
    })
    const { result } = renderHook(() => useTutorConversation(), { wrapper: StrictMode })
    await waitFor(() => {
      expect(releaseSecond).toBeDefined()
    })
    await settle()
    expect(result.current.history).toEqual({ status: 'loading' })

    act(() => {
      releaseSecond?.(Response.json([]))
    })
    await waitFor(() => {
      expect(result.current.history).toEqual({ status: 'loaded', messages: [] })
    })
  })

  it('no StrictMode, o envio sai com o sinal vivo', async () => {
    // O efeito de montagem roda, limpa (abortando) e roda de novo: um
    // controlador criado UMA vez ficaria abortado, e todo envio sairia morto.
    const q10 = question(10, 'Oi', 'x')
    const a11 = answer(11, 10, 'Olá')
    let signal: AbortSignal | null | undefined
    routeFetch({
      [HISTORY]: () => Response.json([]),
      [SEND]: (init) => {
        signal = init?.signal
        return streamResponse([sseFrame('user_message', q10), sseFrame('done', a11)])
      },
    })
    const { result } = renderHook(() => useTutorConversation(), { wrapper: StrictMode })
    await waitFor(() => {
      expect(result.current.history.status).toBe('loaded')
    })

    act(() => {
      result.current.setDraft('Oi')
    })
    act(() => {
      result.current.submit()
    })
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal?.aborted).toBe(false)
    await waitFor(() => {
      expect(result.current.send).toEqual({
        status: 'idle',
        answer: expect.objectContaining({ role: 'tutor' }),
      })
    })
    expect(result.current.messages).toEqual([q10, a11])
  })

  it('com o historico em erro, nao envia', async () => {
    const fetchMock = routeFetch({
      [HISTORY]: () => Response.json({}, { status: 500 }),
      [SEND]: NO_SEND,
    })
    const { result } = renderHook(() => useTutorConversation())
    await waitFor(() => {
      expect(result.current.history).toEqual({ status: 'error' })
    })

    act(() => {
      result.current.setDraft('Oi, Tifa')
    })
    expect(result.current.canSubmit).toBe(false)
    act(() => {
      result.current.submit()
    })
    expect(requestsTo(fetchMock, SEND)).toHaveLength(0)
    expect(result.current.send).toEqual({ status: 'idle', answer: null })
  })
})

describe('useTutorConversation: envio', () => {
  it('enviar manda o id novo e o texto sem espacos nas pontas, e mantem o rascunho', async () => {
    const stream = controlledStream()
    const { result, fetchMock } = await mountWith([], () => stream.response)

    act(() => {
      result.current.setDraft('  Oi, Tifa \n')
    })
    act(() => {
      result.current.submit()
    })

    expect(sent(fetchMock, 1)).toEqual({ client_message_id: ID_1, content: 'Oi, Tifa' })
    expect(result.current.send.status).toBe('sending')
    expect(result.current.draft).toBe('  Oi, Tifa \n')
  })

  it('o user_message limpa o campo e passa a escrevendo', async () => {
    const q1 = question(1, 'Antiga', 'c1')
    const a1 = answer(2, 1, 'Resposta antiga')
    const q10 = question(10, 'Oi, Tifa', 'x')
    const stream = controlledStream()
    const { result } = await mountWith([q1, a1], () => stream.response)

    act(() => {
      result.current.setDraft('Oi, Tifa')
    })
    act(() => {
      result.current.submit()
    })
    stream.push(sseFrame('user_message', q10))

    await waitFor(() => {
      expect(result.current.send.status).toBe('writing')
    })
    expect(result.current.send).toMatchObject({ status: 'writing', question: q10, partial: '' })
    expect(result.current.draft).toBe('')
    // A pergunta em voo aparece depois do historico, ainda fora dele.
    expect(result.current.messages).toEqual([q1, a1, q10])
    expect(result.current.history).toEqual({ status: 'loaded', messages: [q1, a1] })
  })

  it('o user_message nao apaga o que foi digitado depois do envio', async () => {
    const q10 = question(10, 'Oi, Tifa', 'x')
    const stream = controlledStream()
    const { result } = await mountWith([], () => stream.response)

    act(() => {
      result.current.setDraft('Oi, Tifa')
    })
    act(() => {
      result.current.submit()
    })
    act(() => {
      result.current.setDraft('outra pergunta')
    })
    stream.push(sseFrame('user_message', q10))

    await waitFor(() => {
      expect(result.current.send.status).toBe('writing')
    })
    expect(result.current.draft).toBe('outra pergunta')
  })

  it('os delta se acumulam no parcial', async () => {
    const q10 = question(10, 'Oi', 'x')
    const stream = controlledStream()
    const { result } = await mountWith([], () => stream.response)

    act(() => {
      result.current.setDraft('Oi')
    })
    act(() => {
      result.current.submit()
    })
    stream.push(sseFrame('user_message', q10))
    stream.push(sseFrame('delta', { text: 'Bora, ' }))
    stream.push(sseFrame('delta', { text: 'vamos!' }))

    await waitFor(() => {
      expect(result.current.send).toMatchObject({ status: 'writing', partial: 'Bora, vamos!' })
    })
  })

  it('o done volta a idle e poe pergunta e resposta na lista, uma vez cada', async () => {
    const q1 = question(1, 'Antiga', 'c1')
    const a1 = answer(2, 1, 'Resposta antiga')
    const q10 = question(10, 'Oi', 'x')
    const a11 = answer(11, 10, 'Olá!')
    const { result } = await mountWith([q1, a1], () =>
      streamResponse([sseFrame('user_message', q10), sseFrame('done', a11)]),
    )

    act(() => {
      result.current.setDraft('Oi')
    })
    act(() => {
      result.current.submit()
    })

    await waitFor(() => {
      expect(result.current.send).toEqual({ status: 'idle', answer: a11 })
    })
    expect(result.current.messages).toEqual([q1, a1, q10, a11])
    expect(result.current.messages.filter((m) => m.id === 10)).toHaveLength(1)
  })

  it('o done de pergunta ja respondida nao duplica nada', async () => {
    const q10 = question(10, 'Me explica recursão', 'x')
    const a11 = answer(11, 10, 'Inteira')
    const { result, fetchMock } = await mountWith(
      // O servidor tinha terminado a resposta: a recarga ja a traz.
      (_init, call) => Response.json(call === 1 ? [] : [q10, a11]),
      (_init, call) =>
        call === 1
          ? streamResponse([sseFrame('user_message', q10), sseFrame('delta', { text: 'Int' })])
          : // O backend devolve a resposta que JA existe, com o mesmo id.
            streamResponse([sseFrame('user_message', q10), sseFrame('done', a11)]),
    )

    act(() => {
      result.current.setDraft('Me explica recursão')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('unknown')
    })

    act(() => {
      result.current.reloadHistory()
    })
    await waitFor(() => {
      expect(result.current.history).toEqual({ status: 'loaded', messages: [q10, a11] })
    })

    act(() => {
      result.current.retry()
    })
    await waitFor(() => {
      expect(result.current.send).toEqual({
        status: 'idle',
        answer: expect.objectContaining({ role: 'tutor' }),
      })
    })
    expect(result.current.messages).toEqual([q10, a11])
    expect(sent(fetchMock, 2).client_message_id).toBe(sent(fetchMock, 1).client_message_id)
  })

  it('o error no meio mantem o parcial, traduz o code e reenvia com o mesmo id', async () => {
    const q10 = question(10, 'Me explica recursão', 'x')
    const gravada = answer(11, 10, 'Meio', 'falhou')
    const { result, fetchMock } = await mountWith(
      (_init, call) => Response.json(call === 1 ? [] : [q10, gravada]),
      (_init, call) =>
        call === 1
          ? streamResponse([
              sseFrame('user_message', q10),
              sseFrame('delta', { text: 'Meio' }),
              sseFrame('error', { code: 'provedor_indisponivel' }),
            ])
          : streamResponse([
              sseFrame('user_message', q10),
              sseFrame('done', answer(12, 10, 'Inteira')),
            ]),
    )

    act(() => {
      result.current.setDraft('Me explica recursão')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })
    // O parcial entrou na lista, marcado -- e a atualizacao silenciosa trocou a
    // resposta provisoria pela linha que o servidor gravou.
    await waitFor(() => {
      expect(result.current.messages.map((m) => m.id)).toEqual([10, 11])
    })
    expect(result.current.messages[1]).toMatchObject({ status: 'falhou', content: 'Meio' })
    const failed = result.current.send
    expect(failed).toMatchObject({ partial: 'Meio', failure: { recovery: 'retry' } })
    expect(result.current.retryTarget).toEqual({
      clientMessageId: ID_1,
      content: 'Me explica recursão',
    })

    act(() => {
      result.current.retry()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('idle')
    })
    expect(sent(fetchMock, 2)).toEqual(sent(fetchMock, 1))
    // A tentativa que falhou continua na lista, marcada; a nova vem depois.
    expect(result.current.messages.map((m) => [m.id, m.status])).toEqual([
      [10, 'completa'],
      [11, 'falhou'],
      [12, 'completa'],
    ])
  })

  it('a recusa descarta o parcial: a resposta provisoria entra vazia (pendencia 120)', async () => {
    const q10 = question(10, 'Pergunta recusada', 'x')
    const { result } = await mountWith(
      // A atualizacao silenciosa nunca chega: so a resposta provisoria conta.
      (_init, call) => (call === 1 ? Response.json([]) : new Promise<Response>(() => undefined)),
      () =>
        streamResponse([
          sseFrame('user_message', q10),
          sseFrame('delta', { text: 'Comeco recusado' }),
          sseFrame('error', { code: 'resposta_recusada' }),
        ]),
    )

    act(() => {
      result.current.setDraft('Pergunta recusada')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })
    expect(result.current.messages.map((m) => [m.id, m.status, m.content])).toEqual([
      [10, 'completa', 'Pergunta recusada'],
      [-1, 'falhou', ''],
    ])
    expect(result.current.retryTarget).toEqual({
      clientMessageId: ID_1,
      content: 'Pergunta recusada',
    })
  })

  it('o stream que acaba sem final e resultado desconhecido', async () => {
    const q10 = question(10, 'Oi', 'x')
    const { result, fetchMock } = await mountWith(
      (_init, call) => (call === 1 ? Response.json([]) : Response.json({}, { status: 500 })),
      (_init, call) =>
        call === 1
          ? streamResponse([sseFrame('user_message', q10), sseFrame('delta', { text: 'x' })])
          : controlledStream().response,
    )

    act(() => {
      result.current.setDraft('Oi')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('unknown')
    })
    await waitFor(() => {
      expect(requestsTo(fetchMock, HISTORY)).toHaveLength(2)
    })
    await settle()
    expect(result.current.messages.at(-1)).toMatchObject({
      id: -1,
      role: 'tutor',
      status: 'interrompida',
      content: 'x',
      reply_to_id: 10,
    })

    act(() => {
      result.current.retry()
    })
    expect(sent(fetchMock, 2).client_message_id).toBe(ID_1)
  })

  it('a queda no meio depois do user_message e resultado desconhecido', async () => {
    const q10 = question(10, 'Oi', 'x')
    const stream = controlledStream()
    const { result } = await mountWith([], () => stream.response)

    act(() => {
      result.current.setDraft('Oi')
    })
    act(() => {
      result.current.submit()
    })
    stream.push(sseFrame('user_message', q10))
    await waitFor(() => {
      expect(result.current.send.status).toBe('writing')
    })
    stream.fail(new TypeError('network error'))

    await waitFor(() => {
      expect(result.current.send.status).toBe('unknown')
    })
    expect(result.current.send).toMatchObject({ question: q10 })
  })

  it('o 503 antes do stream mantem o texto e marca indisponivel', async () => {
    const { result } = await mountWith([], preStreamError(503, 'provedor_nao_configurado'))

    act(() => {
      result.current.setDraft('Oi, Tifa')
    })
    act(() => {
      result.current.submit()
    })

    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })
    expect(result.current.send).toMatchObject({ failure: { recovery: 'unavailable' } })
    expect(result.current.draft).toBe('Oi, Tifa')
    expect(result.current.retryTarget).toBeNull()
  })

  it('o 409 mensagem_em_andamento mantem o texto e reenvia com o mesmo id', async () => {
    const q10 = question(10, 'Oi, Tifa', 'x')
    const { result, fetchMock } = await mountWith([], (init, call) =>
      call === 1
        ? preStreamError(409, 'mensagem_em_andamento')(init, call)
        : streamResponse([sseFrame('user_message', q10), sseFrame('done', answer(11, 10, 'Olá'))]),
    )

    act(() => {
      result.current.setDraft('Oi, Tifa')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })
    expect(result.current.draft).toBe('Oi, Tifa')

    act(() => {
      result.current.retry()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('idle')
    })
    expect(sent(fetchMock, 2)).toEqual({ client_message_id: ID_1, content: 'Oi, Tifa' })
  })

  it('o 409 operacao_reutilizada reenvia com id novo e o mesmo texto', async () => {
    const stream = controlledStream()
    const { result, fetchMock } = await mountWith([], (init, call) =>
      call === 1 ? preStreamError(409, 'operacao_reutilizada')(init, call) : stream.response,
    )

    act(() => {
      result.current.setDraft('Oi, Tifa')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })

    act(() => {
      result.current.retry()
    })
    expect(sent(fetchMock, 2)).toEqual({ client_message_id: ID_2, content: 'Oi, Tifa' })
  })

  it('enviar de novo o mesmo texto depois de operacao_reutilizada ganha id novo', async () => {
    // O "mesmo texto, mesmo id" (S15) tem uma excecao: o id de uma
    // `operacao_reutilizada` pertence a outro conteudo e seria recusado sempre.
    const stream = controlledStream()
    const { result, fetchMock } = await mountWith([], (init, call) =>
      call === 1 ? preStreamError(409, 'operacao_reutilizada')(init, call) : stream.response,
    )

    act(() => {
      result.current.setDraft('Oi, Tifa')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })

    act(() => {
      result.current.submit()
    })
    expect(sent(fetchMock, 1)).toEqual({ client_message_id: ID_1, content: 'Oi, Tifa' })
    expect(sent(fetchMock, 2)).toEqual({ client_message_id: ID_2, content: 'Oi, Tifa' })
  })

  it('o 422 pede edicao: texto mantido e nada a reenviar', async () => {
    const { result } = await mountWith([], () => Response.json({ detail: [] }, { status: 422 }))

    act(() => {
      result.current.setDraft('Oi, Tifa')
    })
    act(() => {
      result.current.submit()
    })

    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })
    expect(result.current.send).toMatchObject({ failure: { recovery: 'edit' } })
    expect(result.current.retryTarget).toBeNull()
    expect(result.current.draft).toBe('Oi, Tifa')
  })

  it('a rede fora antes do stream e resultado desconhecido, com o texto mantido', async () => {
    const stream = controlledStream()
    const { result, fetchMock } = await mountWith([], (_init, call) =>
      call === 1 ? Promise.reject(new TypeError('Failed to fetch')) : stream.response,
    )

    act(() => {
      result.current.setDraft('Oi, Tifa')
    })
    act(() => {
      result.current.submit()
    })

    await waitFor(() => {
      expect(result.current.send.status).toBe('unknown')
    })
    expect(result.current.send).toMatchObject({ question: null })
    expect(result.current.draft).toBe('Oi, Tifa')

    act(() => {
      result.current.retry()
    })
    expect(sent(fetchMock, 2).client_message_id).toBe(ID_1)
  })

  it('enviar de novo o mesmo texto depois de falha reusa o id; texto editado ganha id novo', async () => {
    const { result, fetchMock } = await mountWith([], preStreamError(409, 'mensagem_em_andamento'))

    act(() => {
      result.current.setDraft('Oi, Tifa')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })

    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })

    act(() => {
      result.current.setDraft('outra')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })

    expect(sent(fetchMock, 2)).toEqual({ client_message_id: ID_1, content: 'Oi, Tifa' })
    expect(sent(fetchMock, 3)).toEqual({ client_message_id: ID_2, content: 'outra' })
  })

  it('nao envia vazio, so espacos, acima do limite, nem com envio em andamento', async () => {
    const stream = controlledStream()
    const { result, fetchMock } = await mountWith([], () => stream.response)

    for (const text of ['', '   ', 'a'.repeat(4001)]) {
      act(() => {
        result.current.setDraft(text)
      })
      expect(result.current.canSubmit).toBe(false)
      act(() => {
        result.current.submit()
      })
    }
    expect(requestsTo(fetchMock, SEND)).toHaveLength(0)

    act(() => {
      result.current.setDraft('ok')
    })
    expect(result.current.canSubmit).toBe(true)
    act(() => {
      result.current.submit()
    })
    expect(requestsTo(fetchMock, SEND)).toHaveLength(1)
    expect(result.current.send.status).toBe('sending')
    expect(result.current.canSubmit).toBe(false)

    act(() => {
      result.current.submit()
    })
    expect(requestsTo(fetchMock, SEND)).toHaveLength(1)
  })

  it('desmontar durante o stream aborta o pedido e nao muda o estado', async () => {
    const q10 = question(10, 'Oi', 'x')
    const stream = controlledStream()
    let signal: AbortSignal | undefined
    const { result, unmount, fetchMock } = await mountWith([], (init) => {
      signal = init?.signal ?? undefined
      // Como o navegador: abortar derruba a leitura do corpo.
      signal?.addEventListener('abort', () => {
        stream.fail(new DOMException('Aborted', 'AbortError'))
      })
      return stream.response
    })

    act(() => {
      result.current.setDraft('Oi')
    })
    act(() => {
      result.current.submit()
    })
    stream.push(sseFrame('user_message', q10))
    await waitFor(() => {
      expect(result.current.send.status).toBe('writing')
    })

    unmount()
    expect(signal?.aborted).toBe(true)
    await settle()
    // Abortar nao e falha: nada de resposta provisoria nem atualizacao
    // silenciosa do historico. (O `send` depois do `unmount` nao diz nada: o
    // React descarta o setState de um componente desmontado, e o
    // `result.current` fica no ultimo render de qualquer jeito. O que diz NAO
    // e a contagem do historico: sem o retorno `aborted`, a queda viraria
    // `unknown` e pediria a atualizacao silenciosa.)
    expect(requestsTo(fetchMock, HISTORY)).toHaveLength(1)
  })

  it('evento de nome desconhecido e ignorado', async () => {
    const q10 = question(10, 'Oi', 'x')
    const a11 = answer(11, 10, 'Olá')
    const { result } = await mountWith([], () =>
      streamResponse([
        sseFrame('user_message', q10),
        sseFrame('evento_novo', {}),
        sseFrame('done', a11),
      ]),
    )

    act(() => {
      result.current.setDraft('Oi')
    })
    act(() => {
      result.current.submit()
    })

    await waitFor(() => {
      expect(result.current.send).toEqual({
        status: 'idle',
        answer: expect.objectContaining({ role: 'tutor' }),
      })
    })
    expect(result.current.messages).toEqual([q10, a11])
  })

  it('delta antes do user_message (fora do contrato) ainda mostra o texto', async () => {
    const a11 = answer(11, 10, 'x')
    const stream = controlledStream()
    const { result } = await mountWith([], () => stream.response)

    act(() => {
      result.current.setDraft('Oi')
    })
    act(() => {
      result.current.submit()
    })
    stream.push(sseFrame('delta', { text: 'x' }))

    await waitFor(() => {
      expect(result.current.send).toMatchObject({ status: 'writing', question: null, partial: 'x' })
    })
    expect(result.current.messages).toEqual([])

    stream.push(sseFrame('done', a11))
    stream.close()
    await waitFor(() => {
      expect(result.current.send).toEqual({
        status: 'idle',
        answer: expect.objectContaining({ role: 'tutor' }),
      })
    })
    expect(result.current.messages).toEqual([a11])
  })

  it('depois de recarregar, a ultima pergunta sem resposta completa pode ser reenviada', async () => {
    const q10 = question(10, 'Me explica recursão', 'cmid-10')
    const stream = controlledStream()
    const { result, fetchMock } = await mountWith(
      [q10, answer(11, 10, 'meio', 'interrompida')],
      () => stream.response,
    )

    expect(result.current.retryTarget).toEqual({
      clientMessageId: 'cmid-10',
      content: 'Me explica recursão',
    })

    act(() => {
      result.current.retry()
    })
    expect(sent(fetchMock, 1)).toEqual({
      client_message_id: 'cmid-10',
      content: 'Me explica recursão',
    })
  })

  it('o done que chega com a conversa recarregando nao se perde nem quebra', async () => {
    const q10 = question(10, 'Oi', 'x')
    const a11 = answer(11, 10, 'Olá')
    const stream = controlledStream()
    let releaseHistory: ((response: Response) => void) | undefined
    const { result, fetchMock } = await mountWith(
      (_init, call) =>
        call === 1
          ? Response.json([])
          : new Promise<Response>((resolve) => {
              releaseHistory = resolve
            }),
      () => stream.response,
    )

    act(() => {
      result.current.setDraft('Oi')
    })
    act(() => {
      result.current.submit()
    })
    stream.push(sseFrame('user_message', q10))
    await waitFor(() => {
      expect(result.current.send.status).toBe('writing')
    })

    act(() => {
      result.current.reloadHistory()
    })
    await waitFor(() => {
      expect(requestsTo(fetchMock, HISTORY)).toHaveLength(2)
    })

    stream.push(sseFrame('done', a11))
    stream.close()
    await waitFor(() => {
      expect(result.current.send).toEqual({
        status: 'idle',
        answer: expect.objectContaining({ role: 'tutor' }),
      })
    })
    // A lista recarregada e a fonte: o `done` nao a inventa.
    expect(result.current.history).toEqual({ status: 'loading' })
    expect(result.current.messages).toEqual([])

    act(() => {
      releaseHistory?.(Response.json([q10, a11]))
    })
    await waitFor(() => {
      expect(result.current.messages).toEqual([q10, a11])
    })
  })

  it('segunda pergunta depois de uma falha mantem o parcial marcado', async () => {
    const q10 = question(10, 'Me explica recursão', 'x')
    const stream = controlledStream()
    const { result } = await mountWith(
      (_init, call) => Response.json(call === 1 ? [] : [q10, answer(11, 10, 'Meio', 'falhou')]),
      (_init, call) =>
        call === 1
          ? streamResponse([
              sseFrame('user_message', q10),
              sseFrame('delta', { text: 'Meio' }),
              sseFrame('error', { code: 'provedor_indisponivel' }),
            ])
          : stream.response,
    )

    act(() => {
      result.current.setDraft('Me explica recursão')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.messages.map((m) => m.id)).toEqual([10, 11])
    })

    act(() => {
      result.current.setDraft('outra')
    })
    act(() => {
      result.current.submit()
    })
    expect(result.current.send.status).toBe('sending')
    expect(result.current.messages.map((m) => [m.id, m.status, m.content])).toEqual([
      [10, 'completa', 'Me explica recursão'],
      [11, 'falhou', 'Meio'],
    ])
  })

  it('a atualizacao silenciosa que falha mantem a resposta provisoria marcada', async () => {
    const q10 = question(10, 'Me explica recursão', 'x')
    const { result, fetchMock } = await mountWith(
      (_init, call) => (call === 1 ? Response.json([]) : Response.json({}, { status: 500 })),
      () =>
        streamResponse([
          sseFrame('user_message', q10),
          sseFrame('delta', { text: 'Meio' }),
          sseFrame('error', { code: 'provedor_indisponivel' }),
        ]),
    )

    act(() => {
      result.current.setDraft('Me explica recursão')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(requestsTo(fetchMock, HISTORY)).toHaveLength(2)
    })
    await settle()

    expect(result.current.messages).toEqual([
      q10,
      expect.objectContaining({ id: -1, status: 'falhou', content: 'Meio' }),
    ])
    expect(result.current.history.status).toBe('loaded')
  })

  it('falha antes do stream nao poe nada na lista nem atualiza o historico', async () => {
    const q1 = question(1, 'Antiga', 'c1')
    const a1 = answer(2, 1, 'Resposta antiga')
    const { result, fetchMock } = await mountWith(
      [q1, a1],
      preStreamError(409, 'mensagem_em_andamento'),
    )

    act(() => {
      result.current.setDraft('Oi')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })
    await settle()

    expect(result.current.messages).toEqual([q1, a1])
    expect(requestsTo(fetchMock, HISTORY)).toHaveLength(1)
  })

  it('updateAction troca a acao na lista carregada, e nao faz nada durante o carregamento', async () => {
    const acao5: ActionRead = {
      id: 5,
      kind: 'create_mission',
      state: 'proposta',
      payload: {
        instructions: 'Ler o capítulo 3',
        completion_criterion: 'Resumo entregue',
        difficulty: 2,
        estimated_minutes: 30,
        deadline: '2027-01-10T13:00:00Z',
      },
      mission_id: null,
      error_code: null,
    }
    const q1 = question(1, 'Me passa uma missão', 'c1')
    const a2 = { ...answer(2, 1, 'Proponho esta.'), actions: [acao5] }
    const executada: ActionRead = { ...acao5, state: 'executada', mission_id: 42 }
    const { result } = await mountWith(
      (_init, call) => (call === 1 ? Response.json([q1, a2]) : new Promise<Response>(() => {})),
      NO_SEND,
    )

    act(() => {
      result.current.updateAction(executada)
    })
    expect(result.current.messages[1]?.actions).toEqual([executada])

    act(() => {
      result.current.reloadHistory()
    })
    act(() => {
      result.current.updateAction({ ...acao5, state: 'recusada' })
    })
    expect(result.current.history).toEqual({ status: 'loading' })
  })

  it('o error que chega com a conversa recarregando nao inventa lista', async () => {
    const q10 = question(10, 'Me explica recursão', 'x')
    const gravada = answer(11, 10, 'Meio', 'falhou')
    const stream = controlledStream()
    let releaseReload: ((response: Response) => void) | undefined
    const { result, fetchMock } = await mountWith(
      (_init, call) => {
        if (call === 1) {
          return Response.json([])
        }
        if (call === 2) {
          // A recarga pedida pela pessoa: fica pendente.
          return new Promise<Response>((resolve) => {
            releaseReload = resolve
          })
        }
        // A atualizacao silenciosa: chega ANTES da recarga.
        return Response.json([q10, gravada])
      },
      () => stream.response,
    )

    act(() => {
      result.current.setDraft('Me explica recursão')
    })
    act(() => {
      result.current.submit()
    })
    stream.push(sseFrame('user_message', q10))
    await waitFor(() => {
      expect(result.current.send.status).toBe('writing')
    })

    act(() => {
      result.current.reloadHistory()
    })
    await waitFor(() => {
      expect(requestsTo(fetchMock, HISTORY)).toHaveLength(2)
    })

    stream.push(sseFrame('delta', { text: 'Meio' }))
    stream.push(sseFrame('error', { code: 'provedor_indisponivel' }))
    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })
    await waitFor(() => {
      expect(requestsTo(fetchMock, HISTORY)).toHaveLength(3)
    })
    await settle()
    // Nem a resposta provisoria nem a atualizacao silenciosa escrevem por cima
    // da recarga em curso: a lista que ela trouxer e a fonte.
    expect(result.current.history).toEqual({ status: 'loading' })

    act(() => {
      releaseReload?.(Response.json([q10, gravada]))
    })
    await waitFor(() => {
      expect(result.current.messages).toEqual([q10, gravada])
    })
  })

  it('o historico lento que chega depois do done nao desfaz a resposta', async () => {
    // A atualizacao silenciosa da falha sai ANTES do reenvio; se ela chega
    // depois do `done`, traz a lista de antes dele e nao pode sobrescreve-la.
    const q10 = question(10, 'Me explica recursão', 'x')
    const gravada = answer(11, 10, 'Meio', 'falhou')
    const a12 = answer(12, 10, 'Inteira')
    let releaseSilent: ((response: Response) => void) | undefined
    const { result, fetchMock } = await mountWith(
      (_init, call) =>
        call === 1
          ? Response.json([])
          : new Promise<Response>((resolve) => {
              releaseSilent = resolve
            }),
      (_init, call) =>
        call === 1
          ? streamResponse([
              sseFrame('user_message', q10),
              sseFrame('delta', { text: 'Meio' }),
              sseFrame('error', { code: 'provedor_indisponivel' }),
            ])
          : streamResponse([sseFrame('user_message', q10), sseFrame('done', a12)]),
    )

    act(() => {
      result.current.setDraft('Me explica recursão')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(result.current.send.status).toBe('failed')
    })
    await waitFor(() => {
      expect(requestsTo(fetchMock, HISTORY)).toHaveLength(2)
    })

    act(() => {
      result.current.retry()
    })
    await waitFor(() => {
      expect(result.current.send).toEqual({
        status: 'idle',
        answer: expect.objectContaining({ role: 'tutor' }),
      })
    })
    expect(result.current.messages.map((m) => m.id)).toEqual([10, -1, 12])

    act(() => {
      releaseSilent?.(Response.json([q10, gravada]))
    })
    await settle()
    expect(result.current.messages.map((m) => m.id)).toEqual([10, -1, 12])
    expect(requestsTo(fetchMock, HISTORY)).toHaveLength(2)
  })

  it('de duas atualizacoes silenciosas, a mais antiga que chega por ultimo nao desfaz a mais nova', async () => {
    // Duas falhas seguidas: cada uma dispara uma atualizacao silenciosa, e
    // nenhum `done` entre elas avanca a geracao. Se a da PRIMEIRA falha chega
    // depois da da segunda, traz a lista de antes do segundo turno e nao pode
    // sobrescrever a mais nova.
    const q10 = question(10, 'Me explica recursão', 'x')
    const a11 = answer(11, 10, 'Meio', 'falhou')
    const a13 = answer(13, 10, 'Outro meio', 'falhou')
    const silent: ((response: Response) => void)[] = []
    const failingTurn = (text: string) =>
      streamResponse([
        sseFrame('user_message', q10),
        sseFrame('delta', { text }),
        sseFrame('error', { code: 'provedor_indisponivel' }),
      ])
    const { result, fetchMock } = await mountWith(
      (_init, call) =>
        call === 1
          ? Response.json([])
          : new Promise<Response>((resolve) => {
              silent.push(resolve)
            }),
      (_init, call) => failingTurn(call === 1 ? 'Meio' : 'Outro meio'),
    )

    act(() => {
      result.current.setDraft('Me explica recursão')
    })
    act(() => {
      result.current.submit()
    })
    await waitFor(() => {
      expect(requestsTo(fetchMock, HISTORY)).toHaveLength(2)
    })
    act(() => {
      result.current.retry()
    })
    await waitFor(() => {
      expect(requestsTo(fetchMock, HISTORY)).toHaveLength(3)
    })
    expect(result.current.send.status).toBe('failed')

    // A mais nova chega primeiro e vale.
    act(() => {
      silent[1]?.(Response.json([q10, a11, a13]))
    })
    await waitFor(() => {
      expect(result.current.messages.map((m) => m.id)).toEqual([10, 11, 13])
    })

    // A mais antiga chega depois e e descartada.
    act(() => {
      silent[0]?.(Response.json([q10, a11]))
    })
    await flushPromises()
    expect(result.current.messages.map((m) => m.id)).toEqual([10, 11, 13])
  })

  it('o done com a recarga em voo pede o historico de novo', async () => {
    // A recarga saiu ANTES do `done`: a lista dela pode ter a resposta ainda
    // `gerando`, vazia. O `done` a descarta e pede outra, que ja traz o fim.
    const q10 = question(10, 'Oi', 'x')
    const a11 = answer(11, 10, 'Olá')
    const stream = controlledStream()
    let releaseStale: ((response: Response) => void) | undefined
    const { result, fetchMock } = await mountWith(
      (_init, call) => {
        if (call === 1) {
          return Response.json([])
        }
        if (call === 2) {
          return new Promise<Response>((resolve) => {
            releaseStale = resolve
          })
        }
        return Response.json([q10, a11])
      },
      () => stream.response,
    )

    act(() => {
      result.current.setDraft('Oi')
    })
    act(() => {
      result.current.submit()
    })
    stream.push(sseFrame('user_message', q10))
    await waitFor(() => {
      expect(result.current.send.status).toBe('writing')
    })
    act(() => {
      result.current.reloadHistory()
    })
    await waitFor(() => {
      expect(requestsTo(fetchMock, HISTORY)).toHaveLength(2)
    })

    stream.push(sseFrame('done', a11))
    stream.close()
    await waitFor(() => {
      expect(result.current.send).toEqual({
        status: 'idle',
        answer: expect.objectContaining({ role: 'tutor' }),
      })
    })
    await waitFor(() => {
      expect(result.current.history).toEqual({ status: 'loaded', messages: [q10, a11] })
    })
    expect(requestsTo(fetchMock, HISTORY)).toHaveLength(3)

    act(() => {
      releaseStale?.(Response.json([q10, answer(11, 10, '', 'gerando')]))
    })
    await settle()
    expect(result.current.history).toEqual({ status: 'loaded', messages: [q10, a11] })
  })

  it('retry sem nada a repetir nao envia', async () => {
    const { result, fetchMock } = await mountWith([], NO_SEND)

    expect(result.current.retryTarget).toBeNull()
    act(() => {
      result.current.retry()
    })
    expect(requestsTo(fetchMock, SEND)).toHaveLength(0)
  })
})
