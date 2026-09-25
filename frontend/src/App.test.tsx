import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { requestsTo, routeFetch } from './test/fetchRoutes'
import { stubViewport } from './test/viewport'

/** O que o Quartel-general busca na montagem: ciclo, missoes, status e historico da Tifa. */
function stubPage() {
  stubViewport('desktop')
  return routeFetch({
    'GET /api/cycle': () =>
      Response.json({
        today: '2026-09-23',
        mission: null,
        streak: 0,
        days_to_milestone: 7,
        special: null,
      }),
    'GET /api/missions': () => Response.json([]),
    'GET /api/tutoring/status': () => Response.json({ available: true }),
    'GET /api/tutoring/messages': () => Response.json([]),
  })
}

/** Espera os efeitos do Quartel-general assentarem. */
async function settleHeadquarters() {
  await screen.findByTestId('missions-empty')
  await screen.findByTestId('tutor-greeting')
  await screen.findByTestId('cycle-no-plan')
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('monta o Quartel-general como tela inicial', async () => {
    stubPage()

    render(<App />)

    expect(screen.getByTestId('headquarters')).toBeVisible()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/quartel-general/i)
    await settleHeadquarters()
  })

  it('abre no Quartel-general, marcado como area atual na navegacao', async () => {
    stubPage()

    render(<App />)

    expect(screen.getByRole('navigation', { name: 'Áreas' })).toBeInTheDocument()
    expect(screen.getByTestId('nav-headquarters')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-campaigns')).not.toHaveAttribute('aria-current')
    expect(screen.queryByTestId('campaigns')).not.toBeInTheDocument()
    await settleHeadquarters()
  })

  it('Campanhas abre pela navegacao: o titulo dela recebe o foco e o Quartel-general fica oculto', async () => {
    stubPage()
    render(<App />)
    await settleHeadquarters()

    fireEvent.click(screen.getByTestId('nav-campaigns'))

    const heading = screen.getByRole('heading', { level: 1, name: 'Campanhas — planos de estudo' })
    expect(heading).toBeVisible()
    expect(heading).toHaveFocus()
    expect(screen.getByTestId('headquarters')).not.toBeVisible()
    expect(screen.getByTestId('nav-campaigns')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-headquarters')).not.toHaveAttribute('aria-current')
  })

  it('voltar ao Quartel-general devolve o foco ao titulo dele e desmonta Campanhas', async () => {
    stubPage()
    render(<App />)
    await settleHeadquarters()

    fireEvent.click(screen.getByTestId('nav-campaigns'))
    fireEvent.click(screen.getByTestId('nav-headquarters'))

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(/quartel-general/i)
    expect(heading).toHaveFocus()
    expect(screen.getByTestId('headquarters')).toBeVisible()
    expect(screen.queryByTestId('campaigns')).not.toBeInTheDocument()
    expect(screen.getByTestId('nav-headquarters')).toHaveAttribute('aria-current', 'page')
  })

  it('so um main visivel; o do Quartel-general oculto tem o proprio hidden', async () => {
    stubPage()
    render(<App />)
    await settleHeadquarters()

    fireEvent.click(screen.getByTestId('nav-campaigns'))

    // O HTML proibe mais de um `main` SEM o atributo `hidden` no proprio
    // elemento -- um ancestral oculto nao basta para a regra.
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByTestId('headquarters')).toHaveAttribute('hidden')
  })

  it('o rascunho da Tifa sobrevive a ida e volta por Campanhas, sem remontar nada', async () => {
    const fetchMock = stubPage()
    render(<App />)
    await settleHeadquarters()
    fireEvent.change(screen.getByTestId('tutor-input'), {
      target: { value: 'Como estudo recursao?' },
    })

    fireEvent.click(screen.getByTestId('nav-campaigns'))
    fireEvent.click(screen.getByTestId('nav-headquarters'))

    // Desmontar o Quartel-general desmontaria o painel: o rascunho sumiria e
    // um stream em andamento seria abortado (decisao K2 do plano do C).
    expect(screen.getByTestId('tutor-input')).toHaveValue('Como estudo recursao?')
    expect(requestsTo(fetchMock, 'GET /api/missions')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/tutoring/messages')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(1)
  })
})
