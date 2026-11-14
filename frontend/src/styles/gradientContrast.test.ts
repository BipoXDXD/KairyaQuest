/// <reference types="node" />
import { expect, test } from 'vitest'

import { listSources, readSource } from '../test/readSource'
import { contrastRatio, parseTokens, truncateToHundredths } from '../shared/ui/tokens/contrast'
import {
  declaredColor,
  gradientSelectors,
  gradientStops,
  panelContrastFailures,
  resolveColor,
  type PanelSource,
} from '../shared/ui/tokens/gradientPanels'

// O axe-core não decide contraste sobre `linear-gradient`: devolve a regra
// `color-contrast` em `incomplete`, nunca em `violations` (medido no PR #124,
// P-axe-transitorios-2-1). Este teste ocupa esse lugar para os painéis
// com gradiente: mede cada cor de texto, borda e anel que o código deles usa
// contra os DOIS extremos do gradiente, lendo tudo da fonte real (index.css,
// tokens.css e o tema do Tailwind). Texto: 4,5:1 (WCAG 1.4.3, sem a exceção de
// texto grande, que seria mais frouxa). Controles e foco: 3:1 (WCAG 1.4.11).

const indexCss = readSource('src/index.css')
const tokensCss = readSource('src/styles/tokens.css')
const tailwindTheme = readSource('node_modules/tailwindcss/theme.css')

// Os tokens do projeto vêm depois e sobrescrevem o tema padrão do Tailwind.
const tokens = new Map([...parseTokens(tailwindTheme), ...parseTokens(tokensCss)])

const TUTORING = 'src/features/tutoring/'

interface Panel {
  readonly selector: string
  /** Os componentes que aplicam a classe: a lista é conferida contra o código. */
  readonly roots: readonly string[]
  /** Raízes mais os componentes filhos que escrevem texto sobre o gradiente. */
  readonly files: readonly string[]
}

const PANELS: readonly Panel[] = [
  {
    selector: '.rpg-tutor',
    roots: [`${TUTORING}TutorPanel.tsx`],
    files: [
      `${TUTORING}TutorPanel.tsx`,
      `${TUTORING}TutorConversation.tsx`,
      `${TUTORING}ProposalCard.tsx`,
      `${TUTORING}RescheduleProposalCard.tsx`,
      `${TUTORING}DecisionControls.tsx`,
    ],
  },
]

// Bordas que não identificam controle nenhum: o 3:1 da 1.4.11 vale para o que
// precisa ser visto para achar ou operar o componente, e estas não são isso.
// Escapar daqui é decisão escrita, por arquivo; borda nova é medida.
const DECORATIVE_BORDERS: Readonly<Record<string, readonly string[]>> = {
  // `border-slate-800`: divisória entre o quadro e a coluna da Kairya, só no
  // desktop. `border-slate-600`: borda do botão de recolher a conversa (2,1:1);
  // o botão é identificado pelo rótulo e pelo glifo, então a borda não é o
  // indicador essencial do componente.
  'src/features/tutoring/TutorPanel.tsx': ['border-slate-800', 'border-slate-600'],
}

const source = (path: string): PanelSource => ({ path, text: readSource(path) })

test('a leitura é de verdade: o tema do Tailwind e o CSS do projeto trazem as cores', () => {
  expect(tailwindTheme).toContain('--color-slate-400')
  expect(tokens.get('color-text-muted')).toBe('var(--ink-300)')
  expect(Object.keys(gradientStops(indexCss, '.rpg-tutor'))).toEqual(['from', 'to'])
})

test.each(PANELS)(
  'texto, bordas de campo e anéis de $selector atingem o mínimo nos dois extremos do gradiente',
  ({ selector, files }) => {
    expect(
      panelContrastFailures({
        panel: selector,
        stops: gradientStops(indexCss, selector),
        tokens,
        sources: files.map(source),
        decorative: DECORATIVE_BORDERS,
      }),
    ).toEqual([])
  },
)

// Cores declaradas no CSS (e não em classe) que também moram sobre o gradiente.
const CSS_COLORS = [
  { panel: '.rpg-tutor', selector: '.tutor-name', property: 'color', min: 4.5 },
] as const

test('as cores declaradas no CSS sobre o gradiente atingem o mínimo nos dois extremos', () => {
  const failures = CSS_COLORS.flatMap(({ panel, selector, property, min }) => {
    const color = resolveColor(tokens, declaredColor(indexCss, selector, property))
    const { from, to } = gradientStops(indexCss, panel)
    return [from, to].flatMap((stop) => {
      const ratio = contrastRatio(color, stop)
      return ratio < min
        ? [
            `${panel} · ${selector} (${property}) = ${truncateToHundredths(ratio)} < ${min} sobre ${stop}`,
          ]
        : []
    })
  })
  expect(failures).toEqual([])
})

test('toda classe de gradiente usada por um componente está na tabela, com os mesmos componentes', () => {
  const components = listSources('src/**/*.tsx', { excludeTests: true })
  const used = gradientSelectors(indexCss)
    .map((selector) => {
      const className = new RegExp(`${selector.slice(1)}(?![\\w-])`)
      return { selector, roots: components.filter((path) => className.test(readSource(path))) }
    })
    .filter(({ roots }) => roots.length > 0)
  const known = PANELS.map(({ selector, roots }) => ({ selector, roots: [...roots] }))
  const bySelector = (a: { selector: string }, b: { selector: string }) =>
    a.selector.localeCompare(b.selector)
  expect(used.sort(bySelector)).toEqual(known.sort(bySelector))
})

test('a lista de bordas decorativas não guarda classe que já saiu do arquivo', () => {
  const stale = Object.entries(DECORATIVE_BORDERS).flatMap(([path, classes]) =>
    classes.filter((name) => !readSource(path).includes(name)).map((name) => `${path}: ${name}`),
  )
  expect(stale).toEqual([])
})

// Só existe o tema escuro. Se um tema claro chegar, os gradientes e os tokens
// podem mudar por tema e este teste precisa medir cada um: ele reprova aqui
// para forçar a revisão, em vez de continuar medindo só o escuro em silêncio.
test('o app tem um único tema, o escuro', () => {
  const themeSelectors = /prefers-color-scheme|\[data-theme|\.light\b|\.dark\b/
  expect(indexCss).not.toMatch(themeSelectors)
  expect(tokensCss).not.toMatch(themeSelectors)
  expect(readSource('src/styles/base.css')).not.toMatch(themeSelectors)
})
