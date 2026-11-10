import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bytesOf, controlledStream, sseFrame, streamResponse } from '../../test/sse'

// O cliente resolve a URL base no CARREGAMENTO do modulo e lanca quando a
// variavel falta -- ver a justificativa em client.ts. E por isso que todo
// teste daqui usa import() dinamico depois de vi.resetModules(): um import
// estatico no topo resolveria a URL uma unica vez, com o valor de
// test.env do vite.config.ts, e nao haveria como exercitar a ausencia.
async function loadClient() {
  return import('./client')
}

/** O erro que a promessa rejeitou, para as assercoes sobre ele. */
async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('a chamada deveria ter falhado')
    },
    (error: unknown) => error,
  )
}

describe('client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_API_URL', '/api')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('resolucao da URL base', () => {
    it('recusa o carregamento quando VITE_API_URL esta ausente', async () => {
      vi.stubEnv('VITE_API_URL', undefined)

      await expect(loadClient()).rejects.toThrow(/VITE_API_URL/)
    })

    it('recusa o carregamento quando VITE_API_URL esta vazia', async () => {
      vi.stubEnv('VITE_API_URL', '')

      await expect(loadClient()).rejects.toThrow(/VITE_API_URL/)
    })

    it('monta a URL a partir da variavel, sem barra final no recurso', async () => {
      vi.stubEnv('VITE_API_URL', '/api')
      const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
      vi.stubGlobal('fetch', fetchMock)
      const { requestJson } = await loadClient()

      await requestJson('/missions')

      // A barra final importa: /api/missions/ responde 307 e gasta um
      // round-trip silencioso a cada chamada.
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/missions')
    })
  })

  describe('requestJson', () => {
    it('devolve o corpo desserializado quando a resposta e 200', async () => {
      const payload = [{ id: 1 }]
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)))
      const { requestJson } = await loadClient()

      await expect(requestJson<{ id: number }[]>('/missions')).resolves.toEqual(payload)
    })

    it('pede JSON explicitamente no cabecalho Accept', async () => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
      vi.stubGlobal('fetch', fetchMock)
      const { requestJson } = await loadClient()

      await requestJson('/missions')

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      expect(new Headers(init.headers).get('Accept')).toBe('application/json')
    })

    it('repassa o AbortSignal recebido', async () => {
      const controller = new AbortController()
      const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
      vi.stubGlobal('fetch', fetchMock)
      const { requestJson } = await loadClient()

      await requestJson('/missions', controller.signal)

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      expect(init.signal).toBe(controller.signal)
    })
  })

  describe('postJson', () => {
    it('envia POST com o corpo em JSON e devolve a resposta desserializada', async () => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 7 }))
      vi.stubGlobal('fetch', fetchMock)
      const { postJson } = await loadClient()

      const resposta = await postJson<{ id: number }>('/missions/7/complete', {
        operation_id: 'op-1',
      })

      expect(resposta).toEqual({ id: 7 })
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/missions/7/complete')
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      expect(init.method).toBe('POST')
      expect(init.body).toBe('{"operation_id":"op-1"}')
      // Sem o Content-Type, o FastAPI nao le o corpo como JSON e responde 422.
      const headers = new Headers(init.headers)
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(headers.get('Accept')).toBe('application/json')
    })
  })

  describe('postJson com timeout', () => {
    /**
     * Um `fetch` que nunca responde e obedece ao `signal`, como o de verdade:
     * o abort rejeita com `AbortError`. So o `signal` o destrava.
     */
    function fetchUntilAborted() {
      return vi.fn((_input: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        })
      })
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('sem a opcao, o pedido segue sem signal e sem timer', async () => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 7 }))
      vi.stubGlobal('fetch', fetchMock)
      const { postJson } = await loadClient()

      await postJson('/missions/7/complete', { operation_id: 'op-1' })

      expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('aborta o pedido pendurado ao fim do prazo e falha como prazo (ApiTimeoutError), com a causa', async () => {
      const fetchMock = fetchUntilAborted()
      vi.stubGlobal('fetch', fetchMock)
      const { ApiError, ApiTimeoutError, postJson } = await loadClient()

      const pending = failureOf(
        postJson('/missions/7/start', { operation_id: 'op-1' }, { timeoutMs: 5000 }),
      )
      await vi.advanceTimersByTimeAsync(4999)
      expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      const erro = await pending

      expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true)
      expect(erro).toBeInstanceOf(ApiTimeoutError)
      // Subtipo de ApiError: quem so conhece ApiError continua tratando o prazo.
      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as Error).name).toBe('ApiTimeoutError')
      // Como a falha de rede: sem status e sem code, e e isso que faz as telas
      // oferecerem o reenvio com a MESMA chave (resultado desconhecido).
      expect((erro as InstanceType<typeof ApiError>).status).toBeNull()
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
      expect((erro as Error).message).toBe('O servidor demorou demais para responder.')
      expect((erro as Error).cause).toBeInstanceOf(Error)
    })

    it('tambem aborta quando o corpo da resposta nao termina de chegar', async () => {
      // Os cabecalhos chegaram, o corpo nao: o `json()` fica pendurado e o
      // pedido continua preso ate o signal o soltar.
      const fetchMock = vi.fn((_input: string, init?: RequestInit) => {
        const response = new Response(null, { status: 200 })
        vi.spyOn(response, 'json').mockImplementation(
          () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'))
              })
            }),
        )
        return Promise.resolve(response)
      })
      vi.stubGlobal('fetch', fetchMock)
      const { ApiError, ApiTimeoutError, postJson } = await loadClient()

      const pending = failureOf(postJson('/missions/7/start', {}, { timeoutMs: 5000 }))
      await vi.advanceTimersByTimeAsync(5000)
      const erro = await pending

      // Um 200 cujo corpo nao chegou e resultado DESCONHECIDO, nunca
      // `ApiError(200)`: a tela precisa oferecer o reenvio com a mesma chave.
      expect(erro).toBeInstanceOf(ApiTimeoutError)
      // Subtipo de ApiError: quem so conhece ApiError continua tratando o prazo.
      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as Error).name).toBe('ApiTimeoutError')
      expect((erro as InstanceType<typeof ApiError>).status).toBeNull()
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
      expect((erro as Error).message).toBe('O servidor demorou demais para responder.')
    })

    it('um erro cujo corpo nao chega no prazo mantem o status, com code nulo', async () => {
      // Os cabecalhos do 409 chegaram; o corpo, nao. O status ja e fato: o
      // servidor leu e recusou. Reescreve-lo como "demorou" (status nulo)
      // fazia a tela oferecer um reenvio que nao era preciso.
      const fetchMock = vi.fn((_input: string, init?: RequestInit) => {
        const response = new Response(null, { status: 409 })
        vi.spyOn(response, 'json').mockImplementation(
          () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'))
              })
            }),
        )
        return Promise.resolve(response)
      })
      vi.stubGlobal('fetch', fetchMock)
      const { ApiError, ApiTimeoutError, postJson } = await loadClient()

      const pending = failureOf(postJson('/missions/7/start', {}, { timeoutMs: 5000 }))
      await vi.advanceTimersByTimeAsync(5000)
      const erro = await pending

      expect(erro).toBeInstanceOf(ApiError)
      expect(erro).not.toBeInstanceOf(ApiTimeoutError)
      expect((erro as InstanceType<typeof ApiError>).status).toBe(409)
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
      expect((erro as Error).message).toBe('O servidor respondeu 409.')
      expect(vi.getTimerCount()).toBe(0)
    })

    it('uma resposta a tempo desarma o timer e chega intacta', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 7 })))
      const { postJson } = await loadClient()

      const resposta = await postJson('/missions/7/start', {}, { timeoutMs: 5000 })

      expect(resposta).toEqual({ id: 7 })
      expect(vi.getTimerCount()).toBe(0)
    })

    it('uma falha que nao e o prazo continua sendo a falha original', async () => {
      // O timer nao pode reescrever um 409 real como "demorou demais".
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ detail: 'x', code: 'transicao_ilegal' }, { status: 409 }),
          ),
      )
      const { ApiError, postJson } = await loadClient()

      const erro = await failureOf(postJson('/missions/7/start', {}, { timeoutMs: 5000 }))

      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as InstanceType<typeof ApiError>).status).toBe(409)
      expect((erro as InstanceType<typeof ApiError>).code).toBe('transicao_ilegal')
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('traducao de falha em ApiError', () => {
    it('transforma falha de rede em ApiError sem status nem code, preservando a causa', async () => {
      const causa = new TypeError('Failed to fetch')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(causa))
      const { ApiError, ApiTimeoutError, postJson } = await loadClient()

      const erro = await failureOf(postJson('/missions/7/complete', { operation_id: 'op-1' }))

      expect(erro).toBeInstanceOf(ApiError)
      expect(erro).not.toBeInstanceOf(ApiTimeoutError)
      // status nulo e o que distingue "nao houve resposta" de "o servidor
      // respondeu mal": a tela nao deve dizer 500 quando nada chegou.
      expect((erro as InstanceType<typeof ApiError>).status).toBeNull()
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
      expect((erro as InstanceType<typeof ApiError>).cause).toBe(causa)
      expect((erro as Error).message).toMatch(/servidor/i)
    })

    it('expoe o code do corpo de erro, junto com o status', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json(
              { detail: 'missao nao encontrada', code: 'missao_nao_encontrada' },
              { status: 404 },
            ),
          ),
      )
      const { ApiError, postJson } = await loadClient()

      const erro = await failureOf(postJson('/missions/9/complete', { operation_id: 'op-1' }))

      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as InstanceType<typeof ApiError>).status).toBe(404)
      expect((erro as InstanceType<typeof ApiError>).code).toBe('missao_nao_encontrada')
    })

    it('nunca usa o detail como mensagem, mesmo quando ele e texto', async () => {
      // A prosa do `detail` e do backend: sem acento, e a da transicao expoe o
      // valor cru do enum. A mensagem do erro e escrita AQUI, e o `detail` nao
      // e lido. Antes do Incremento A, este era o caminho que o levava a tela.
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json(
              { detail: 'PROSA-CRUA-DO-BACKEND', code: 'transicao_ilegal' },
              { status: 409 },
            ),
          ),
      )
      const { requestJson } = await loadClient()

      const erro = await failureOf(requestJson('/missions'))

      expect((erro as Error).message).toBe('O servidor respondeu 409.')
    })

    it('devolve code nulo quando o code do corpo nao e texto', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ detail: 'x', code: 42 }, { status: 409 })),
      )
      const { ApiError, requestJson } = await loadClient()

      const erro = await failureOf(requestJson('/missions'))

      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
    })

    it('devolve code nulo no 422 do FastAPI, que nao tem code', async () => {
      // 422 do FastAPI: detail e uma LISTA de erros de validacao, e nao ha code.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ detail: [{ loc: ['body'] }] }, { status: 422 })),
      )
      const { ApiError, requestJson } = await loadClient()

      const erro = await failureOf(requestJson('/missions'))

      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as Error).message).toBe('O servidor respondeu 422.')
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
    })

    it('devolve code nulo quando o corpo de erro nao e JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })),
      )
      const { ApiError, requestJson } = await loadClient()

      const erro = await failureOf(requestJson('/missions'))

      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as Error).message).toBe('O servidor respondeu 502.')
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
    })

    it('devolve code nulo quando o corpo de erro e JSON nulo', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(null, { status: 503 })))
      const { ApiError, requestJson } = await loadClient()

      const erro = await failureOf(requestJson('/missions'))

      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as Error).message).toBe('O servidor respondeu 503.')
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
    })
  })

  describe('postStream', () => {
    /** Consome o gerador inteiro e devolve os eventos. */
    async function collect(events: AsyncIterable<unknown>): Promise<unknown[]> {
      const all: unknown[] = []
      for await (const event of events) {
        all.push(event)
      }
      return all
    }

    it('faz POST em JSON, pede text/event-stream e repassa o AbortSignal', async () => {
      const fetchMock = vi.fn().mockResolvedValue(streamResponse([]))
      vi.stubGlobal('fetch', fetchMock)
      const { postStream } = await loadClient()
      const controller = new AbortController()

      await collect(postStream('/tutoring/messages', { content: 'oi' }, controller.signal))

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('/api/tutoring/messages')
      expect(init.method).toBe('POST')
      expect(init.body).toBe('{"content":"oi"}')
      expect(new Headers(init.headers).get('Accept')).toBe('text/event-stream')
      expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
      expect(init.signal).toBe(controller.signal)
    })

    it('entrega varios eventos que chegam num pedaco so, na ordem', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            streamResponse([sseFrame('delta', { text: 'a' }) + sseFrame('delta', { text: 'b' })]),
          ),
      )
      const { postStream } = await loadClient()

      expect(await collect(postStream('/x', {}))).toEqual([
        { event: 'delta', data: { text: 'a' } },
        { event: 'delta', data: { text: 'b' } },
      ])
    })

    it('remonta um evento partido entre pedacos, inclusive no meio do separador', async () => {
      const frame = sseFrame('done', { id: 7 })
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            streamResponse([frame.slice(0, 5), frame.slice(5, -1), frame.slice(-1)]),
          ),
      )
      const { postStream } = await loadClient()

      expect(await collect(postStream('/x', {}))).toEqual([{ event: 'done', data: { id: 7 } }])
    })

    it('remonta um caractere de varios bytes partido entre pedacos', async () => {
      // `é` e dois bytes em UTF-8. Um `TextDecoder` sem `{ stream: true }`
      // trocaria as duas metades por U+FFFD.
      const bytes = bytesOf(sseFrame('delta', { text: 'é' }))
      const corte = bytes.indexOf(0xc3) + 1
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes.slice(0, corte))
          c.enqueue(bytes.slice(corte))
          c.close()
        },
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))
      const { postStream } = await loadClient()

      expect(await collect(postStream('/x', {}))).toEqual([{ event: 'delta', data: { text: 'é' } }])
    })

    it('termina sem erro quando o stream acaba sem done nem error', async () => {
      // Resultado desconhecido: o cliente nao sabe o que e `done`. Quem decide
      // que faltou o final e o hook da tutoria (spec, "O stream").
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(streamResponse([sseFrame('user_message', { id: 1 })])),
      )
      const { postStream } = await loadClient()

      expect(await collect(postStream('/x', {}))).toEqual([
        { event: 'user_message', data: { id: 1 } },
      ])
    })

    it('descarta o quadro incompleto no fim do stream', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            streamResponse([sseFrame('delta', { text: 'a' }), 'event: delta\ndata: {"te']),
          ),
      )
      const { postStream } = await loadClient()

      expect(await collect(postStream('/x', {}))).toEqual([{ event: 'delta', data: { text: 'a' } }])
    })

    it.each([
      [503, 'provedor_nao_configurado'],
      [409, 'mensagem_em_andamento'],
      [409, 'operacao_reutilizada'],
    ])('um %i antes do stream vira ApiError com o code %s', async (status, code) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ detail: 'x', code }, { status })),
      )
      const { ApiError, postStream } = await loadClient()

      const error = await failureOf(collect(postStream('/x', {})))

      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({
        status,
        code,
        message: `O servidor respondeu ${String(status)}.`,
      })
    })

    it('um 422 sem code vira ApiError com code null', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ detail: [] }, { status: 422 })),
      )
      const { postStream } = await loadClient()

      expect(await failureOf(collect(postStream('/x', {})))).toMatchObject({
        status: 422,
        code: null,
      })
    })

    it('a falha de rede vira ApiError sem status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
      const { postStream } = await loadClient()

      expect(await failureOf(collect(postStream('/x', {})))).toMatchObject({
        status: null,
        code: null,
        message: 'Não foi possível falar com o servidor.',
      })
    })

    it('o AbortSignal cancela o pedido, e o erro carrega a causa', async () => {
      // O `fetch` de verdade rejeita com AbortError quando o sinal aborta.
      // O stub reproduz isso, e o teste confere que a causa nao se perde: o
      // hook decide por `signal.aborted`, e nao pelo tipo do erro.
      const abortError = new DOMException('Aborted', 'AbortError')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_url: string, init: RequestInit) => {
          expect(init.signal?.aborted).toBe(true)
          return Promise.reject(abortError)
        }),
      )
      const { postStream } = await loadClient()
      const controller = new AbortController()
      controller.abort()

      const error = await failureOf(collect(postStream('/x', {}, controller.signal)))

      expect(error).toMatchObject({ status: null, cause: abortError })
    })

    it('a queda no meio do stream vira ApiError com o status da resposta', async () => {
      const stream = controlledStream()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(stream.response))
      const { postStream } = await loadClient()
      const events = postStream('/x', {})

      stream.push(sseFrame('user_message', { id: 1 }))
      expect(await events.next()).toEqual({
        done: false,
        value: { event: 'user_message', data: { id: 1 } },
      })
      stream.fail(new TypeError('network error'))

      expect(await failureOf(events.next())).toMatchObject({
        status: 200,
        code: null,
        message: 'A resposta foi interrompida no caminho.',
      })
    })

    it.each([
      ['sem a linha event', 'data: {}\n\n'],
      ['sem a linha data', 'event: delta\n\n'],
      ['com data que nao e JSON', 'event: delta\ndata: {nao e json\n\n'],
    ])('um quadro %s reprova o stream', async (_caso, quadro) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([quadro])))
      const { postStream } = await loadClient()

      expect(await failureOf(collect(postStream('/x', {})))).toMatchObject({
        status: 200,
        message: 'A resposta chegou num formato inesperado.',
      })
    })

    it('ignora linhas que nao sao event nem data, como comentario e id do SSE', async () => {
      // O backend nao as escreve, mas o formato SSE as permite: aqui, uma linha
      // de comentario e uma `id:` DENTRO de um quadro que tem `event` e `data`.
      // Estrito e exigir `event` e `data` em cada quadro; as outras linhas sao
      // ignoradas. Um quadro so de comentario (`: keepalive\n\n`) reprova no
      // `parseFrame`, pela decisao do plano do 1b-2 (quadro malformado reprova).
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            streamResponse([': comentario\nevent: delta\ndata: {"text":"a"}\nid: 1\n\n']),
          ),
      )
      const { postStream } = await loadClient()

      expect(await collect(postStream('/x', {}))).toEqual([{ event: 'delta', data: { text: 'a' } }])
    })

    it('uma resposta 200 sem corpo reprova como formato inesperado', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
      const { postStream } = await loadClient()

      expect(await failureOf(collect(postStream('/x', {})))).toMatchObject({
        status: 200,
        message: 'A resposta chegou num formato inesperado.',
      })
    })

    it('parar de consumir no meio cancela a leitura do corpo', async () => {
      // Sem o cancelamento, a conexao ficaria aberta ate o servidor terminar
      // -- e o servidor so grava `interrompida` quando a conexao cai.
      const onCancel = vi.fn()
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytesOf(sseFrame('delta', { text: 'a' })))
        },
        cancel: onCancel,
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))
      const { postStream } = await loadClient()

      for await (const event of postStream('/x', {})) {
        expect(event).toEqual({ event: 'delta', data: { text: 'a' } })
        break
      }

      expect(onCancel).toHaveBeenCalledTimes(1)
    })
  })
})
