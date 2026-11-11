/// <reference types="node" />
import { expect, test } from 'vitest'
import { isSourceFile, readSource, readSourceBytes, sourcePath, sourceSize } from './readSource'

test.each([
  ['package.json', true], // arquivo regular
  ['src', false], // pasta, que o fs.globSync devolve no listSources
  ['nao-existe.txt', false], // ausente: false, sem lançar
])('isSourceFile(%s) → %s', (path, expected) => expect(isSourceFile(path)).toBe(expected))

test('sourcePath resolve a partir de frontend/, inclusive saindo com ../', () => {
  expect(sourcePath('package.json').endsWith('/frontend/package.json')).toBe(true)
  expect(sourcePath('../Makefile').endsWith('/Makefile')).toBe(true)
  expect(sourcePath('../Makefile').includes('/frontend/')).toBe(false)
})

test('readSourceBytes devolve os bytes sem decodificar', () => {
  const bytes = readSourceBytes('package.json')
  expect(bytes).toBeInstanceOf(Uint8Array)
  expect(new TextDecoder().decode(bytes)).toBe(readSource('package.json'))
})

test('sourceSize devolve os bytes de um binário relativo a frontend/', () => {
  // Tamanho medido com `ls -l` no arquivo versionado pela arte da Fase 7.
  expect(sourceSize('public/art/kairya/avatar.webp')).toBe(3560)
})

test('sourceSize de arquivo inexistente lança, nunca devolve 0', () => {
  expect(() => sourceSize('public/nao-existe.webp')).toThrow(/ENOENT/)
})
