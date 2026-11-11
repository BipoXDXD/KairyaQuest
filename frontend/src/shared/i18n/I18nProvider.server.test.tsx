import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonBody, requestsTo, routeFetch } from '../../test/fetchRoutes'
import { renderWithI18n } from '../../test/i18n'
import { I18nProvider } from './I18nProvider'
import { LOCALE_STORAGE_KEY } from './locale'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { en } from './messages/en'
import { ptBR } from './messages/pt-BR'
import { useLocale } from './useLocale'

/**
 * A troca pelo seletor fala com o servidor (`PATCH /api/me`) pelo provider.
 * Nenhum teste daqui monta o `ServerLocaleSync`: o boot tem o proprio arquivo,
 * e o isolamento do `renderWithI18n` (nenhum GET de boot) e um dos casos.
 */

const PATCH_ME = 'PATCH /api/me'

/** Uma resposta que so chega quando o teste chama `release`. */
function held() {
  let release: (response: Response) => void = () => undefined
  const promise = new Promise<Response>((resolve) => {
    release = resolve
  })
  return { promise, release: (response: Response) => release(response) }
}

/** O corpo do `PATCH /api/me` bem-sucedido, igual ao do back. */
function meBody(locale: string): Response {
  return Response.json({ display_name: 'Aventureira', locale })
}

/** Deixa as promessas pendentes andarem dentro do `act`. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function renderSwitcher() {
  return render(
    <I18nProvider initialLocale="pt-BR">
      <LanguageSwitcher />
    </I18nProvider>,
  )
}

describe('I18nProvider com o servidor', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('PATCH falhando reverte e avisa', async () => {
    routeFetch({ [PATCH_ME]: () => new Response(null, { status: 503 }) })
    renderSwitcher()

    fireEvent.click(screen.getByRole('button', { name: 'EN, English' }))
    expect(document.documentElement.lang).toBe('en')

    const status = screen.getByRole('status')
    await waitFor(() => {
      expect(status).toHaveTextContent(
        ptBR['shell.locale.saveFailed'].replace('{language}', 'English'),
      )
    })
    // O nome do idioma dentro da frase em PT leva o proprio `lang` (WCAG 3.1.2).
    const language = within(status).getByText('English')
    expect(language).toHaveAttribute('lang', 'en')
    expect(document.documentElement.lang).toBe('pt-BR')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pt-BR')
    expect(screen.getByRole('button', { name: 'PT, Português (Brasil)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('o aviso de falha nunca aparece com o idioma ainda trocado', async () => {
    routeFetch({ [PATCH_ME]: () => new Response(null, { status: 503 }) })
    renderSwitcher()
    const status = screen.getByRole('status')
    const pt = screen.getByRole('button', { name: 'PT, Português (Brasil)' })
    /** O estado da tela no primeiro commit que pos texto no aviso. */
    let seen: { lang: string; ptPressed: string | null } | null = null
    // O callback roda logo depois do commit que mexeu no aviso, antes de
    // qualquer trabalho agendado pelo React para depois (os passive effects).
    const observer = new MutationObserver(() => {
      if (seen === null && status.textContent !== '') {
        seen = {
          lang: document.documentElement.lang,
          ptPressed: pt.getAttribute('aria-pressed'),
        }
      }
    })
    observer.observe(status, { childList: true, subtree: true, characterData: true })

    fireEvent.click(screen.getByRole('button', { name: 'EN, English' }))
    await waitFor(() => {
      expect(seen).not.toBeNull()
    })
    observer.disconnect()

    expect(seen).toEqual({ lang: 'pt-BR', ptPressed: 'true' })
  })

  it('o nome do português na mensagem em EN leva lang pt-BR', async () => {
    routeFetch({ [PATCH_ME]: () => new Response(null, { status: 503 }) })
    render(
      <I18nProvider initialLocale="en">
        <LanguageSwitcher />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'PT, Português (Brasil)' }))

    const status = screen.getByRole('status')
    await waitFor(() => {
      expect(status).toHaveTextContent(
        en['shell.locale.saveFailed'].replace('{language}', 'Português (Brasil)'),
      )
    })
    expect(within(status).getByText('Português (Brasil)')).toHaveAttribute('lang', 'pt-BR')
  })

  it('troca antiga não desfaz a mais nova', async () => {
    const lento = held()
    const mock = routeFetch({
      [PATCH_ME]: (_init, call) => (call === 1 ? lento.promise : meBody('pt-BR')),
    })
    renderSwitcher()

    fireEvent.click(screen.getByRole('button', { name: 'EN, English' }))
    fireEvent.click(screen.getByRole('button', { name: 'PT, Português (Brasil)' }))
    await settle()
    // A fila: o PATCH `pt-BR` so parte depois que o `en` terminar.
    expect(requestsTo(mock, PATCH_ME)).toHaveLength(1)

    lento.release(new Response(null, { status: 503 }))
    await waitFor(() => {
      expect(requestsTo(mock, PATCH_ME)).toHaveLength(2)
    })
    await settle()

    expect(requestsTo(mock, PATCH_ME).map(jsonBody)).toEqual([
      { locale: 'en' },
      { locale: 'pt-BR' },
    ])
    expect(document.documentElement.lang).toBe('pt-BR')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pt-BR')
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('troca para o idioma atual não chama o servidor', async () => {
    const mock = routeFetch({ [PATCH_ME]: () => meBody('pt-BR') })
    const { result } = renderHook(() => useLocale(), {
      wrapper: ({ children }) => <I18nProvider initialLocale="pt-BR">{children}</I18nProvider>,
    })

    await act(async () => {
      await expect(result.current.setLocale('pt-BR')).resolves.toBeUndefined()
    })

    expect(mock).not.toHaveBeenCalled()
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull()
  })

  it('a falha some na próxima troca', async () => {
    routeFetch({
      [PATCH_ME]: (_init, call) =>
        call === 1 ? new Response(null, { status: 503 }) : meBody('en'),
    })
    renderSwitcher()

    fireEvent.click(screen.getByRole('button', { name: 'EN, English' }))
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).not.toBe('')
    })
    fireEvent.click(screen.getByRole('button', { name: 'EN, English' }))
    await settle()

    expect(screen.getByRole('status').textContent).toBe('')
    expect(document.documentElement.lang).toBe('en')
  })

  it('renderWithI18n não chama o servidor', async () => {
    const mock = routeFetch({})

    renderWithI18n(<LanguageSwitcher />)
    await settle()

    expect(mock).not.toHaveBeenCalled()
  })
})
