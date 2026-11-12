/**
 * Filtro textual barato para os testes de varredura de AST: diz se `word` PODE
 * existir no código depois de decodificados os escapes do JavaScript.
 *
 * O parse é o custo dessas varreduras, e a maioria dos arquivos não menciona a
 * palavra que a regra procura. Mas `includes(word)` deixaria escapar o que a AST
 * lê já decodificado -- `Math['random']`, `Math.random`,
 * `'../\x6bairya/x'` --, e uma regra de fitness que deixa passar o que a AST
 * pegaria está enfraquecida. Por isso cada letra da palavra casa com ela mesma
 * ou com QUALQUER escape (`\uXXXX`, `\u{X...}`, `\xXX`, octal, `\c`), e uma
 * continuação de linha (`\` + quebra, que decodifica para nada) pode vir entre
 * as letras.
 *
 * É condição necessária, nunca suficiente: erra só para o lado do `true` (o
 * escape não é decodificado, então `ranxom` passa, e o parse decide). Quem
 * recebe `false` não tem como conter a palavra, por nenhuma grafia.
 */

const ESCAPE = String.raw`\\(?:u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[0-7]{1,3}|[^])`
const LINE_CONTINUATION = String.raw`\\(?:\r\n|[\n\r\u2028\u2029])`

const patterns = new Map<string, RegExp>()

function escapeForRegExp(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\/-]/g, String.raw`\$&`)
}

function patternFor(word: string): RegExp {
  const cached = patterns.get(word)
  if (cached !== undefined) return cached
  const letters = [...word].map((char) => `(?:${escapeForRegExp(char)}|${ESCAPE})`)
  const pattern = new RegExp(letters.join(`(?:${LINE_CONTINUATION})*`))
  patterns.set(word, pattern)
  return pattern
}

/** `true` se `word` pode estar em `text`, com ou sem escapes; `false` garante que não está. */
export function mayContainWord(text: string, word: string): boolean {
  return patternFor(word).test(text)
}
