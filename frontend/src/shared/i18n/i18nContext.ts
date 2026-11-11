import { createContext } from 'react'
import type { ServerLocale } from '../api/me'
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

/**
 * O que o `ServerLocaleSync` usa do provider no boot. Contexto separado do
 * `I18nContext`, e sem hook publico: so o `ServerLocaleSync` le este valor, e
 * o `useLocale` dos componentes continua expondo so o idioma e a troca.
 *
 * - `beginServerSync` devolve a geracao corrente; uma troca pelo seletor que
 *   comece depois a invalida.
 * - `applyServerLocale` aplica o resultado do `GET /api/me` so se a geracao
 *   ainda for a mesma.
 */
export interface ServerSyncValue {
  beginServerSync: () => number
  applyServerLocale: (result: ServerLocale, generation: number) => void
}

export const ServerSyncContext = createContext<ServerSyncValue | null>(null)
