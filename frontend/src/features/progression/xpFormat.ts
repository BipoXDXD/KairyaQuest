import type { Locale } from '../../shared/i18n/locale'

/**
 * Um `Intl.NumberFormat` por idioma, criado no primeiro uso e guardado: o
 * mesmo desenho do `formatterPerLocale` das datas. "12.345" em `pt-BR`,
 * "12,345" em `en`.
 */
const cache = new Map<Locale, Intl.NumberFormat>()

export function formatXp(value: number, locale: Locale): string {
  let formatter = cache.get(locale)
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale)
    cache.set(locale, formatter)
  }
  return formatter.format(value)
}
