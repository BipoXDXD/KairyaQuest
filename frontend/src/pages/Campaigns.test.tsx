import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeFetch } from '../test/fetchRoutes'
import { Campaigns } from './Campaigns'
import { CAMPAIGNS_HEADING_ID } from './headings'

describe('Campaigns', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('anuncia Campanhas no titulo de nivel 1, dentro do main, focavel por programa', async () => {
    routeFetch({ 'GET /api/plans/current': () => Response.json({ plan: null }) })

    render(<Campaigns />)

    const main = screen.getByRole('main')
    const heading = within(main).getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Campanhas — planos de estudo')
    // O `App` leva o foco a este titulo depois de navegar (decisao K5 do
    // plano do C): precisa do `id` combinado e de ser focavel sem entrar na
    // ordem do Tab.
    expect(heading).toHaveAttribute('id', CAMPAIGNS_HEADING_ID)
    expect(heading).toHaveAttribute('tabindex', '-1')
    // Aguarda o `GET /api/plans/current` da montagem assentar: sem isto, a
    // resposta chega depois do fim do teste e o React avisa "not wrapped in
    // act(...)" (achado m2 da revisao final do C).
    expect(await screen.findByTestId('trail-no-plan')).toBeInTheDocument()
  })

  it('compoe a trilha da semana', async () => {
    routeFetch({ 'GET /api/plans/current': () => Response.json({ plan: null }) })

    render(<Campaigns />)

    expect(await screen.findByTestId('trail-no-plan')).toBeInTheDocument()
  })
})
