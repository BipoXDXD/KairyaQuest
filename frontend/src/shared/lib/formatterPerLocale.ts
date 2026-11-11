import type { Locale } from '../i18n/locale'

/**
 * Um `Intl.DateTimeFormat` por idioma para as `options` dadas, criado no
 * primeiro uso e guardado num `Map` do fechamento: criar um formatador a cada
 * render e caro, e so ha dois idiomas. Usado pelos formatadores de data civil
 * (`civilDate.ts`) e de prazo (`deadline.ts`).
 */
export function formatterPerLocale(
  options: Intl.DateTimeFormatOptions,
): (locale: Locale) => Intl.DateTimeFormat {
  const cache = new Map<Locale, Intl.DateTimeFormat>()
  return (locale) => {
    const cached = cache.get(locale)
    if (cached !== undefined) {
      return cached
    }
    const created = new Intl.DateTimeFormat(locale, options)
    cache.set(locale, created)
    return created
  }
}
