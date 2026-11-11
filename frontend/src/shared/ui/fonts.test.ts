import { expect, test } from 'vitest'

import { readSource, sourceExists } from '../../test/readSource'

const fontsCss = readSource('src/styles/fonts.css')
const tokensCss = readSource('src/styles/tokens.css')
const indexHtml = readSource('index.html')
const urls = [...fontsCss.matchAll(/url\('(\/fonts\/[^']+\.woff2)'\)/g)].map((m) => m[1])
const blocksOf = (family: string) =>
  fontsCss
    .split('@font-face')
    .slice(1)
    .filter((b) => new RegExp(`font-family:\\s*'${family}'`).test(b))

test('o CSS lido não está vazio', () => {
  expect(tokensCss).toContain('--ink-950')
  expect(fontsCss).toContain('@font-face')
})
test('cada @font-face aponta para um woff2 que existe em public/fonts', () => {
  expect(urls.length).toBeGreaterThanOrEqual(4)
  expect(urls.filter((u) => !sourceExists(`public${u}`))).toEqual([])
})
test('todo @font-face usa font-display: swap', () => {
  const blocks = fontsCss.split('@font-face').slice(1)
  expect(blocks.every((b) => /font-display:\s*swap/.test(b))).toBe(true)
})
test('as duas famílias e só os pesos da spec', () => {
  expect(blocksOf('Alegreya').length).toBeGreaterThan(0)
  expect(blocksOf('Alegreya Sans').length).toBeGreaterThan(0)
  expect(fontsCss).not.toMatch(/font-weight:\s*(100|200|300|600|800|900)\b/)
})
test('Alegreya Sans não declara 500 (só 400 e 700)', () => {
  expect(blocksOf('Alegreya Sans').every((b) => /font-weight:\s*(400|700)\s*;/.test(b))).toBe(true)
})
test('Alegreya não declara 400 (só 500 a 700)', () => {
  expect(blocksOf('Alegreya').every((b) => /font-weight:\s*(500 700|500|700)\s*;/.test(b))).toBe(
    true,
  )
})
test('o index.html faz preload das duas fontes principais, com crossorigin', () => {
  const preloads = [...indexHtml.matchAll(/<link[^>]+rel="preload"[^>]*>/g)].map((m) => m[0])
  expect(preloads).toHaveLength(2)
  expect(
    preloads.every(
      (l) => /as="font"/.test(l) && /type="font\/woff2"/.test(l) && /crossorigin/.test(l),
    ),
  ).toBe(true)
  expect(preloads.some((l) => l.includes('/fonts/alegreya-sans-400-latin.woff2'))).toBe(true)
  expect(preloads.some((l) => l.includes('/fonts/alegreya-latin.woff2'))).toBe(true)
})
test('a escala de texto é exatamente 12/14/16/18/22/28/36/48 px', () => {
  const sizes = [...tokensCss.matchAll(/--text-(xs|sm|base|lg|xl|2xl|3xl|4xl):\s*(\d+)px/g)].map(
    (m) => [m[1], Number(m[2])],
  )
  expect(Object.fromEntries(sizes)).toEqual({
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 22,
    '2xl': 28,
    '3xl': 36,
    '4xl': 48,
  })
})
test('as famílias têm fallback do sistema', () => {
  expect(tokensCss).toMatch(/--font-display:\s*'Alegreya',\s*Georgia,\s*serif/)
  expect(tokensCss).toMatch(/--font-body:\s*'Alegreya Sans',\s*system-ui,\s*sans-serif/)
})
