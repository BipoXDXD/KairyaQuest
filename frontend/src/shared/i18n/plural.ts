import type { Locale } from './locale'

/**
 * Uma regra por idioma, criada uma vez no carregamento do modulo. Um objeto
 * por `Locale`, e nao um `Map`: o tipo garante a entrada de cada idioma, sem
 * `get` que pode devolver `undefined`.
 */
const RULES: Readonly<Record<Locale, Intl.PluralRules>> = {
  'pt-BR': new Intl.PluralRules('pt-BR'),
  en: new Intl.PluralRules('en'),
}

/**
 * A forma de `forms` para `n` no idioma, pela regra CLDR.
 *
 * `zero` e conferida antes, por `n === 0`, e vale em qualquer idioma: no CLDR
 * `pt` o 0 cai em `one`, e textos como "Restam 0 caracteres." precisam de uma
 * forma propria. Fora dela, toda categoria diferente de `one` vira `other`.
 */
export function plural<K extends string>(
  locale: Locale,
  n: number,
  forms: { zero?: K; one: K; other: K },
): K {
  if (n === 0 && forms.zero !== undefined) {
    return forms.zero
  }
  return RULES[locale].select(n) === 'one' ? forms.one : forms.other
}
