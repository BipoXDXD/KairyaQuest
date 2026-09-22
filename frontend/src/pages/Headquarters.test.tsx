import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestsTo, routeFetch } from '../test/fetchRoutes'
import { stubViewport } from '../test/viewport'
import { Headquarters } from './Headquarters'

/** A pagina busca tres recursos na montagem: missoes, status e historico da Tifa. */
function stubPage() {
  stubViewport('desktop')
  return routeFetch({
    'GET /api/missions': () => Response.json([]),
    'GET /api/tutoring/status': () => Response.json({ available: true }),
    'GET /api/tutoring/messages': () => Response.json([]),
  })
}

describe('Headquarters', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('anuncia a tela no titulo de nivel 1, em portugues', async () => {
    stubPage()

    render(<Headquarters />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/quartel-general/i)
    // Espera os efeitos das features assentarem, para o teste nao terminar no
    // meio de uma atualizacao de estado.
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
  })

  it('compoe a feature de missoes, e nao busca dado por conta propria', async () => {
    const fetchMock = stubPage()

    render(<Headquarters />)

    expect(screen.getByTestId('missions')).toBeInTheDocument()
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    // Uma ida a rede por recurso, e cada uma e de uma feature: a pagina nao
    // chama a API. Contar o total deixou de servir quando a pagina passou a
    // compor duas features (1b-2).
    expect(requestsTo(fetchMock, 'GET /api/missions')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/tutoring/status')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/tutoring/messages')).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('compoe o painel da Tifa ao lado do quadro', async () => {
    stubPage()

    render(<Headquarters />)

    expect(screen.getByRole('complementary', { name: 'Tifa' })).toBeInTheDocument()
    expect(screen.getByTestId('missions')).toBeInTheDocument()
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
  })
})
