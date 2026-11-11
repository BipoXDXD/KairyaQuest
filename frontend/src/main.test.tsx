import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestsTo, routeFetch } from './test/fetchRoutes'
import { stubViewport } from './test/viewport'

describe('main', () => {
  let fetchMock: ReturnType<typeof routeFetch>

  beforeEach(() => {
    // main.tsx monta a arvore no proprio import; sem o reset, o segundo teste
    // receberia o modulo do cache e nada seria montado de novo.
    vi.resetModules()
    document.body.innerHTML = '<div id="root"></div>'
    // O `fetch` e o `matchMedia` sao stubbados ANTES do import porque main.tsx
    // monta a arvore no proprio import: a arvore ja busca as missoes e o
    // estado da Kairya, e o painel da Kairya pergunta a largura da tela. Sem o
    // stub, o teste faria um pedido de verdade a uma URL relativa dentro do
    // jsdom (e o jsdom nao implementa `matchMedia`).
    stubViewport('desktop')
    // O `GET /api/me` e o boot do idioma (`ServerLocaleSync`): o servidor
    // devolve o mesmo idioma do navegador, e nenhuma escrita acontece.
    fetchMock = routeFetch({
      'GET /api/me': () => Response.json({ display_name: 'Aventureira', locale: 'pt-BR' }),
      'GET /api/missions': () => Response.json([]),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json([]),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('monta a aplicação dentro de #root', async () => {
    // main.tsx roda seus efeitos no proprio import; act() garante que o
    // React tenha descarregado o trabalho agendado antes da assercao.
    // Essa garantia depende de IS_REACT_ACT_ENVIRONMENT, definido em
    // src/test/setup.ts -- sem o sinalizador, o React avisa que o ambiente
    // nao suporta act() e a afirmacao acima seria falsa.
    await act(async () => {
      await import('./main')
    })

    expect(document.querySelector('#root h1')).toHaveTextContent('Quartel-General')
    // O AudioProvider está montado: os controles de som do menu o consomem
    // via `useAudio`, que lança fora dele.
    expect(document.querySelector('[data-testid="sound-controls"]')).not.toBeNull()
  })

  it('confronta o idioma com o servidor no boot', async () => {
    await act(async () => {
      await import('./main')
    })

    // Dois GETs, e nao um: fora do build de producao o `StrictMode` monta,
    // limpa e monta de novo cada efeito. O primeiro sai abortado, e so o
    // segundo vale.
    const gets = requestsTo(fetchMock, 'GET /api/me')
    expect(gets).toHaveLength(2)
    expect(gets.map((init) => init.signal?.aborted)).toEqual([true, false])
    // O servidor devolveu o mesmo idioma: nenhuma escrita.
    expect(requestsTo(fetchMock, 'PATCH /api/me')).toHaveLength(0)
    expect(document.documentElement.lang).toBe('pt-BR')
  })
})
