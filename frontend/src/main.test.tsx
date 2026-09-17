import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

describe('main', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
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

    expect(document.querySelector('#root h1')).toHaveTextContent('Tailwind funcionando')
  })
})
