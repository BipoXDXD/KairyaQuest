import type { Locale } from '../../shared/i18n/locale'
import { formatterPerLocale } from '../../shared/lib/formatterPerLocale'

/**
 * A data em que a conquista foi destravada, em Sao Paulo (decisao P5 do plano
 * do D). `unlocked_at` e um INSTANTE, nao uma data civil: mostrado no fuso do
 * navegador, a mesma conquista mudaria de dia conforme o computador. O idioma
 * muda so a ordem (dia/mes em `pt-BR`, mes/dia em `en`), nunca o fuso.
 */
const unlockedFormatter = formatterPerLocale({
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatUnlockedAt(instant: string, locale: Locale): string {
  return unlockedFormatter(locale).format(new Date(instant))
}
