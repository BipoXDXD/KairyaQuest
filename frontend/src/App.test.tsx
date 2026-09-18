import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('monta o Quartel-general como tela inicial', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([])))

    render(<App />)

    expect(screen.getByTestId('headquarters')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/quartel-general/i)
    await screen.findByTestId('missions-empty')
  })
})
