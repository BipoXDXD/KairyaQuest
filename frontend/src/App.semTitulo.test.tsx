import { fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
import { routeFetch } from './test/fetchRoutes'
import { renderWithI18n } from './test/i18n'
import { stubViewport } from './test/viewport'

// Campanhas sem o titulo de nivel 1: o foco pos-navegacao nao acha alvo.
vi.mock('./pages/Campaigns', () => ({ Campaigns: () => <p data-testid="campaigns-stub" /> }))
vi.mock('./pages/Headquarters', () => ({ Headquarters: () => <p data-testid="hq-stub" /> }))

afterEach(() => {
  vi.unstubAllGlobals()
})

it('navegar para uma area sem titulo no DOM nao lança e a area abre', () => {
  stubViewport('desktop')
  routeFetch({})
  renderWithI18n(<App />)

  fireEvent.click(screen.getByTestId('nav-campaigns'))

  expect(screen.getByTestId('campaigns-stub')).toBeInTheDocument()
  expect(screen.getByTestId('nav-campaigns')).toHaveAttribute('aria-current', 'page')
})
