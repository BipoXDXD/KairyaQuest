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
  return CATALOGS[locale][key].replace(PLACEHOLDER, (_placeholder, name: string) => {
    if (!Object.hasOwn(vars, name)) {
      throw new Error(`translate: a chave "${key}" exige a variável "${name}".`)
    }
    return String(vars[name])
  })
}
