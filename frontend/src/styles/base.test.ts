/// <reference types="node" />
import { expect, test } from 'vitest'
import { readSource } from '../test/readSource'

const css = readSource('src/styles/base.css').replace(/\s+/g, ' ')

// O comportamento (a transição do NavTabs zerada com `reduce`) é medido no
// navegador, em `tests/e2e/layout.spec.ts`; aqui, só que a regra global existe
// com os valores da spec.
test('a regra global de movimento reduzido zera animação, transição e rolagem suave', () => {
  const block =
    /@media \(prefers-reduced-motion: reduce\) \{ \*, \*::before, \*::after \{([^}]*)\}/.exec(css)
  expect(block?.[1]).toBe(
    ' animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; ',
  )
})

// O E2E de `layout.spec.ts` mede a folga no celular; aqui, que ela só vale
// abaixo do lg e fica na escala (24 passos = 96 px).
test('a folga do botão fixo da Kairya só vale abaixo do lg', () => {
  expect(css).toContain(
    '.area-main--fab-clearance { @variant max-lg { padding-bottom: calc(var(--spacing) * 24); } }',
  )
})
