import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeFetch } from '../../test/fetchRoutes'
import { renderWithI18n } from '../../test/i18n'
import type { MessageKey } from './catalog'
import { I18nProvider } from './I18nProvider'
import { LOCALE_STORAGE_KEY } from './locale'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { en } from './messages/en'
import { useLocale } from './useLocale'
import { useT } from './useT'

/** Mostra o idioma corrente e troca para `en` ao clicar em "trocar". */
function Probe() {
  const { locale, setLocale } = useLocale()
  return (
    <>
      <p data-testid="locale">{locale}</p>
      <button
        type="button"
        onClick={() => {
          void setLocale('en')
        }}
      >
        trocar
      </button>
    </>
  )
}

function Label({ k, vars }: { k: MessageKey; vars?: Readonly<Record<string, string>> }) {
  const t = useT()
  return <p>{t(k, vars)}</p>
}

/** A troca grava no servidor; a rota responde como o back (`PATCH /api/me`). */
function acceptLocalePatch() {
  routeFetch({
    'PATCH /api/me': () => Response.json({ display_name: 'Aventureira', locale: 'en' }),
  })
}

describe('I18nProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('atualiza <html lang> no boot e na troca, e grava o cache', () => {
    acceptLocalePatch()
    renderWithI18n(<Probe />, { locale: 'pt-BR' })
    expect(document.documentElement.lang).toBe('pt-BR')

    fireEvent.click(screen.getByRole('button', { name: 'trocar' }))

    expect(screen.getByTestId('locale')).toHaveTextContent('en')
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })

  it('setLocale resolve depois de aplicar o idioma: <html lang>, cache e seletor', async () => {
    acceptLocalePatch()
    const { result } = renderHook(() => useLocale(), {
      wrapper: ({ children }) => (
        <I18nProvider initialLocale="pt-BR">
          <LanguageSwitcher />
          {children}
        </I18nProvider>
      ),
    })

    await act(async () => {
      await expect(result.current.setLocale('en')).resolves.toBeUndefined()
    })

    expect(result.current.locale).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(screen.getByRole('button', { name: 'EN, English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('useT traduz pelo idioma corrente', () => {
    renderWithI18n(<Label k="shell.locale.label" />, { locale: 'en' })
    expect(screen.getByText(en['shell.locale.label'])).toBeInTheDocument()
  })

  it('useT repassa as variáveis', () => {
    renderWithI18n(<Label k="shell.locale.saveFailed" vars={{ language: 'English' }} />)
    expect(
      screen.getByText(
        'Não foi possível salvar o idioma English. O servidor não confirmou a troca. Tente de novo.',
      ),
    ).toBeInTheDocument()
  })

  it('renderWithI18n usa pt-BR por padrão', () => {
    renderWithI18n(<Probe />)
    expect(screen.getByTestId('locale')).toHaveTextContent('pt-BR')
  })

  it('useLocale fora do provider lança', () => {
    // O React tambem registra o erro no console; silenciado so neste teste.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => renderHook(() => useLocale())).toThrow(/I18nProvider/)
  })

  // Discriminante: `pt-PT` e `pt` esperam `pt-BR`, entao uma implementacao que
  // ignorasse o navigator.language (constante `en`, ou `undefined`) reprova.
  it.each<[string, string]>([
    ['pt-PT', 'pt-BR'],
    ['pt', 'pt-BR'],
    ['en-US', 'en'],
    ['de', 'en'],
    ['', 'en'],
  ])('sem initialLocale, navigator.language %j → %s', (language, expected) => {
    // Funciona porque src/test/setup.ts redefine `navigator.language` como
    // configurable; o afterEach de la desfaz este spy.
    vi.spyOn(navigator, 'language', 'get').mockReturnValue(language)
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('locale')).toHaveTextContent(expected)
    expect(document.documentElement.lang).toBe(expected)
  })

  it('sem initialLocale, o cache válido vence o navigator.language', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en')
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('locale')).toHaveTextContent('en')
  })
})
