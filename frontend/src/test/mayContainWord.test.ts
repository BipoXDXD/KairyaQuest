import { expect, test } from 'vitest'
import { mayContainWord } from './mayContainWord'

/**
 * `mayContainWord` é o filtro que antecede o parse nos testes de varredura de
 * AST: tem de dar `true` sempre que a palavra pode existir no código depois de
 * decodificados os escapes do JavaScript (a AST lê o texto já decodificado), e
 * pode errar para o lado do `true`, nunca do `false`.
 */

test.each([
  ['a palavra por extenso', 'const x = rng.random()'],
  ['a palavra dentro de outra', 'const randomness = 1'],
  ['um escape unicode de 4 dígitos', "Math['\\u0072andom']"],
  ['um escape unicode com chaves', "Math['\\u{72}andom']"],
  ['um escape unicode com chaves e zeros', "Math['\\u{000072}andom']"],
  ['um escape hexadecimal', "Math['ran\\x64om']"],
  ['um escape octal', "Math['\\162andom']"],
  ['um escape octal curto', "Math['ran\\144om']"],
  ['um escape de letra comum', "Math['ran\\dom']"],
  ['vários escapes seguidos', "Math['\\u0072\\x61\\156\\u{64}\\x6f\\u006d']"],
  ['a letra hexadecimal em maiúscula', "Math['ran\\x64\\x6Fm']"],
  ['continuação de linha LF', "Math['ran\\\ndom']"],
  ['continuação de linha CRLF', "Math['ran\\\r\ndom']"],
  ['continuação de linha U+2028', "Math['ran\\\u2028dom']"],
  ['várias continuações', "Math['r\\\na\\\nn\\\nd\\\no\\\nm']"],
  ['escape que na verdade decodifica outra letra (o filtro não decodifica)', "'ran\\u0078om'"],
])('aceita o texto com %s', (_name, text) => {
  expect(mayContainWord(text, 'random')).toBe(true)
})

test.each([
  ['texto sem a palavra', 'const x = 1'],
  ['só parte da palavra', 'const ran = 1; const dom = 2'],
  ['a palavra com uma letra trocada', 'rbndom'],
  ['escapes que não completam a palavra', 'const s = "a\\nb\\tc"'],
  ['expressão regular com barras', 'const re = /\\d+\\s*$/'],
  ['quebra de linha escapada entre palavras', 'const s = "ran\\ndom"'],
  ['palavra com letras em maiúscula', 'RANDOM'],
])('recusa o texto com %s', (_name, text) => {
  expect(mayContainWord(text, 'random')).toBe(false)
})

test('serve a qualquer palavra, inclusive com hífen', () => {
  expect(mayContainWord("import '../my-feature/x'", 'my-feature')).toBe(true)
  expect(mayContainWord("import '../my\\x2dfeature/x'", 'my-feature')).toBe(true)
  expect(mayContainWord("import '../my_feature/x'", 'my-feature')).toBe(false)
  expect(mayContainWord('a.b', 'a.b')).toBe(true)
  expect(mayContainWord('axb', 'a.b')).toBe(false)
})
