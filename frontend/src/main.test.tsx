import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('main', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    // O `fetch` e stubbado ANTES do import porque main.tsx monta a arvore no
    // proprio import, e a arvore ja busca as missoes. Sem o stub, o teste
    // faria um pedido de verdade a uma URL relativa dentro do jsdom.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([])))
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
