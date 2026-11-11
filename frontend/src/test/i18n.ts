import { render } from '@testing-library/react'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { I18nProvider } from '../shared/i18n/I18nProvider'
import type { Locale } from '../shared/i18n/locale'

/**
 * `render` dentro do `I18nProvider`, com o idioma fixo (padrao `pt-BR`, o dos
 * testes existentes). O idioma vem da opcao, e nao do `navigator.language` nem
 * do cache, para o teste nao depender do ambiente.
 *
 * `strict` liga o StrictMode pela opcao do Testing Library, que o poe na RAIZ,
 * por fora do provider. Um `<StrictMode>` dentro da arvore ficaria abaixo do
 * `wrapper`, e ali o React nao repete os efeitos da montagem -- o teste que
 * prova a limpeza do efeito passaria sem exercita-la.
 *
 * Arquivo `.ts` com `createElement`, e nao `.tsx`: o
 * `react-refresh/only-export-components` reprova `.tsx` que exporta funcao
 * que nao e componente.
 */
export function renderWithI18n(ui: ReactElement, opts: { locale?: Locale; strict?: boolean } = {}) {
  const locale = opts.locale ?? 'pt-BR'
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(I18nProvider, { initialLocale: locale, children })
  return render(ui, { wrapper, reactStrictMode: opts.strict ?? false })
}

/**
 * O texto exibido de uma falha HTTP de carga (`apiErrorText` do `kind`
 * `http`), escrito a mao nos dois idiomas: o teste compara com o literal, e
 * nao com o catalogo, para pegar uma chave trocada.
 */
export const HTTP_FAILURE_TEXT = {
  'pt-BR': 'O servidor não conseguiu atender o pedido. Tente de novo em instantes.',
  en: "The request didn't go through. The server returned an error. Try again in a moment.",
} as const satisfies Record<Locale, string>
