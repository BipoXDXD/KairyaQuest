import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  describe('traducao de falha em ApiError', () => {
    it('transforma falha de rede em ApiError sem status nem code, preservando a causa', async () => {
      const causa = new TypeError('Failed to fetch')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(causa))
      const { ApiError, postJson } = await loadClient()

      const erro = await failureOf(postJson('/missions/7/complete', { operation_id: 'op-1' }))

      expect(erro).toBeInstanceOf(ApiError)
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
})
