// @vitest-environment node
/**
 * As portas do E2E por worktree (pendencia 19).
 *
 * Mora fora de `tests/e2e/` de proposito: la dentro o Playwright a coletaria
 * como cenario, e o Vitest a exclui (`vite.config.ts`). Aqui o Vitest a coleta,
 * e o `tsconfig.e2e.json` a confere com os mesmos tipos de Node do E2E.
 *
 * Ambiente `node`, e nao o jsdom do resto da suite: e o ambiente em que o
 * Playwright carrega estes modulos, e o `playwright.config.ts` resolve a raiz
 * do repositorio por `import.meta.url`, que so e `file:` no Node.
 *
 * `servers.ts` le `FOCUSQUEST_E2E_PORT_OFFSET` na CARGA do modulo; por isso os
 * testes das constantes trocam a variavel e reimportam o modulo do zero.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DESLOCAMENTO_MAXIMO, enderecos, lerDeslocamento } from '../e2e/servers'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('lerDeslocamento', () => {
  it('sem a variavel, ou com ela vazia, e zero: o comportamento de sempre', () => {
    expect(lerDeslocamento(undefined)).toBe(0)
    expect(lerDeslocamento('')).toBe(0)
  })

  it('aceita de 0 ao maximo, que e 49', () => {
    expect(DESLOCAMENTO_MAXIMO).toBe(49)
    expect(lerDeslocamento('0')).toBe(0)
    expect(lerDeslocamento('7')).toBe(7)
    expect(lerDeslocamento('49')).toBe(49)
  })

  it.each(['-1', '50', 'abc', '1.5', ' 3', '3 ', '0x10', '1e1', '+2'])(
    'recusa %j com uma mensagem que nomeia a variavel e a faixa',
    (valor) => {
      expect(() => lerDeslocamento(valor)).toThrow(/FOCUSQUEST_E2E_PORT_OFFSET.*inteiro de 0 a 49/)
    },
  )
})

describe('enderecos', () => {
  it('com zero, sao as portas de sempre', () => {
    expect(enderecos(0)).toEqual({
      api: 'http://127.0.0.1:8100',
      web: 'http://127.0.0.1:5273',
      falso: 'http://127.0.0.1:8150',
    })
  })

  it('desloca as tres portas juntas', () => {
    expect(enderecos(7)).toEqual({
      api: 'http://127.0.0.1:8107',
      web: 'http://127.0.0.1:5280',
      falso: 'http://127.0.0.1:8157',
    })
  })

  it('no maximo, a API ainda fica abaixo do falso de quem usa zero', () => {
    const topo = Number(new URL(enderecos(DESLOCAMENTO_MAXIMO).api).port)
    const base = Number(new URL(enderecos(0).falso).port)
    expect(topo).toBeLessThan(base)
  })
})

describe('as constantes do modulo seguem FOCUSQUEST_E2E_PORT_OFFSET', () => {
  it('sem a variavel, as portas de sempre', async () => {
    vi.stubEnv('FOCUSQUEST_E2E_PORT_OFFSET', undefined)
    const servidores = await import('../e2e/servers')
    expect([servidores.API_URL, servidores.WEB_URL, servidores.FALSO_URL]).toEqual([
      'http://127.0.0.1:8100',
      'http://127.0.0.1:5273',
      'http://127.0.0.1:8150',
    ])
  })

  it('com 7, as tres deslocadas', async () => {
    vi.stubEnv('FOCUSQUEST_E2E_PORT_OFFSET', '7')
    const servidores = await import('../e2e/servers')
    expect([servidores.API_URL, servidores.WEB_URL, servidores.FALSO_URL]).toEqual([
      'http://127.0.0.1:8107',
      'http://127.0.0.1:5280',
      'http://127.0.0.1:8157',
    ])
  })

  it('com um valor invalido, a carga do modulo falha -- e o Playwright nao sobe', async () => {
    vi.stubEnv('FOCUSQUEST_E2E_PORT_OFFSET', '50')
    await expect(import('../e2e/servers')).rejects.toThrow(/FOCUSQUEST_E2E_PORT_OFFSET/)
  })
})

describe('playwright.config.ts deriva TODAS as portas de servers.ts', () => {
  it('os tres webServer usam as portas deslocadas', async () => {
    vi.stubEnv('FOCUSQUEST_E2E_PORT_OFFSET', '7')
    const { default: config } = await import('../../playwright.config')
    const servidores = [config.webServer].flat()
    expect(servidores.map((s) => s?.command)).toEqual([
      expect.stringContaining('--porta 8157'),
      expect.stringContaining('--port 8107'),
      expect.stringContaining('--port 5280'),
    ])
    expect(servidores.map((s) => s?.url)).toEqual([
      'http://127.0.0.1:8157/_control/requests',
      'http://127.0.0.1:8107/ready',
      'http://127.0.0.1:5280',
    ])
    expect(config.use?.baseURL).toBe('http://127.0.0.1:5280')
    expect(servidores[1]?.env).toEqual({
      FOCUSQUEST_ANTHROPIC_BASE_URL: 'http://127.0.0.1:8157',
      PYTHONPATH: 'tests',
    })
    expect(servidores[1]?.command).toContain('uvicorn integration.e2e_app:app')
    expect(servidores[2]?.env).toEqual({ API_PROXY_TARGET: 'http://127.0.0.1:8107' })
  })
})

describe('playwright.config.ts fixa o idioma do navegador', () => {
  it('o use global leva locale pt-BR', async () => {
    const { default: config } = await import('../../playwright.config')
    // Sem locale fixo, o Chromium headless diz en-US e o boot gravaria `en` em
    // `users.locale` no primeiro GET com `null`.
    expect(config.use?.locale).toBe('pt-BR')
  })
})
