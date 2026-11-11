import { useCallback } from 'react'
import { translate, type MessageKey, type MessageVars } from './catalog'
import { useLocale } from './useLocale'

/** A funcao de traducao do idioma corrente; muda de identidade so na troca. */
export function useT(): (key: MessageKey, vars?: MessageVars) => string {
  const { locale } = useLocale()
  return useCallback((key, vars) => translate(locale, key, vars), [locale])
}

/** A funcao de traducao, como os ajudantes de texto fora do componente a recebem. */
export type Translate = ReturnType<typeof useT>
