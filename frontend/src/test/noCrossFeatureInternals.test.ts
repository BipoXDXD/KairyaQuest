/// <reference types="node" />
import { dirname, join, normalize } from 'node:path/posix'
import ts from 'typescript'
import { expect, test } from 'vitest'
import { listSources, readSource } from './readSource'

/**
 * Regra 1 de `docs/ARCHITECTURE.md` §5: uma feature só importa de outra pelo
 * `index`. Importar o arquivo interno quebra a fronteira (inclusive nos testes,
 * que passariam a depender da implementação). O resto de `src` (`pages`,
 * `shared`, `app`, `App`, `main`, `test`) também só enxerga uma feature pelo
 * `index`.
 *
 * Os especificadores saem da AST (import/export, `import()`, `require`,
 * `import.meta.glob`, tipos `import('x')` e `vi.mock`/`vi.importActual`), então
 * comentário e texto de string não geram falso positivo, e o caminho relativo é
 * resolvido a partir do arquivo, sem depender do número de `../`.
 */

const VITEST_MODULE_CALLS = new Set([
  'mock',
  'doMock',
  'unmock',
  'doUnmock',
  'importActual',
  'importMock',
])

const FEATURE_PATH = /^src\/features\/([^/]+)(?:\/(.*))?$/
const INDEX_FILE = /^index(?:\.[cm]?[jt]sx?)?$/

interface ModuleReference {
  specifier: string
  line: number
}

function stringsOf(node: ts.Expression | undefined): ts.StringLiteralLike[] {
  if (node === undefined) return []
  if (ts.isStringLiteralLike(node)) return [node]
  return ts.isArrayLiteralExpression(node) ? node.elements.flatMap((el) => stringsOf(el)) : []
}

/** Argumentos de módulo de uma chamada: `import()`, `require`, `vi.mock...`, `import.meta.glob`. */
function moduleArgumentsOf(call: ts.CallExpression): ts.StringLiteralLike[] {
  const callee = call.expression
  const isImportCall = callee.kind === ts.SyntaxKind.ImportKeyword
  const isRequire = ts.isIdentifier(callee) && callee.text === 'require'
  const isViCall =
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'vi' &&
    VITEST_MODULE_CALLS.has(callee.name.text)
  const isGlob =
    ts.isPropertyAccessExpression(callee) &&
    ts.isMetaProperty(callee.expression) &&
    callee.name.text === 'glob'
  return isImportCall || isRequire || isViCall || isGlob ? stringsOf(call.arguments[0]) : []
}

function moduleLiteralsOf(node: ts.Node): ts.StringLiteralLike[] {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    return ts.isStringLiteralLike(node.moduleSpecifier) ? [node.moduleSpecifier] : []
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return stringsOf(node.moduleReference.expression)
  }
  if (ts.isImportTypeNode(node)) {
    return ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)
      ? [node.argument.literal]
      : []
  }
  return ts.isCallExpression(node) ? moduleArgumentsOf(node) : []
}

/** Todo caminho de módulo que o texto referencia, com a linha do especificador. */
function moduleReferencesIn(path: string, text: string): ModuleReference[] {
  const kind = path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  const found: ModuleReference[] = []
  const visit = (node: ts.Node): void => {
    for (const literal of moduleLiteralsOf(node)) {
      const line = source.getLineAndCharacterOfPosition(literal.getStart(source)).line + 1
      found.push({ specifier: literal.text, line })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/** `feature` é a pasta de `src/features/<feature>/...`; `null` se o caminho não é de feature. */
function featureOf(path: string): string | null {
  return /^src\/features\/([^/]+)\//.exec(path)?.[1] ?? null
}

/** Feature alvo e resto do caminho, se o import relativo cai em `src/features/<f>`. */
function featureTarget(
  fromPath: string,
  specifier: string,
): { feature: string; rest: string } | null {
  if (!specifier.startsWith('.')) return null
  const resolved = normalize(join(dirname(fromPath), specifier))
  const match = FEATURE_PATH.exec(resolved)
  return match?.[1] === undefined ? null : { feature: match[1], rest: match[2] ?? '' }
}

/** Linhas `arquivo:linha` que importam o interno de OUTRA feature (ou de qualquer feature, fora delas). */
function offendersIn(path: string, text: string): string[] {
  const own = featureOf(path)
  const lines = new Set<number>()
  for (const { specifier, line } of moduleReferencesIn(path, text)) {
    const target = featureTarget(path, specifier)
    if (target === null || target.feature === own) continue
    if (target.rest === '' || INDEX_FILE.test(target.rest)) continue
    lines.add(line)
  }
  return [...lines].sort((a, b) => a - b).map((line) => `${path}:${line}`)
}

const FEATURE_FILE = 'src/features/tutoring/a.ts'

test('a regra acusa o import do interno de outra feature', () => {
  const sample = `import { x } from '../kairya/${'useKairyaMood'}'`
  expect(offendersIn(FEATURE_FILE, sample)).toEqual([`${FEATURE_FILE}:1`])
})

test('a regra deixa passar o index e a pasta da própria feature', () => {
  expect(offendersIn(FEATURE_FILE, "import { x } from '../kairya'")).toEqual([])
  expect(offendersIn(FEATURE_FILE, "import { x } from '../kairya/index'")).toEqual([])
  expect(
    offendersIn('src/features/tutoring/sub/a.ts', "import { x } from '../tutoring/b'"),
  ).toEqual([])
  expect(offendersIn('src/features/tutoring/sub/a.ts', "import { x } from '../b'")).toEqual([])
})

test.each([
  ['import dinâmico', "const m = await import('../kairya/x')"],
  ['vi.mock', "vi.mock('../kairya/x', () => ({}))"],
  ['vi.importActual', "const a = await vi.importActual('../kairya/x')"],
  ['vi.importActual tipado', "await vi.importActual<typeof import('../kairya/x')>('../kairya/x')"],
  ['tipo import()', "type T = typeof import('../kairya/x')"],
  ['import só de efeito', "import '../kairya/x.css'"],
  ['re-export nomeado', "export { y } from '../kairya/x'"],
  ['re-export total', "export * from '../kairya/x'"],
  ['import type', "import type { Y } from '../kairya/x'"],
  ['import = require', "import y = require('../kairya/x')"],
  ['require', "const y = require('../kairya/x')"],
  ['import.meta.glob', "const m = import.meta.glob('../kairya/*.ts')"],
  ['import.meta.glob com lista', "import.meta.glob(['../kairya/x.ts'])"],
  ['from em outra linha', "import {\n  a,\n} from\n  '../kairya/x'"],
  ['import depois de um apóstrofo em JSX', "const a = <p>don't</p>\nimport('../kairya/x')"],
])('a regra acusa %s', (_name, sample) => {
  const path = sample.includes('<p>') ? 'src/features/tutoring/a.tsx' : FEATURE_FILE
  expect(offendersIn(path, sample)).not.toEqual([])
})

test('a regra ignora caminho citado em comentário ou em texto de string', () => {
  expect(offendersIn(FEATURE_FILE, "// import { x } from '../kairya/x'")).toEqual([])
  expect(offendersIn(FEATURE_FILE, "/* vi.mock('../kairya/x') */")).toEqual([])
  expect(offendersIn(FEATURE_FILE, 'const t = "from \'../kairya/x\'"')).toEqual([])
  expect(offendersIn(FEATURE_FILE, "it('importa ../kairya/x', () => {})")).toEqual([])
})

test('a linha acusada é a do especificador', () => {
  expect(offendersIn(FEATURE_FILE, "const ok = 1\nvi.mock('../kairya/x', () => ({}))")).toEqual([
    `${FEATURE_FILE}:2`,
  ])
  expect(offendersIn(FEATURE_FILE, "import {\n  a,\n} from\n  '../kairya/x'")).toEqual([
    `${FEATURE_FILE}:4`,
  ])
})

test('a regra resolve o caminho a partir do arquivo, com qualquer número de níveis', () => {
  const sample = "import { x } from '../../kairya/x'"
  expect(offendersIn('src/features/tutoring/sub/a.ts', sample)).toEqual([
    'src/features/tutoring/sub/a.ts:1',
  ])
  expect(offendersIn('src/features/kairya/sub/a.ts', sample)).toEqual([])
  expect(offendersIn('src/pages/a.ts', "import { x } from '../../src/features/kairya/x'")).toEqual([
    'src/pages/a.ts:1',
  ])
  expect(offendersIn('src/shared/ui/a.ts', "import { x } from '../../features/kairya/x'")).toEqual([
    'src/shared/ui/a.ts:1',
  ])
  expect(
    offendersIn('src/features/tutoring/sub/a.ts', "import { x } from '../../../shared/x'"),
  ).toEqual([])
})

test('o resto de src só importa feature pelo index', () => {
  expect(offendersIn('src/pages/a.ts', "import { x } from '../features/kairya'")).toEqual([])
  expect(offendersIn('src/pages/a.ts', "import { x } from '../features/kairya/index'")).toEqual([])
  expect(offendersIn('src/App.tsx', "import { x } from './features/kairya/x'")).toEqual([
    'src/App.tsx:1',
  ])
  expect(
    offendersIn('src/App.test.tsx', "import type { C } from './features/missions/types'"),
  ).toEqual(['src/App.test.tsx:1'])
  expect(offendersIn('src/main.tsx', "import('./features/kairya/x')")).toEqual(['src/main.tsx:1'])
  expect(offendersIn('src/app/a.ts', "import { x } from '../features/kairya/x'")).toEqual([
    'src/app/a.ts:1',
  ])
})

test('import de pacote ou de fora das features não é acusado', () => {
  expect(offendersIn(FEATURE_FILE, "import { x } from 'react/jsx-runtime'")).toEqual([])
  expect(offendersIn(FEATURE_FILE, "import { x } from '../../shared/api/client'")).toEqual([])
})

const SELF = 'src/test/noCrossFeatureInternals.test.ts'

/** Todo `src`, menos este arquivo, que tem as amostras. */
function scannedFiles(): string[] {
  return listSources('src/**/*.{ts,tsx}').filter((path) => path !== SELF)
}

test('a varredura inclui features, pages, shared, app, App, main e src/test', () => {
  expect(scannedFiles()).toEqual(
    expect.arrayContaining([
      'src/features/tutoring/tutorPresence.test.ts',
      'src/pages/Headquarters.tsx',
      'src/App.tsx',
      'src/App.test.tsx',
      'src/main.tsx',
      'src/main.test.tsx',
      'src/test/readSource.ts',
    ]),
  )
  expect(scannedFiles().some((p) => p.startsWith('src/shared/'))).toBe(true)
  expect(scannedFiles().some((p) => p.startsWith('src/app/'))).toBe(true)
  expect(scannedFiles()).not.toContain(SELF)
})

test('nenhum arquivo importa o interno de outra feature', () => {
  const offenders = scannedFiles().flatMap((path) => offendersIn(path, readSource(path)))
  expect(offenders).toEqual([])
})
