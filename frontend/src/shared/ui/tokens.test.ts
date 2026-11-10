/// <reference types="node" />
import { expect, test } from 'vitest'

import { readSource } from '../../test/readSource'
import { findContrastFailures, parseTokens, resolveToken } from './tokens/contrast'
import { CONTRAST_PAIRS } from './tokens/contrastPairs'

const css = readSource('src/styles/tokens.css')
const indexCss = readSource('src/index.css')
const tokens = parseTokens(css)

test('o CSS lido não está vazio', () => {
  expect(css).toContain('--ink-950')
  expect(indexCss).toMatch(/@import/)
})

test('index.css importa tokens.css depois do Tailwind', () => {
  const tailwind = indexCss.indexOf("@import 'tailwindcss'")
  const tokensImport = indexCss.indexOf("@import './styles/tokens.css'")
  expect(tailwind).toBeGreaterThanOrEqual(0)
  expect(tokensImport).toBeGreaterThan(tailwind)
})

test('todos os pares semânticos usados atingem o mínimo WCAG', () => {
  expect(findContrastFailures(tokens, CONTRAST_PAIRS)).toEqual([])
})

test('os 12 semânticos existem com o primitivo certo', () => {
  const get = (n: string) => resolveToken(tokens, n)
  expect({
    canvas: get('color-bg-canvas'),
    surface: get('color-bg-surface'),
    raised: get('color-bg-raised'),
    subtle: get('color-border-subtle'),
    strong: get('color-border-strong'),
    primary: get('color-text-primary'),
    muted: get('color-text-muted'),
    action: get('color-action-primary'),
    onAction: get('color-text-on-action'),
    success: get('color-feedback-success'),
    danger: get('color-feedback-danger'),
    focus: get('color-focus-ring'),
  }).toEqual({
    canvas: '#0d1520',
    surface: '#142030',
    raised: '#1c2b3d',
    subtle: '#2a3b50',
    strong: '#697b91',
    primary: '#e6ebf1',
    muted: '#a9b6c6',
    action: '#f2b950',
    onAction: '#0d1520',
    success: '#6fd3a8',
    danger: '#f08a76',
    focus: '#9fb2f5',
  })
})

test('o hover do primário é lantern-200', () => {
  expect(tokens.get('color-action-primary-hover')).toBe('var(--lantern-200)')
  expect(resolveToken(tokens, 'color-action-primary-hover')).toBe('#f9dc9c')
})

test('ink-400 é o primitivo novo e border-strong aponta para ele', () => {
  expect(tokens.get('ink-400')).toBe('#697b91')
  expect(tokens.get('color-border-strong')).toBe('var(--ink-400)')
})

test('raio e glow de componente', () => {
  expect(tokens.get('radius-ui')).toBe('10px')
  expect(tokens.get('radius-pill')).toBe('999px')
  expect(tokens.get('glow-lantern-color')).toBe(
    'color-mix(in oklab, var(--lantern-400) 35%, transparent)',
  )
})

test('--glow-lantern existe e resolve para o glow; o filtro de SVG usa a mesma cor', () => {
  expect(resolveToken(tokens, 'glow-lantern')).toBe(resolveToken(tokens, 'shadow-glow-lantern'))
  expect(tokens.get('shadow-glow-lantern')).toContain('var(--glow-lantern-color)')
  expect(tokens.get('glow-lantern-filter')).toMatch(
    /^drop-shadow\(.*var\(--glow-lantern-color\)\)$/,
  )
})

test('primitivos ficam em :root, fora do @theme, para não gerar utility', () => {
  const theme = /@theme\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  expect(theme).toContain('--color-bg-canvas')
  expect(theme).not.toMatch(/--(ink|lantern|jade|ember|dusk)-\d+\s*:/)
  expect(theme).not.toMatch(/--glow-lantern(-color|-filter)?\s*:/)
})

test('nenhum token --fq-* sobrevive no CSS', () => {
  expect(indexCss).not.toMatch(/--fq-/)
})
