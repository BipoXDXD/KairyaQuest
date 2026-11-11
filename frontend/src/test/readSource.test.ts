/// <reference types="node" />
import { expect, test } from 'vitest'
import { sourceSize } from './readSource'

test('sourceSize devolve os bytes de um binário relativo a frontend/', () => {
  // Tamanho medido com `ls -l` no arquivo versionado pela arte da Fase 7.
  expect(sourceSize('public/art/kairya/avatar.webp')).toBe(3560)
})

test('sourceSize de arquivo inexistente lança, nunca devolve 0', () => {
  expect(() => sourceSize('public/nao-existe.webp')).toThrow(/ENOENT/)
})
