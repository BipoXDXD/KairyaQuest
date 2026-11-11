/// <reference types="node" />
import { expect, test } from 'vitest'
import { readSource } from '../../test/readSource'

// Lê do disco: o ?raw de CSS volta vazio no Vitest 5.0.1 (ver readSource.ts).
const base = readSource('src/styles/base.css')
const tokens = readSource('src/styles/tokens.css')
const keyframes = /@keyframes\s+lantern-light\s*\{([\s\S]*?\}\s*)\}/.exec(base)?.[1] ?? ''

test('o CSS lido não está vazio', () => {
  expect(tokens).toContain('--ink-950')
  expect(keyframes).not.toBe('')
})

test('lantern-light anima filter com --glow-lantern-filter e não usa box-shadow', () => {
  expect(keyframes).toMatch(/filter:\s*var\(--glow-lantern-filter\)/)
  expect(keyframes).toMatch(/opacity:\s*\.35|opacity:\s*0\.35/)
  expect(keyframes).not.toMatch(/box-shadow/)
})

test('nenhum drop-shadow usa o token com spread', () => {
  expect(base).not.toMatch(/drop-shadow\([^)]*var\(--(?:glow-lantern|shadow-glow-lantern)\)/)
})

test('o estado aceso estático usa o mesmo filtro', () => {
  expect(base).toMatch(
    /\.lantern-mark\[data-lit=['"]true['"]\]\s*\{[^}]*opacity:\s*1[^}]*filter:\s*var\(--glow-lantern-filter\)/,
  )
})

test('as duas animações são tokens do tema, com as durações da spec', () => {
  expect(tokens).toMatch(/--animate-reward-in:\s*reward-in 400ms ease-out;/)
  expect(tokens).toMatch(/--animate-lantern-light:\s*lantern-light 900ms ease-out both;/)
  expect(base).toMatch(/@keyframes\s+reward-in\s*\{/)
})
