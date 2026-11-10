import { createContext } from 'react'
import type { Locale } from './locale'

export interface I18nValue {
  locale: Locale
  setLocale: (locale: Locale) => Promise<void>
}

/**
 * Sem valor padrao (`null`): um default falso esconderia o esquecimento do
 * `I18nProvider`. `useLocale` lanca quando le `null`.
 *
 * Fica num `.ts` separado porque o `react-refresh/only-export-components`
 * reprova `.tsx` que exporta algo alem de componentes.
 */
export const I18nContext = createContext<I18nValue | null>(null)
