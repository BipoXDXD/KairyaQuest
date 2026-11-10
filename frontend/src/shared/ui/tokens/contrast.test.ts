import { expect, test } from 'vitest'

import {
  contrastRatio,
  findContrastFailures,
  parseTokens,
  relativeLuminance,
  resolveToken,
} from './contrast'

test('preto sobre branco mede 21', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2)
})

test('a ordem dos argumentos não muda a razão', () => {
  expect(contrastRatio('#0d1520', '#e6ebf1')).toBeCloseTo(contrastRatio('#e6ebf1', '#0d1520'), 10)
})

test('cor sobre ela mesma mede 1', () => {
  expect(contrastRatio('#2a3b50', '#2a3b50')).toBe(1)
})

test('ink-100 sobre ink-950 mede 15,30', () => {
  expect(contrastRatio('#e6ebf1', '#0d1520')).toBeCloseTo(15.3, 1)
})

test('aceita hex em maiúsculas', () => {
  expect(relativeLuminance('#FFFFFF')).toBe(1)
})

test.each(['#fff', 'rgb(0,0,0)', 'e6ebf1', ''])('rejeita formato %s', (v) => {
  expect(() => relativeLuminance(v)).toThrow(v === '' ? /cor/ : v)
})

test('resolveToken resolve var() em cadeia', () => {
  const t = parseTokens(
    ':root{--ink-950:#0d1520}@theme{--color-bg-canvas:var(--ink-950);--color-x:var(--color-bg-canvas)}',
  )
  expect(resolveToken(t, 'color-x')).toBe('#0d1520')
})

test('resolveToken falha em nome inexistente, citando o nome', () => {
  expect(() => resolveToken(parseTokens(':root{--a:#000000}'), 'sumiu')).toThrow('sumiu')
})

test('resolveToken falha em referência inexistente, citando o nome', () => {
  expect(() => resolveToken(parseTokens('@theme{--color-a:var(--nada)}'), 'color-a')).toThrow(
    'nada',
  )
})

test('resolveToken falha em ciclo', () => {
  expect(() =>
    resolveToken(
      parseTokens('@theme{--color-a:var(--color-b);--color-b:var(--color-a)}'),
      'color-a',
    ),
  ).toThrow(/ciclo/)
})

test('parseTokens guarda o valor cru, sem espaços nas pontas', () => {
  const t = parseTokens(':root {\n  --ink-950:   #0d1520 ;\n  --x: var(--ink-950);\n}')
  expect(t.get('ink-950')).toBe('#0d1520')
  expect(t.get('x')).toBe('var(--ink-950)')
})

test('um var() para valor não-hex não quebra o parse dos demais', () => {
  const t = parseTokens(
    ':root{--ink-950:#0d1520;--glow:var(--shadow-g)}@theme{--shadow-g:0 0 24px color-mix(in oklab, red 35%, transparent)}',
  )
  expect(resolveToken(t, 'ink-950')).toBe('#0d1520')
  expect(resolveToken(t, 'glow')).toMatch(/^0 0 24px color-mix/)
})

test('findContrastFailures lista o par reprovado e só ele', () => {
  const t = new Map([
    ['a', '#5b6e84'],
    ['b', '#1c2b3d'],
    ['c', '#e6ebf1'],
  ])
  expect(
    findContrastFailures(t, [
      { fg: 'a', bg: 'b', min: 3, use: 'borda' },
      { fg: 'c', bg: 'b', min: 4.5, use: 'texto' },
    ]),
  ).toEqual(['a/b = 2.74 < 3 (borda)'])
})

test('findContrastFailures trunca a razão na mensagem, sem arredondar para o mínimo', () => {
  // #0c6800 sobre preto mede 2,9958: arredondado viraria "3.00 < 3".
  const t = new Map([
    ['a', '#0c6800'],
    ['b', '#000000'],
  ])
  expect(findContrastFailures(t, [{ fg: 'a', bg: 'b', min: 3, use: 'u' }])).toEqual([
    'a/b = 2.99 < 3 (u)',
  ])
})

test('findContrastFailures sem pares não acusa nada', () => {
  expect(findContrastFailures(new Map(), [])).toEqual([])
})

test('findContrastFailures acusa token ausente em vez de passar', () => {
  expect(findContrastFailures(new Map(), [{ fg: 'x', bg: 'y', min: 3, use: 'u' }])).toEqual([
    'x/y: token ausente (u)',
  ])
})

test('findContrastFailures acusa ausência quando só o fundo falta', () => {
  const t = new Map([['x', '#000000']])
  expect(findContrastFailures(t, [{ fg: 'x', bg: 'y', min: 3, use: 'u' }])).toEqual([
    'x/y: token ausente (u)',
  ])
})

test('findContrastFailures trata referência quebrada como token ausente', () => {
  const t = new Map([
    ['x', 'var(--nada)'],
    ['y', '#000000'],
  ])
  expect(findContrastFailures(t, [{ fg: 'x', bg: 'y', min: 3, use: 'u' }])).toEqual([
    'x/y: token ausente (u)',
  ])
})

test('findContrastFailures acusa ciclo pelo nome, sem confundir com ausência', () => {
  const t = new Map([
    ['x', 'var(--z)'],
    ['z', 'var(--x)'],
    ['y', '#000000'],
  ])
  expect(findContrastFailures(t, [{ fg: 'y', bg: 'x', min: 3, use: 'u' }])).toEqual([
    'y/x: ciclo em var() (u)',
  ])
})

test('findContrastFailures trata valor final não-hex como token ausente', () => {
  const t = new Map([
    ['x', '0 0 24px red'],
    ['y', '#000000'],
  ])
  expect(findContrastFailures(t, [{ fg: 'x', bg: 'y', min: 3, use: 'u' }])).toEqual([
    'x/y: token ausente (u)',
  ])
})
