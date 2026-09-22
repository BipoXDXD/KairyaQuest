import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { routeFetch } from './test/fetchRoutes'
import { stubViewport } from './test/viewport'

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('monta o Quartel-general como tela inicial', async () => {
    stubViewport('desktop')
    routeFetch({
      'GET /api/missions': () => Response.json([]),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json([]),
    })

    render(<App />)

    expect(screen.getByTestId('headquarters')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/quartel-general/i)
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
  })
})
