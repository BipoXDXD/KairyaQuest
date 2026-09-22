import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routeFetch } from './test/fetchRoutes'
import { stubViewport } from './test/viewport'

describe('main', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    // O `fetch` e o `matchMedia` sao stubbados ANTES do import porque main.tsx
    // monta a arvore no proprio import: a arvore ja busca as missoes e o
    // estado da Tifa, e o painel da Tifa pergunta a largura da tela. Sem o
    // stub, o teste faria um pedido de verdade a uma URL relativa dentro do
    // jsdom (e o jsdom nao implementa `matchMedia`).
    stubViewport('desktop')
    routeFetch({
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

    expect(document.querySelector('#root h1')).toHaveTextContent('Quartel-general')
  })
})
