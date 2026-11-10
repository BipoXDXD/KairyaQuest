import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext } from './i18nContext'
import { initialLocale as bootLocale, openStorage, writeCachedLocale, type Locale } from './locale'

interface I18nProviderProps {
  children: ReactNode
  /** Idioma fixo (testes). Sem ele, vale o cache e depois o navegador. */
  initialLocale?: Locale
}

function browserStorage(): Storage | null {
  return openStorage(() => window.localStorage)
}

/**
 * Guarda o idioma corrente, o espelha em `<html lang>` e no cache local.
 *
 * Neste incremento a troca e so local: a gravacao em `users.locale` entra
 * quando o front passar a falar com `/api/me`.
 */
export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initialLocale ?? bootLocale(browserStorage(), navigator.language),
  )

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    writeCachedLocale(browserStorage(), next)
    return Promise.resolve()
  }, [])

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])

  return <I18nContext value={value}>{children}</I18nContext>
}
