/// <reference types="node" />
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import { mayContainWord } from './mayContainWord'
import { listSources, readSource } from './readSource'

/**
 * A semente da Kairya é injetada (`random` no provider): nenhum teste usa
 * `Math.random`, ou a fala escolhida mudaria de uma execução para outra e o
 * teste ficaria intermitente. A regra lê a AST, então pega a chamada,
 * `Math['random']`, a referência sem chamada, a desestruturação
 * (`const { random } = Math`) e o uso dentro de `${...}`, e não confunde código
 * com comentário ou texto de string. Espiar a função
 * (`vi.spyOn(Math, 'random')`) não é usá-la e continua permitido, pois é como o
 * teste do ramo padrão do `useKairyaMood` prova o `random` de produção.
 */

const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self'])

/** `Math` ou `globalThis.Math` (e `window`/`self`). */
function isMath(node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node)) return isMath(node.expression)
  if (ts.isIdentifier(node)) return node.text === 'Math'
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'Math' &&
    ts.isIdentifier(node.expression) &&
    GLOBAL_OBJECTS.has(node.expression.text)
  )
}

function isRandomLiteral(node: ts.Expression): boolean {
  return (
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === 'random'
  )
}

function propertyNameText(name: ts.PropertyName | undefined): string | undefined {
  return name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name))
    ? name.text
    : undefined
}

function takesRandomFromMath(node: ts.Node): boolean {
  // `const { random } = Math` / `const { random: r } = Math`
  if (
    ts.isVariableDeclaration(node) &&
    ts.isObjectBindingPattern(node.name) &&
    node.initializer !== undefined &&
    isMath(node.initializer)
  ) {
    return node.name.elements.some(
      (el) =>
        (propertyNameText(el.propertyName) ?? propertyNameText(el.name as ts.PropertyName)) ===
        'random',
    )
  }
  // `({ random } = Math)`
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isObjectLiteralExpression(node.left) &&
    isMath(node.right)
  ) {
    return node.left.properties.some(
      (p) =>
        (ts.isShorthandPropertyAssignment(p) || ts.isPropertyAssignment(p)) &&
        propertyNameText(p.name) === 'random',
    )
  }
  return false
}

function usesRandomOfMath(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node))
    return node.name.text === 'random' && isMath(node.expression)
  if (ts.isElementAccessExpression(node)) {
    return isRandomLiteral(node.argumentExpression) && isMath(node.expression)
  }
  return takesRandomFromMath(node)
}

/** Quantos textos já passaram pelo parse; os testes do filtro leem a diferença. */
let parsedCount = 0

/**
 * Filtro barato antes do parse (`mayContainWord`): o arquivo só tem como usar
 * `Math.random` se a palavra `random` puder existir nele, escrita por extenso
 * ou com escapes (`Math['\u0072andom']`, `Math.\u0072andom`), que a AST lê já
 * decodificados. Só o texto que passa por aqui paga o parse, que é o custo da
 * varredura. Condição necessária, nunca suficiente: quem passa é decidido pela
 * AST.
 */
function mayUseMathRandom(text: string): boolean {
  return mayContainWord(text, 'random')
}

/** `true` se o código do arquivo usa `Math.random` (chamada, referência, colchetes ou desestruturação). */
function usesMathRandom(text: string, fileName = 'amostra.ts'): boolean {
  if (!mayUseMathRandom(text)) return false
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  parsedCount += 1
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind)
  const visit = (node: ts.Node): boolean =>
    usesRandomOfMath(node) || ts.forEachChild(node, visit) === true
  return visit(source)
}

// Montadas em partes para este arquivo não casar com a própria regra de texto.
const M = 'Math'
const R = 'random'
const SAMPLES: Array<[string, string]> = [
  ['a chamada', `const seed = ${M}.${R}()`],
  ['a chamada com espaços', `const seed = ${M} . ${R} ()`],
  ['o acesso entre aspas simples', `const seed = ${M}['${R}']()`],
  ['o acesso entre aspas duplas', `const seed = ${M}["${R}"]()`],
  ['o acesso entre crases', `const seed = ${M}[\`${R}\`]()`],
  ['a referência sem chamada', `const r = ${M}.${R}`],
  ['a referência passada adiante', `const gen = pick(${M}.${R})`],
  ['o uso dentro de ${...}', `const id = \`x-\${${M}.${R}()}\``],
  ['a desestruturação', `const { ${R} } = ${M}`],
  ['a desestruturação com renome', `const { ${R}: r } = ${M}`],
  ['a atribuição desestruturada', `let r; ({ ${R}: r } = ${M})`],
  ['o acesso por globalThis', `const seed = globalThis.${M}.${R}()`],
  ['a chamada depois de uma string com //', `const u = "http://a"; ${M}.${R}()`],
]

test.each(SAMPLES)('a regra acusa %s', (_name, sample) => {
  expect(usesMathRandom(sample)).toBe(true)
})

test('a regra acusa Math.random depois de um apóstrofo em JSX', () => {
  const sample = `const a = <p>don't</p>; const b = ${M}.${R}(); const c = <p>it's</p>`
  expect(usesMathRandom(sample, 'amostra.tsx')).toBe(true)
})

/**
 * Casos que um filtro textual ingênuo (`text.includes('random')`) deixaria
 * escapar: a palavra só existe depois de decodificada. O detector de AST lê o
 * texto já decodificado (`node.text`), então a regra continua acusando todos, e
 * o filtro que antecede o parse precisa deixá-los passar.
 */
const ESCAPED_SAMPLES: Array<[string, string]> = [
  ['o acesso com escape unicode no colchete', `${M}['\\u0072andom']()`],
  ['o acesso com escape unicode no identificador', `${M}.\\u0072andom()`],
  ['o acesso com escape hexadecimal', `${M}['ran\\x64om']()`],
  ['o acesso com escape de letra comum', `${M}['ran\\dom']()`],
  ['o acesso com continuação de linha', `${M}['ran\\\ndom']()`],
  ['o acesso com escape no template sem substituição', `${M}[\`\\u0072andom\`]()`],
  ['a desestruturação com escape no identificador', `const { \\u0072andom } = ${M}`],
  ['a desestruturação com escape no nome entre aspas', `const { 'ran\\x64om': r } = ${M}`],
  ['a atribuição desestruturada com escape', `let r; ({ \\u0072andom: r } = ${M})`],
]

test.each(ESCAPED_SAMPLES)('a regra acusa %s', (_name, sample) => {
  expect(usesMathRandom(sample)).toBe(true)
})

test('a regra acusa o uso mesmo quando a palavra só aparece uma vez, no fim de um arquivo longo', () => {
  const filler = 'const a = 1\n'.repeat(500)
  expect(usesMathRandom(`${filler}const seed = ${M}.${R}()`)).toBe(true)
})

test('a regra não acusa quem só cita a palavra sem usar Math.random', () => {
  expect(usesMathRandom(`const ${R} = 1; rng.${R}(); const x = { ${R}: 2 }`)).toBe(false)
  expect(usesMathRandom('const nome = "ran\\u0064om"')).toBe(false)
})

describe('o filtro textual que antecede o parse', () => {
  /** Quantos parses o `action` provocou. */
  function parsesDuring(action: () => void): number {
    const before = parsedCount
    action()
    return parsedCount - before
  }

  test('poupa o parse do texto que não tem a palavra', () => {
    expect(parsesDuring(() => usesMathRandom('const x = Math.floor(1.5)'))).toBe(0)
  })

  test('poupa o parse do texto com escapes que não formam a palavra', () => {
    const sample = 'const s = "a\\nb"; const re = /\\d+/; const u = "\\u0062"'
    expect(parsesDuring(() => usesMathRandom(sample))).toBe(0)
  })

  test.each([
    ['a palavra', `const seed = ${M}.${R}()`],
    ['a palavra escrita com escape', "const s = 'ran\\u0064om'"],
  ])('faz o parse quando o texto tem %s', (_name, sample) => {
    expect(parsesDuring(() => usesMathRandom(sample))).toBe(1)
  })
})

test('a regra deixa passar o espião de Math.random', () => {
  expect(usesMathRandom("vi.spyOn(Math, 'random').mockReturnValue(0.5)")).toBe(false)
})

test('a regra ignora Math.random citado em comentário ou em texto de string', () => {
  expect(usesMathRandom(`// ${M}.${R}() é proibido`)).toBe(false)
  expect(usesMathRandom(`/* ${M}.${R} */ const x = 1`)).toBe(false)
  expect(usesMathRandom(`it('usa o timer e ${M}.${R}', () => {})`)).toBe(false)
  expect(usesMathRandom(`const t = \`usa ${M}.${R}\``)).toBe(false)
})

test('a regra não confunde outros membros de Math nem outro objeto', () => {
  expect(usesMathRandom('Math.floor(x)')).toBe(false)
  expect(usesMathRandom('const randomness = 1')).toBe(false)
  expect(usesMathRandom('const { floor } = Math')).toBe(false)
  expect(usesMathRandom('rng.random()')).toBe(false)
})

const SCANNED_SOURCES = ['src/**/*.test.{ts,tsx}', 'src/test/*.ts', 'tests/e2e/**/*.ts']
const SELF = 'src/test/noMathRandom.test.ts'

/** Testes unitários, helpers de `src/test` e e2e; este arquivo fica de fora porque tem as amostras. */
function scannedFiles(): string[] {
  return [...new Set(SCANNED_SOURCES.flatMap((pattern) => listSources(pattern)))]
    .filter((path) => path !== SELF)
    .sort()
}

test('a varredura inclui o teste que espia Math.random, os helpers e os e2e', () => {
  expect(scannedFiles()).toEqual(
    expect.arrayContaining([
      'src/features/kairya/useKairyaMood.test.tsx',
      'src/test/readSource.ts',
      'tests/e2e/falso.ts',
      'tests/e2e/cycle.spec.ts',
    ]),
  )
})

test('nenhum teste usa Math.random, e a varredura só faz o parse de metade dos arquivos, no máximo', () => {
  const files = scannedFiles()
  const parsedBefore = parsedCount
  const offenders = files.filter((path) => usesMathRandom(readSource(path), path))
  expect(offenders).toEqual([])
  expect(parsedCount - parsedBefore).toBeLessThanOrEqual(files.length / 2)
})
