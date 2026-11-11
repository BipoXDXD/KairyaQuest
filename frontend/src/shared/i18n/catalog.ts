import type { Locale } from './locale'
import { en } from './messages/en'
import { ptBR } from './messages/pt-BR'

export type MessageKey = keyof typeof ptBR

export type Messages = Readonly<Record<MessageKey, string>>

export type MessageVars = Readonly<Record<string, string | number>>

export const CATALOGS: Readonly<Record<Locale, Messages>> = { 'pt-BR': ptBR, en }

const PLACEHOLDER = /\{(\w+)\}/g

/**
 * O texto de `key` no idioma, com cada `{nome}` trocado por `String(vars.nome)`.
 *
 * Faltar uma variavel exigida e erro de programacao, nao de dado: lanca, com a
 * chave e o nome da variavel, em vez de mostrar `{nome}` cru na tela.
 */
export function translate(locale: Locale, key: MessageKey, vars: MessageVars = {}): string {
  return CATALOGS[locale][key].replace(PLACEHOLDER, (_placeholder, name: string) =>
    String(requireVar(key, vars, name)),
  )
}

/**
 * O texto de `key` em partes: os trechos de texto, e no lugar de cada `{nome}`
 * o proprio `vars.nome`, sem converter. Serve para a variavel virar um elemento
 * com marcacao propria, como o nome de um idioma com `lang` (WCAG 3.1.2).
 */
export function translateParts<T>(
  locale: Locale,
  key: MessageKey,
  vars: Readonly<Record<string, T>>,
): (string | T)[] {
  // `split` com o grupo de captura alterna texto e nome: os indices impares
  // sao os nomes das variaveis.
  return CATALOGS[locale][key]
    .split(PLACEHOLDER)
    .map((piece, index) => (index % 2 === 0 ? piece : requireVar(key, vars, piece)))
    .filter((part) => part !== '')
}

function requireVar<T>(key: MessageKey, vars: Readonly<Record<string, T>>, name: string): T {
  // `hasOwn` e nao so `undefined`: `vars.toString` existe pelo prototipo.
  const value = vars[name]
  if (!Object.hasOwn(vars, name) || value === undefined) {
    throw new Error(`translate: a chave "${key}" exige a variável "${name}".`)
  }
  return value
}
