/** Os idiomas da interface. Os codigos sao os mesmos de `users.locale`. */
export type Locale = 'pt-BR' | 'en'

export const LOCALES: readonly Locale[] = ['pt-BR', 'en']

export const LOCALE_STORAGE_KEY = 'kairyaquest.locale'

/** O idioma, se `value` for exatamente um dos dois codigos; senao `null`. */
export function parseLocale(value: unknown): Locale | null {
  return LOCALES.find((locale) => locale === value) ?? null
}

/** `pt-BR` para qualquer variante de portugues; `en` para todo o resto. */
export function detectLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

/**
 * O storage devolvido por `getStorage`, ou `null` se o proprio acesso lancar:
 * com cookies bloqueados, ler `window.localStorage` ja da SecurityError.
 */
export function openStorage(getStorage: () => Storage): Storage | null {
  try {
    return getStorage()
  } catch {
    // Sem storage o app sobe do mesmo jeito: o cache so evita o "pisca" do
    // idioma no boot, e a deteccao pelo navegador cobre a falta dele.
    return null
  }
}

export function readCachedLocale(storage: Storage | null): Locale | null {
  if (storage === null) {
    return null
  }
  try {
    return parseLocale(storage.getItem(LOCALE_STORAGE_KEY))
  } catch {
    // Modo privado ou storage bloqueado: o cache so evita o "pisca" do idioma
    // no boot, e o servidor continua sendo a fonte. Sem ele, vale a deteccao.
    return null
  }
}

export function writeCachedLocale(storage: Storage | null, locale: Locale): void {
  if (storage === null) {
    return
  }
  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Cota cheia ou storage bloqueado: perder o cache custa so o "pisca" do
    // idioma no proximo boot; o idioma escolhido continua valendo na sessao.
  }
}

/** O idioma do boot: o cache valido e, sem ele, o do navegador. */
export function initialLocale(storage: Storage | null, language: string | undefined): Locale {
  return readCachedLocale(storage) ?? detectLocale(language)
}
