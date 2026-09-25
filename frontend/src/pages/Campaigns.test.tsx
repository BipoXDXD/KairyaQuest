import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeFetch } from '../test/fetchRoutes'
import { Campaigns } from './Campaigns'
import { CAMPAIGNS_HEADING_ID } from './headings'

describe('Campaigns', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('anuncia Campanhas no titulo de nivel 1, dentro do main, focavel por programa', () => {
    render(<Campaigns />)

    const main = screen.getByRole('main')
    const heading = within(main).getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Campanhas — planos de estudo')
    // O `App` leva o foco a este titulo depois de navegar (decisao K5 do
    // plano do C): precisa do `id` combinado e de ser focavel sem entrar na
    // ordem do Tab.
    expect(heading).toHaveAttribute('id', CAMPAIGNS_HEADING_ID)
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('diz que a trilha ainda nao chegou, sem prometer conteudo e sem ir a rede', () => {
    const fetchMock = routeFetch({})

    render(<Campaigns />)

    expect(screen.getByTestId('campaigns-placeholder')).toHaveTextContent(
      'A trilha da semana ainda não chegou a esta versão. A missão de hoje continua no Quartel-general.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
