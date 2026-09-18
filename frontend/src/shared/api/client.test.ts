import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// O cliente resolve a URL base no CARREGAMENTO do modulo e lanca quando a
// variavel falta -- ver a justificativa em client.ts. E por isso que todo
// teste daqui usa import() dinamico depois de vi.resetModules(): um import
// estatico no topo resolveria a URL uma unica vez, com o valor de
// test.env do vite.config.ts, e nao haveria como exercitar a ausencia.
async function loadClient() {
  return import('./client')
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

    it('transforma falha de rede em ApiError sem status, preservando a causa', async () => {
      const causa = new TypeError('Failed to fetch')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(causa))
      const { ApiError, requestJson } = await loadClient()

      const erro = await requestJson('/missions').catch((e: unknown) => e)

      expect(erro).toBeInstanceOf(ApiError)
      // status nulo e o que distingue "nao houve resposta" de "o servidor
      // respondeu mal": a tela nao deve dizer 500 quando nada chegou.
      expect((erro as InstanceType<typeof ApiError>).status).toBeNull()
      expect((erro as InstanceType<typeof ApiError>).cause).toBe(causa)
      expect((erro as Error).message).toMatch(/servidor/i)
    })

    it('usa o detail do corpo de erro como mensagem', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(Response.json({ detail: 'Missao nao encontrada.' }, { status: 404 })),
      )
      const { ApiError, requestJson } = await loadClient()

      const erro = await requestJson('/missions/9').catch((e: unknown) => e)

      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as Error).message).toBe('Missao nao encontrada.')
      expect((erro as InstanceType<typeof ApiError>).status).toBe(404)
    })

    it('cai para uma mensagem com o status quando detail nao e texto', async () => {
      // 422 do FastAPI: detail e uma LISTA de erros de validacao, nao string.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ detail: [{ loc: ['body'] }] }, { status: 422 })),
      )
      const { requestJson } = await loadClient()

      const erro = await requestJson('/missions').catch((e: unknown) => e)

      expect((erro as Error).message).toContain('422')
    })

    it('cai para uma mensagem com o status quando o corpo de erro nao e JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })),
      )
      const { requestJson } = await loadClient()

      const erro = await requestJson('/missions').catch((e: unknown) => e)

      expect((erro as Error).message).toContain('502')
    })

    it('cai para uma mensagem com o status quando o corpo de erro e JSON sem detail', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ erro: 'x' }, { status: 500 })),
      )
      const { requestJson } = await loadClient()

      const erro = await requestJson('/missions').catch((e: unknown) => e)

      expect((erro as Error).message).toContain('500')
    })

    it('cai para uma mensagem com o status quando o corpo de erro e JSON nulo', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(null, { status: 503 })))
      const { requestJson } = await loadClient()

      const erro = await requestJson('/missions').catch((e: unknown) => e)

      expect((erro as Error).message).toContain('503')
    })
  })
})
