// @vitest-environment node
import { ESLint } from 'eslint'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A fitness function contra texto literal na interface ja traduzida: roda o
 * ESLint do projeto (o `eslint.config.js` de verdade) sobre um trecho de JSX,
 * como se ele morasse em `src/app/`, e conta as violacoes da regra.
 */
const cwd = fileURLToPath(new URL('../..', import.meta.url))
const eslint = new ESLint({ cwd })

async function literalViolations(code: string, filePath = 'src/app/Fake.tsx'): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length
}

const component = (jsx: string) =>
  `const t = (key: string) => key\nexport function Fake() {\n  return ${jsx}\n}\n`

describe('nenhum texto literal no JSX da interface', () => {
  it.each([
    ['texto solto', '<p>Olá</p>'],
    ['texto com acento', '<p>Ação</p>'],
    ['aria-label literal', '<button aria-label="Fechar" />'],
    ['title literal', '<span title="Dica" />'],
    ['placeholder literal', '<input placeholder="Buscar" />'],
    ['alt literal', '<img alt="Logo" />'],
    ['string em expressao no corpo', "<p>{'Olá'}</p>"],
    ['string em expressao no fragmento', "<>{'Olá'}</>"],
    ['aria-label em expressao', "<button aria-label={'Fechar'} />"],
    ['title em expressao', "<span title={'Dica'} />"],
    ['placeholder em expressao', "<input placeholder={'Buscar'} />"],
    ['alt em expressao', "<img alt={'Logo'} />"],
    ['template sem expressao no corpo', '<p>{`Olá`}</p>'],
    ['template com expressao no corpo', '<p>{`Total ${1}`}</p>'],
    ['template no aria-label', '<button aria-label={`Fechar`} />'],
  ])('%s reprova', async (_caso, jsx) => {
    expect(await literalViolations(component(jsx))).toBe(1)
  })

  it.each([
    ['texto pelo t()', "<p>{t('x')}</p>"],
    ['aria-label pelo t()', "<button aria-label={t('x')} />"],
    ['alt vazio de imagem decorativa', '<img alt="" />'],
    ['glifo sem letra', '<span aria-hidden="true">▸</span>'],
    ['string vazia em expressao', "<p>{''}</p>"],
    ['alt vazio em expressao', "<img alt={''} />"],
    ['glifo em expressao', "<span>{' · '}</span>"],
    ['template so com glifo e expressao', "<span>{`${t('a')} · ${t('b')}`}</span>"],
    ['string em atributo que ninguem le', "<span data-testid={'painel'} className={'card'} />"],
  ])('%s passa', async (_caso, jsx) => {
    expect(await literalViolations(component(jsx))).toBe(0)
  })

  it('vale para a pagina do Quartel-General', async () => {
    expect(await literalViolations(component('<p>Olá</p>'), 'src/pages/Headquarters.tsx')).toBe(1)
  })

  it.each([
    ['a tutoria', 'src/features/tutoring/Fake.tsx'],
    ['as missoes', 'src/features/missions/Fake.tsx'],
    ['a progressao', 'src/features/progression/Fake.tsx'],
    ['as campanhas', 'src/features/campaigns/Fake.tsx'],
    ['a pagina de Campanhas', 'src/pages/Campaigns.tsx'],
    ['a raiz', 'src/App.tsx'],
    ['qualquer feature nova', 'src/features/qualquer/Fake.tsx'],
  ])('a regra e global: vale para %s', async (_caso, filePath) => {
    expect(await literalViolations(component('<p>Olá</p>'), filePath)).toBe(1)
  })

  it.each([
    ['teste da progressao', 'src/features/progression/Fake.test.tsx'],
    ['teste do shell', 'src/app/Fake.test.tsx'],
    ['teste das missoes', 'src/features/missions/Fake.test.tsx'],
    ['teste da tutoria', 'src/features/tutoring/Fake.test.tsx'],
    ['o proprio i18n', 'src/shared/i18n/Fake.tsx'],
  ])('fora do escopo: %s', async (_caso, filePath) => {
    expect(await literalViolations(component('<p>Olá</p>'), filePath)).toBe(0)
  })
})
