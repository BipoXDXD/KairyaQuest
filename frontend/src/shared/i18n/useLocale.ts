import { useContext } from 'react'
import { I18nContext, type I18nValue } from './i18nContext'

/** O idioma corrente e a troca. Lanca fora de um `I18nProvider`. */
export function useLocale(): I18nValue {
  const value = useContext(I18nContext)
  if (value === null) {
    throw new Error('useLocale e useT precisam de um <I18nProvider> acima na árvore.')
  }
  return value
}
