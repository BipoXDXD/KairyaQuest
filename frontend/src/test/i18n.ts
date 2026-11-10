import { render } from '@testing-library/react'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { I18nProvider } from '../shared/i18n/I18nProvider'
import type { Locale } from '../shared/i18n/locale'

/**
 * `render` dentro do `I18nProvider`, com o idioma fixo (padrao `pt-BR`, o dos
 * testes existentes). O idioma vem da opcao, e nao do `navigator.language` nem
 * do cache, para o teste nao depender do ambiente.
 *
 * Arquivo `.ts` com `createElement`, e nao `.tsx`: o
 * `react-refresh/only-export-components` reprova `.tsx` que exporta funcao
 * que nao e componente.
 */
export function renderWithI18n(ui: ReactElement, opts: { locale?: Locale } = {}) {
  const locale = opts.locale ?? 'pt-BR'
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(I18nProvider, { initialLocale: locale, children })
  return render(ui, { wrapper })
}
