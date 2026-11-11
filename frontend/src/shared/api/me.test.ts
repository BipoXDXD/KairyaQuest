import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonBody, pendingUntilAborted, requestsTo, routeFetch } from '../../test/fetchRoutes'
import { ApiError } from './client'
import { fetchMe, saveLocale } from './me'

describe('me', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('fetchMe', () => {
    it('locale conhecido vira chosen, e display_name vira displayName', async () => {
      routeFetch({ 'GET /api/me': () => Response.json({ display_name: 'A', locale: 'en' }) })

      await expect(fetchMe()).resolves.toEqual({
        displayName: 'A',
        locale: { kind: 'chosen', locale: 'en' },
      })
    })

    it('locale null vira unset: o usuário nunca escolheu', async () => {
      routeFetch({ 'GET /api/me': () => Response.json({ display_name: 'A', locale: null }) })

      await expect(fetchMe()).resolves.toEqual({ displayName: 'A', locale: { kind: 'unset' } })
    })

    it.each<[string, Record<string, unknown>]>([
      ['fr', { display_name: 'A', locale: 'fr' }],
      ['número', { display_name: 'A', locale: 1 }],
      ['sem a chave', { display_name: 'A' }],
    ])('locale desconhecido (%s) vira unknown', async (_caso, corpo) => {
      routeFetch({ 'GET /api/me': () => Response.json(corpo) })

      await expect(fetchMe()).resolves.toEqual({ displayName: 'A', locale: { kind: 'unknown' } })
    })

    it.each<[string, unknown]>([
      ['sem display_name', { locale: 'en' }],
      ['display_name que não é texto', { display_name: 7, locale: 'en' }],
      ['corpo null', null],
      ['corpo lista', []],
    ])('corpo %s rejeita com ApiError de formato', async (_caso, corpo) => {
      routeFetch({ 'GET /api/me': () => Response.json(corpo) })

      const erro: unknown = await fetchMe().then(
        () => null,
        (error: unknown) => error,
      )

      expect(erro).toBeInstanceOf(ApiError)
      expect(erro).toMatchObject({ message: 'A resposta chegou num formato inesperado.' })
    })

    it('o abort do signal recebido chega ao pedido', async () => {
      // O cliente pode combinar o signal de quem chama com o prazo do GET, entao
      // o `fetch` nao recebe o mesmo objeto: o que se confere e o efeito.
      const mock = routeFetch({ 'GET /api/me': pendingUntilAborted })
      const controller = new AbortController()

      const pending = fetchMe(controller.signal).then(
        () => null,
        (error: unknown) => error,
      )
      const pedido = requestsTo(mock, 'GET /api/me')[0]
      expect(pedido?.signal?.aborted).toBe(false)
      controller.abort()

      expect(await pending).toBeInstanceOf(ApiError)
      expect(pedido?.signal?.aborted).toBe(true)
    })
  })

  describe('saveLocale', () => {
    it('envia PATCH /api/me com o corpo exatamente {"locale":"en"}', async () => {
      const mock = routeFetch({
        'PATCH /api/me': () => Response.json({ display_name: 'A', locale: 'en' }),
      })

      await expect(saveLocale('en')).resolves.toBeUndefined()

      const pedidos = requestsTo(mock, 'PATCH /api/me')
      expect(pedidos).toHaveLength(1)
      expect(String(pedidos[0]?.body)).toBe('{"locale":"en"}')
      expect(jsonBody(pedidos[0] ?? {})).toEqual({ locale: 'en' })
    })

    it('rejeita com ApiError quando o servidor falha', async () => {
      routeFetch({ 'PATCH /api/me': () => new Response(null, { status: 503 }) })

      await expect(saveLocale('pt-BR')).rejects.toMatchObject({ status: 503 })
    })
  })
})
