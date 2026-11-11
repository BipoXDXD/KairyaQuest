/// <reference types="node" />
import { expect, test } from 'vitest'
import { listSources, readSource } from './readSource'

/**
 * Regra 1 de `docs/ARCHITECTURE.md` §5: uma feature só importa de outra pelo
 * `index`. `from '../<outra>/<arquivo>'` leva ao detalhe interno e quebra a
 * fronteira (inclusive nos testes, que passariam a depender da implementação).
 */
const CROSS_FEATURE_INTERNAL = /from\s+['"]\.\.\/([\w-]+)\/[^'"]+['"]/

/** `feature` é a pasta de `src/features/<feature>/...`; `null` se o caminho não é de feature. */
function featureOf(path: string): string | null {
  return /^src\/features\/([^/]+)\//.exec(path)?.[1] ?? null
}

/** Linhas `arquivo:linha` que importam o interno de OUTRA feature. */
function offendersIn(path: string, text: string): string[] {
  const own = featureOf(path)
  return text.split('\n').flatMap((line, i) => {
    const target = CROSS_FEATURE_INTERNAL.exec(line)?.[1]
    return target !== undefined && target !== own && target !== '..' ? [`${path}:${i + 1}`] : []
  })
}

test('a regra acusa o import do interno de outra feature', () => {
  const sample = `import { x } from '../kairya/${'useKairyaMood'}'`
  expect(offendersIn('src/features/tutoring/a.ts', sample)).toEqual([
    'src/features/tutoring/a.ts:1',
  ])
})

test('a regra deixa passar o index e a pasta da própria feature', () => {
  expect(offendersIn('src/features/tutoring/a.ts', "import { x } from '../kairya'")).toEqual([])
  expect(
    offendersIn('src/features/tutoring/sub/a.ts', "import { x } from '../tutoring/b'"),
  ).toEqual([])
})

test('a varredura inclui os arquivos de feature', () => {
  expect(listSources('src/features/**/*.{ts,tsx}')).toContain(
    'src/features/tutoring/tutorPresence.test.ts',
  )
})

test('nenhuma feature importa o interno de outra', () => {
  const offenders = listSources('src/features/**/*.{ts,tsx}').flatMap((path) =>
    offendersIn(path, readSource(path)),
  )
  expect(offenders).toEqual([])
})
