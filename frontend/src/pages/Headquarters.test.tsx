import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Headquarters } from './Headquarters'

describe('Headquarters', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('anuncia a tela no titulo de nivel 1, em portugues', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([])))

    render(<Headquarters />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/quartel-general/i)
    // Espera o efeito da feature assentar, para o teste nao terminar no meio
    // de uma atualizacao de estado.
    await screen.findByTestId('missions-empty')
  })

  it('compoe a feature de missoes, e nao busca dado por conta propria', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
    vi.stubGlobal('fetch', fetchMock)

    render(<Headquarters />)

    expect(screen.getByTestId('missions')).toBeInTheDocument()
    await screen.findByTestId('missions-empty')
    // Uma unica ida a rede, e ela e da feature: a pagina nao chama a API.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
