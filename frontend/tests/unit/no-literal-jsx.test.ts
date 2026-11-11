// @vitest-environment node
import { ESLint } from 'eslint'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * A fitness function contra texto literal na interface ja traduzida: roda o
 * ESLint do projeto (o `eslint.config.js` de verdade) sobre um trecho de JSX,
 * como se ele morasse em `src/app/`, e conta as violacoes da regra.
 */
const cwd = fileURLToPath(new URL('../..', import.meta.url))
const eslint = new ESLint({ cwd })
const COLD_START_TIMEOUT_MS = 60_000

async function literalViolations(code: string, filePath = 'src/app/Fake.tsx'): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length
}

const component = (jsx: string) =>
  `const t = (key: string) => key\nexport function Fake() {\n  return ${jsx}\n}\n`

describe('nenhum texto literal no JSX do shell', () => {
  // A primeira chamada carrega a configuracao e o parser do TypeScript; com a
  // maquina carregada ela passa dos 5 s do teste. Paga uma vez aqui, com
  // folga propria, e os casos medem so a regra.
  beforeAll(async () => {
    await literalViolations(component('<p />'))
  }, COLD_START_TIMEOUT_MS)

  it.each([
    ['texto solto', '<p>Olá</p>'],
    ['texto com acento', '<p>Ação</p>'],
    ['aria-label literal', '<button aria-label="Fechar" />'],
    ['title literal', '<span title="Dica" />'],
    ['placeholder literal', '<input placeholder="Buscar" />'],
    ['alt literal', '<img alt="Logo" />'],
  ])('%s reprova', async (_caso, jsx) => {
    expect(await literalViolations(component(jsx))).toBe(1)
  })

  it.each([
    ['texto pelo t()', "<p>{t('x')}</p>"],
    ['aria-label pelo t()', "<button aria-label={t('x')} />"],
    ['alt vazio de imagem decorativa', '<img alt="" />'],
    ['glifo sem letra', '<span aria-hidden="true">▸</span>'],
  ])('%s passa', async (_caso, jsx) => {
    expect(await literalViolations(component(jsx))).toBe(0)
  })

  it('vale para a pagina do Quartel-General', async () => {
    expect(await literalViolations(component('<p>Olá</p>'), 'src/pages/Headquarters.tsx')).toBe(1)
  })

  it.each([
    ['a tutoria', 'src/features/tutoring/Fake.tsx'],
    ['as missoes', 'src/features/missions/Fake.tsx'],
  ])('vale para %s, ja migrada', async (_caso, filePath) => {
    expect(await literalViolations(component('<p>Olá</p>'), filePath)).toBe(1)
  })

  it.each([
    ['feature ainda nao migrada', 'src/features/progression/Fake.tsx'],
    ['teste do shell', 'src/app/Fake.test.tsx'],
    ['teste das missoes', 'src/features/missions/Fake.test.tsx'],
    ['teste da tutoria', 'src/features/tutoring/Fake.test.tsx'],
    ['o proprio i18n', 'src/shared/i18n/Fake.tsx'],
  ])('fora do escopo: %s', async (_caso, filePath) => {
    expect(await literalViolations(component('<p>Olá</p>'), filePath)).toBe(0)
  })
})
