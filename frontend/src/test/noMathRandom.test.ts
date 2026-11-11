/// <reference types="node" />
import ts from 'typescript'
import { expect, test } from 'vitest'
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

/** `true` se o código do arquivo usa `Math.random` (chamada, referência, colchetes ou desestruturação). */
function usesMathRandom(text: string, fileName = 'amostra.ts'): boolean {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
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

test('nenhum teste usa Math.random', () => {
  const offenders = scannedFiles().filter((path) => usesMathRandom(readSource(path), path))
  expect(offenders).toEqual([])
})
