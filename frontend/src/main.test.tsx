import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

describe('main', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('monta a aplicação dentro de #root', async () => {
    // main.tsx roda seus efeitos no proprio import; act() garante que o
    // React tenha descarregado o trabalho agendado antes da assercao.
    await act(async () => {
      await import('./main')
    })

    expect(document.querySelector('#root h1')).toHaveTextContent('Tailwind funcionando')
  })
})
