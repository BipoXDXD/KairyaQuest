import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeFetch } from '../../test/fetchRoutes'
import { renderWithI18n } from '../../test/i18n'
import { LOCALE_STORAGE_KEY } from './locale'
import { LocaleSwitcher } from './LocaleSwitcher'

describe('LocaleSwitcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('é um grupo nomeado pelo rótulo do idioma corrente', () => {
    renderWithI18n(<LocaleSwitcher />, { locale: 'en' })
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument()
  })

  it('expõe o nome completo, o lang e o estado de cada idioma', () => {
    renderWithI18n(<LocaleSwitcher />, { locale: 'pt-BR' })

    const pt = screen.getByRole('button', { name: 'PT, Português (Brasil)' })
    const enBtn = screen.getByRole('button', { name: 'EN, English' })
    expect(pt).toHaveAttribute('aria-pressed', 'true')
    expect(pt).toHaveAttribute('lang', 'pt-BR')
    expect(pt).toHaveTextContent('PT')
    expect(enBtn).toHaveAttribute('aria-pressed', 'false')
    expect(enBtn).toHaveAttribute('lang', 'en')
    expect(enBtn).toHaveTextContent('EN')
  })

  it('o nome acessível começa pelo texto visível (WCAG 2.5.3)', () => {
    renderWithI18n(<LocaleSwitcher />, { locale: 'en' })

    for (const button of screen.getAllByRole('button')) {
      const visible = button.textContent
      expect(visible).toMatch(/^(PT|EN)$/)
      expect(button.getAttribute('aria-label')?.startsWith(`${visible}, `)).toBe(true)
    }
  })

  it('cada botão tem alvo de toque de pelo menos 44×44 px', () => {
    // O jsdom nao calcula o CSS do Tailwind; a classe e o que garante os 44px
    // (escala 11 = 2.75rem), conferidos de fato no E2E.
    renderWithI18n(<LocaleSwitcher />)

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('min-h-11', 'min-w-11')
    }
  })

  it('clicar no outro idioma troca o idioma, o estado dos botões e o rótulo', () => {
    routeFetch({
      'PATCH /api/me': () => Response.json({ display_name: 'Aventureira', locale: 'en' }),
    })
    renderWithI18n(<LocaleSwitcher />, { locale: 'pt-BR' })

    fireEvent.click(screen.getByRole('button', { name: 'EN, English' }))

    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('button', { name: 'EN, English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'PT, Português (Brasil)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument()
  })

  it('clicar no idioma ativo não faz nada', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    renderWithI18n(<LocaleSwitcher />, { locale: 'pt-BR' })

    fireEvent.click(screen.getByRole('button', { name: 'PT, Português (Brasil)' }))

    expect(document.documentElement.lang).toBe('pt-BR')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
