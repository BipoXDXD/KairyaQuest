import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithI18n } from '../../test/i18n'
import { I18nContext } from '../i18n/i18nContext'
import { LOCALE_STORAGE_KEY, type Locale } from '../i18n/locale'
import { LanguageSwitcher } from './LanguageSwitcher'

/** Um provedor com `setLocale` controlado pelo teste; o idioma não muda sozinho. */
function renderWithSetLocale(setLocale: (next: Locale) => Promise<void>) {
  return render(
    <I18nContext value={{ locale: 'pt-BR', setLocale }}>
      <LanguageSwitcher />
    </I18nContext>,
  )
}

const SAVE_FAILED_EN =
  'Não foi possível salvar o idioma English. O servidor não confirmou a troca. Tente de novo.'

describe('LanguageSwitcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('é um grupo nomeado pelo rótulo do idioma corrente', () => {
    renderWithI18n(<LanguageSwitcher />, { locale: 'en' })
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument()
  })

  it('expõe o nome completo, o lang e o estado de cada idioma', () => {
    renderWithI18n(<LanguageSwitcher />, { locale: 'pt-BR' })

    const pt = screen.getByRole('button', { name: 'PT, Português (Brasil)' })
    const enBtn = screen.getByRole('button', { name: 'EN, English' })
    expect(pt).toHaveAttribute('aria-pressed', 'true')
    expect(pt).toHaveAttribute('lang', 'pt-BR')
    expect(pt).toHaveTextContent('PT')
    expect(enBtn).toHaveAttribute('aria-pressed', 'false')
    expect(enBtn).toHaveAttribute('lang', 'en')
    expect(enBtn).toHaveTextContent('EN')
  })

  it.each(['pt-BR', 'en'] as const)(
    'em %s, o nome acessível começa pelo texto visível (WCAG 2.5.3)',
    (locale) => {
      renderWithI18n(<LanguageSwitcher />, { locale })

      for (const button of screen.getAllByRole('button')) {
        const visible = button.textContent
        expect(visible).toMatch(/^(PT|EN)$/)
        expect(button.getAttribute('aria-label')?.startsWith(`${visible}, `)).toBe(true)
      }
      expect(screen.getByRole('button', { name: 'EN, English' })).toHaveTextContent('EN')
    },
  )

  it('cada botão é um Button tertiary com o texto curto visível do catálogo', () => {
    renderWithI18n(<LanguageSwitcher />, { locale: 'pt-BR' })
    const pt = screen.getByRole('button', { name: 'PT, Português (Brasil)' })
    expect(pt).toHaveAttribute('data-variant', 'tertiary')
    expect(pt).toHaveTextContent('PT')
    expect(screen.getByRole('button', { name: 'EN, English' })).toHaveAttribute(
      'data-variant',
      'tertiary',
    )
  })

  it('só o ativo tem marcador aria-hidden, um sinal de forma que o hover não imita', () => {
    renderWithI18n(<LanguageSwitcher />, { locale: 'pt-BR' })
    const markers = screen.getAllByTestId('language-current-marker')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toHaveAttribute('aria-hidden', 'true')
    expect(markers[0].querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'PT, Português (Brasil)' })).toContainElement(
      markers[0],
    )
  })

  it('o ativo tem sublinhado grosso, um sinal além da cor; o outro não', () => {
    renderWithI18n(<LanguageSwitcher />, { locale: 'pt-BR' })
    const ptText = screen.getByText('PT')
    const enText = screen.getByText('EN')
    expect(ptText).toHaveClass('underline', 'decoration-2')
    expect(enText).not.toHaveClass('underline')
  })

  it('cada botão tem alvo de toque de pelo menos 44×44 px', () => {
    // O jsdom nao calcula o CSS do Tailwind; a classe e o que garante os 44px
    // (escala 11 = 2.75rem), conferidos de fato no E2E.
    renderWithI18n(<LanguageSwitcher />)

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('min-h-11', 'min-w-11')
    }
  })

  it('clicar no outro idioma troca o idioma, o estado dos botões e o rótulo', () => {
    renderWithI18n(<LanguageSwitcher />, { locale: 'pt-BR' })

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
    renderWithI18n(<LanguageSwitcher />, { locale: 'pt-BR' })

    fireEvent.click(screen.getByRole('button', { name: 'PT, Português (Brasil)' }))

    expect(document.documentElement.lang).toBe('pt-BR')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('em repouso, a linha de retorno já existe, vazia e fora da vista', () => {
    renderWithI18n(<LanguageSwitcher />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')
    expect(status.parentElement).toHaveClass('sr-only')
  })

  it('setLocale rejeitado mostra StatusLine danger com o idioma e mantém aria-pressed no anterior', async () => {
    const setLocale = vi.fn(() => Promise.reject(new Error('503')))
    renderWithSetLocale(setLocale)

    fireEvent.click(screen.getByRole('button', { name: 'EN, English' }))

    const status = await screen.findByRole('status', { name: '' })
    await vi.waitFor(() => {
      expect(status).toHaveTextContent(SAVE_FAILED_EN)
    })
    expect(setLocale).toHaveBeenCalledWith('en')
    // O endônimo leva o `lang` do próprio idioma (WCAG 3.1.2).
    expect(within(status).getByText('English')).toHaveAttribute('lang', 'en')
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'danger')
    expect(screen.getByRole('status').parentElement).not.toHaveClass('sr-only')
    expect(status).toBeVisible()
    expect(screen.getByRole('button', { name: 'PT, Português (Brasil)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'EN, English' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('a rejeição atrasada de uma tentativa antiga não mostra falha depois que a nova deu certo', async () => {
    let rejectFirst: (reason: Error) => void = () => undefined
    const first = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject
    })
    const setLocale = vi
      .fn<(next: Locale) => Promise<void>>()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(undefined)
    renderWithSetLocale(setLocale)
    const en = screen.getByRole('button', { name: 'EN, English' })

    fireEvent.click(en)
    fireEvent.click(en)
    await act(async () => {
      rejectFirst(new Error('503 atrasado'))
      await first.catch(() => undefined)
    })

    expect(setLocale).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.getByRole('status').parentElement).toHaveClass('sr-only')
  })

  it('uma nova tentativa que dá certo limpa a mensagem de falha', async () => {
    const setLocale = vi
      .fn<(next: Locale) => Promise<void>>()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce(undefined)
    renderWithSetLocale(setLocale)
    const en = screen.getByRole('button', { name: 'EN, English' })

    fireEvent.click(en)
    await vi.waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(SAVE_FAILED_EN)
    })
    fireEvent.click(en)

    await vi.waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('')
    })
    expect(screen.getByRole('status').parentElement).toHaveClass('sr-only')
    expect(setLocale).toHaveBeenCalledTimes(2)
  })
})
