import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  jsonBody,
  pendingUntilAborted,
  requestsTo,
  routeFetch,
  type Route,
} from '../../test/fetchRoutes'
import { I18nProvider } from './I18nProvider'
import { LOCALE_STORAGE_KEY } from './locale'
import { LocaleSwitcher } from './LocaleSwitcher'
import { ServerLocaleSync } from './ServerLocaleSync'

/**
 * O boot: o provider sobe no idioma local e o `ServerLocaleSync` o confronta
 * com `GET /api/me`. Todo cenario declara as rotas `GET` e `PATCH`: sem a
 * `PATCH`, o `routeFetch` rejeitaria a chamada (mas a registraria), o
 * `saveLocale` silencioso engoliria a falha, e um cenario de sucesso passaria
 * sem provar nada.
 */

const GET_ME = 'GET /api/me'
const PATCH_ME = 'PATCH /api/me'

function held() {
  let release: (response: Response) => void = () => undefined
  const promise = new Promise<Response>((resolve) => {
    release = resolve
  })
  return { promise, release: (response: Response) => release(response) }
}

function meBody(locale: string | null): Response {
  return Response.json({ display_name: 'Aventureira', locale })
}

/** O PATCH do back devolve o corpo do GET com o idioma gravado. */
const patchOk: Route = (init) => {
  const corpo = jsonBody(init ?? {})
  const locale =
    typeof corpo === 'object' && corpo !== null && 'locale' in corpo ? corpo.locale : null
  return Response.json({ display_name: 'Aventureira', locale })
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function renderApp() {
  return render(
    <I18nProvider>
      <ServerLocaleSync />
      <LocaleSwitcher />
    </I18nProvider>,
  )
}

function simulateBrowserLanguage(language: string) {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(language)
}

describe('ServerLocaleSync', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('servidor vence o cache no boot', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'pt-BR')
    const mock = routeFetch({ [GET_ME]: () => meBody('en'), [PATCH_ME]: patchOk })

    renderApp()
    expect(document.documentElement.lang).toBe('pt-BR')

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en')
    })
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(requestsTo(mock, PATCH_ME)).toHaveLength(0)
  })

  it('GET falhando mantém o idioma local', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'pt-BR')
    const mock = routeFetch({
      [GET_ME]: () => new Response(null, { status: 500 }),
      [PATCH_ME]: patchOk,
    })

    renderApp()
    await waitFor(() => {
      expect(requestsTo(mock, GET_ME)).toHaveLength(1)
    })
    await settle()

    expect(document.documentElement.lang).toBe('pt-BR')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(requestsTo(mock, PATCH_ME)).toHaveLength(0)
  })

  it('locale desconhecido no GET não entra no cache', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'pt-BR')
    const mock = routeFetch({ [GET_ME]: () => meBody('fr'), [PATCH_ME]: patchOk })

    renderApp()
    await waitFor(() => {
      expect(requestsTo(mock, GET_ME)).toHaveLength(1)
    })
    await settle()

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pt-BR')
    expect(document.documentElement.lang).toBe('pt-BR')
    expect(requestsTo(mock, PATCH_ME)).toHaveLength(0)
  })

  it('escritas saem em fila', async () => {
    simulateBrowserLanguage('en-US')
    const silencioso = held()
    const mock = routeFetch({
      [GET_ME]: () => meBody(null),
      [PATCH_ME]: (init, call) => (call === 1 ? silencioso.promise : patchOk(init, call)),
    })

    renderApp()
    await waitFor(() => {
      expect(requestsTo(mock, PATCH_ME)).toHaveLength(1)
    })
    fireEvent.click(screen.getByRole('button', { name: 'PT, Português (Brasil)' }))
    await settle()
    // O clique ja aplicou na tela, mas o PATCH dele espera o silencioso.
    expect(document.documentElement.lang).toBe('pt-BR')
    expect(requestsTo(mock, PATCH_ME)).toHaveLength(1)

    silencioso.release(meBody('en'))
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
  })

  it('primeira visita em EN fica em EN', async () => {
    simulateBrowserLanguage('en-US')
    const mock = routeFetch({ [GET_ME]: () => meBody(null), [PATCH_ME]: patchOk })

    renderApp()
    await waitFor(() => {
      expect(requestsTo(mock, PATCH_ME)).toHaveLength(1)
    })
    await settle()

    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    const pedidos = requestsTo(mock, PATCH_ME)
    expect(pedidos).toHaveLength(1)
    expect(String(pedidos[0]?.body)).toBe('{"locale":"en"}')
  })

  it('primeira visita com PATCH silencioso falhando', async () => {
    simulateBrowserLanguage('en-US')
    const mock = routeFetch({
      [GET_ME]: () => meBody(null),
      [PATCH_ME]: () => new Response(null, { status: 503 }),
    })

    renderApp()
    await waitFor(() => {
      expect(requestsTo(mock, PATCH_ME)).toHaveLength(1)
    })
    await settle()

    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('GET lento não desfaz a escolha do usuário', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'pt-BR')
    const lento = held()
    routeFetch({ [GET_ME]: () => lento.promise, [PATCH_ME]: patchOk })

    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'EN, English' }))
    await settle()
    lento.release(meBody('pt-BR'))
    await settle()

    expect(screen.getByRole('button', { name: 'EN, English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('GET lento com null não grava por cima da escolha', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'pt-BR')
    const lento = held()
    const mock = routeFetch({ [GET_ME]: () => lento.promise, [PATCH_ME]: patchOk })

    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'EN, English' }))
    await settle()
    lento.release(meBody(null))
    await settle()

    expect(requestsTo(mock, PATCH_ME).map(jsonBody)).toEqual([{ locale: 'en' }])
  })

  it('sob StrictMode, o GET do efeito descartado não grava nada', async () => {
    // O `routeFetch` resolve mesmo depois do abort, como um `fetch` que nao
    // obedece ao signal: o primeiro efeito do StrictMode, ja limpo, nao pode
    // aplicar o resultado. Sem a guarda, o caso `null` sairia em dois PATCHes.
    simulateBrowserLanguage('en-US')
    const mock = routeFetch({ [GET_ME]: () => meBody(null), [PATCH_ME]: patchOk })

    render(
      <StrictMode>
        <I18nProvider>
          <ServerLocaleSync />
        </I18nProvider>
      </StrictMode>,
    )
    await waitFor(() => {
      expect(requestsTo(mock, GET_ME)).toHaveLength(2)
    })
    await settle()

    expect(requestsTo(mock, PATCH_ME).map(jsonBody)).toEqual([{ locale: 'en' }])
  })

  it('desmontar aborta o GET em curso', async () => {
    const mock = routeFetch({ [GET_ME]: pendingUntilAborted, [PATCH_ME]: patchOk })

    const { unmount } = renderApp()
    await settle()
    unmount()

    expect(requestsTo(mock, GET_ME)[0]?.signal?.aborted).toBe(true)
  })

  it('fora do I18nProvider lança', () => {
    // O React tambem registra o erro no console; silenciado so neste teste.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<ServerLocaleSync />)).toThrow(/I18nProvider/)
  })
})
