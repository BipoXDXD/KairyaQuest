/// <reference types="node" />
import { expect, test } from 'vitest'
import { listSources, readSource } from './readSource'

/**
 * A semente da Kairya é injetada (`random` no provider): nenhum teste chama
 * `Math.random`, ou a fala escolhida mudaria de uma execução para outra e o
 * teste ficaria intermitente. Espiar a função (`vi.spyOn(Math, 'random')`) não
 * é chamá-la e continua permitido, pois é como o teste do ramo padrão do
 * `useKairyaMood` prova o `random` de produção.
 */
const MATH_RANDOM_CALL = /Math\.random\(/

// Montada em partes para este arquivo não casar com a própria regra.
const CALL_SAMPLE = `const seed = ${'Math'}.${'random'}()`

test('a regra acusa a chamada de Math.random', () => {
  expect(MATH_RANDOM_CALL.test(CALL_SAMPLE)).toBe(true)
})

test('a regra deixa passar o espião de Math.random', () => {
  expect(MATH_RANDOM_CALL.test("vi.spyOn(Math, 'random').mockReturnValue(0.5)")).toBe(false)
})

test('a varredura inclui o teste que espia Math.random', () => {
  expect(listSources('src/**/*.test.{ts,tsx}')).toContain(
    'src/features/kairya/useKairyaMood.test.tsx',
  )
})

test('nenhum teste chama Math.random', () => {
  const offenders = listSources('src/**/*.test.{ts,tsx}').filter((path) =>
    MATH_RANDOM_CALL.test(readSource(path)),
  )
  expect(offenders).toEqual([])
})
