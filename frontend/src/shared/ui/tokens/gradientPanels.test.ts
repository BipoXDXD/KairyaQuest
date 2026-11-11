import { expect, test } from 'vitest'

import { parseTokens } from './contrast'
import {
  colorUsesIn,
  declaredColor,
  gradientSelectors,
  gradientStops,
  oklchToHex,
  panelContrastFailures,
  resolveColor,
} from './gradientPanels'

const STOPS = { from: '#172433', to: '#111d2b' }

// Valores publicados na documentação de cores do Tailwind v4 (hex da paleta).
test.each([
  ['oklch(70.4% 0.04 256.788)', '#90a1b9'],
  ['oklch(80.8% 0.114 19.571)', '#ffa2a2'],
  ['oklch(84.5% 0.143 164.978)', '#5ee9b5'],
  ['oklch(100% 0 0)', '#ffffff'],
  ['oklch(0% 0 0)', '#000000'],
])('oklchToHex converte %s em %s', (oklch, hex) => {
  expect(oklchToHex(oklch)).toBe(hex)
})

test.each(['oklch(70.4% 0.04)', '#90a1b9', 'rgb(1,2,3)'])('oklchToHex recusa %s', (value) => {
  expect(() => oklchToHex(value)).toThrow(/oklch/)
})

test('resolveColor aceita hex, oklch e var() em cadeia', () => {
  const tokens = parseTokens(
    ':root{--ink:#0d1520}@theme{--color-a:var(--ink);--color-b:var(--color-a);--color-c:oklch(100% 0 0)}',
  )
  expect(resolveColor(tokens, '#AbCdEf')).toBe('#abcdef')
  expect(resolveColor(tokens, 'var(--color-b)')).toBe('#0d1520')
  expect(resolveColor(tokens, 'var(--color-c)')).toBe('#ffffff')
})

test('resolveColor expande o hex curto do tema do Tailwind (#fff)', () => {
  expect(resolveColor(parseTokens('@theme{--color-white:#fff}'), 'var(--color-white)')).toBe(
    '#ffffff',
  )
  expect(resolveColor(new Map(), '#0aF')).toBe('#00aaff')
})

test('resolveColor recusa o que não é cor', () => {
  const tokens = parseTokens('@theme{--color-a:12px}')
  expect(() => resolveColor(tokens, 'var(--color-a)')).toThrow(/12px/)
  expect(() => resolveColor(tokens, 'var(--color-sumiu)')).toThrow('sumiu')
})

test('gradientStops lê os dois extremos da regra, ignorando regras vizinhas', () => {
  const css = `
    .a { background: linear-gradient(0deg, #000000, #ffffff); }
    .rpg-x,
    .rpg-y {
      border: 1px solid #54616f;
      background: linear-gradient(150deg, #172433, #111d2b);
    }`
  expect(gradientStops(css, '.rpg-y')).toEqual(STOPS)
  expect(gradientStops(css, '.rpg-x')).toEqual(STOPS)
  expect(gradientStops(css, '.a')).toEqual({ from: '#000000', to: '#ffffff' })
})

test('gradientSelectors lista só seletores de uma classe com fundo em gradiente', () => {
  const css = `
    .rpg-a, .rpg-b { background: linear-gradient(150deg, #172433, #111d2b); }
    .rpg-c { background: #172433; }
    .rpg-d [role='x'] > div { background: linear-gradient(90deg, #3da781, #92dab8); }
    .rpg-e::after { background: linear-gradient(0deg, #10203199, transparent 45%); }
    .rpg-f { background: linear-gradient(160deg, #142231, #0d1825); }`
  expect(gradientSelectors(css)).toEqual(['.rpg-a', '.rpg-b', '.rpg-f'])
})

test('o comentário antes da regra não suja o seletor, e as regras do mesmo seletor se somam', () => {
  const css = `
    /* Apresentação legada, .rpg-y incluído. */
    .rpg-x,
    .rpg-y { background: linear-gradient(150deg, #172433, #111d2b); }
    .rpg-y { border-top: 2px solid #c98b22; color: #f1dcbb; }`
  expect(gradientStops(css, '.rpg-y')).toEqual(STOPS)
  expect(gradientSelectors(css)).toEqual(['.rpg-x', '.rpg-y'])
  expect(declaredColor(css, '.rpg-y', 'color')).toBe('#f1dcbb')
})

test('gradientStops falha se o seletor perdeu o gradiente ou não existe', () => {
  const css = '.rpg-x { background: #172433; }'
  expect(() => gradientStops(css, '.rpg-x')).toThrow('.rpg-x')
  expect(() => gradientStops(css, '.rpg-z')).toThrow('.rpg-z')
})

test('declaredColor lê color e o último termo de outline', () => {
  const css = `
    .a > .b { color: #f1dcbb; }
    .c:focus-visible { outline: 2px solid var(--color-x); outline-offset: 4px; }`
  expect(declaredColor(css, '.a > .b', 'color')).toBe('#f1dcbb')
  expect(declaredColor(css, '.c:focus-visible', 'outline')).toBe('var(--color-x)')
})

test('declaredColor falha se a regra ou a propriedade sumiu', () => {
  const css = '.a { color: #000000; }'
  expect(() => declaredColor(css, '.nada', 'color')).toThrow('.nada')
  expect(() => declaredColor(css, '.a', 'outline')).toThrow('outline')
})

const TOKENS = parseTokens(`
  @theme { --color-text-muted: #a9b6c6; --color-slate-400: #90a1b9; --color-slate-700: #334155; }
`)

test('colorUsesIn acha texto, borda e anel pela existência do token, não pelo nome', () => {
  const source = `
    className="text-sm text-slate-400 border border-slate-700 focus-visible:ring-2 text-text-muted
      lg:border-slate-700 border-b-2 ring-offset-2 text-left"`
  expect(colorUsesIn(source, TOKENS)).toEqual([
    { kind: 'text', key: 'slate-400', translucent: false },
    { kind: 'border', key: 'slate-700', translucent: false },
    { kind: 'text', key: 'text-muted', translucent: false },
    { kind: 'border', key: 'slate-700', translucent: false },
  ])
})

test('colorUsesIn marca a opacidade, que o contraste medido não cobre', () => {
  expect(colorUsesIn('text-slate-400/60 border-slate-700/70', TOKENS)).toEqual([
    { kind: 'text', key: 'slate-400', translucent: true },
    { kind: 'border', key: 'slate-700', translucent: true },
  ])
})

function failures(source: string, decorative: Readonly<Record<string, readonly string[]>> = {}) {
  return panelContrastFailures({
    panel: '.rpg-x',
    stops: STOPS,
    tokens: TOKENS,
    sources: [{ path: 'src/A.tsx', text: source }],
    decorative,
  })
}

test('texto claro e borda de campo claras passam nos dois extremos', () => {
  expect(failures('text-slate-400 text-text-muted')).toEqual([])
})

test('texto escuro sobre o gradiente reprova com o par, a razão e o extremo', () => {
  const [first] = failures('text-slate-700')
  expect(first).toBe('.rpg-x · src/A.tsx · text-slate-700 = 1.51 < 4.5 sobre #172433')
  expect(failures('text-slate-700')).toHaveLength(2)
})

test('o mínimo de borda e anel é 3, não 4,5', () => {
  // #90a1b9 sobre #172433 mede 6,0: passa com folga nos dois mínimos.
  expect(failures('border-slate-400 ring-slate-400')).toEqual([])
  const dark = parseTokens('@theme{--color-slate-500:#3a4a5e}')
  const [first] = panelContrastFailures({
    panel: '.rpg-x',
    stops: STOPS,
    tokens: dark,
    sources: [{ path: 'src/A.tsx', text: 'border-slate-500' }],
    decorative: {},
  })
  expect(first).toMatch(/^\.rpg-x · src\/A\.tsx · border-slate-500 = 1\.\d\d < 3 sobre #172433$/)
})

test('texto com opacidade reprova por não ser medido; borda translúcida é ignorada', () => {
  expect(failures('text-slate-400/60')).toEqual([
    '.rpg-x · src/A.tsx · text-slate-400: opacidade em texto não é medida',
  ])
  expect(failures('border-slate-700/70')).toEqual([])
})

test('a borda decorativa declarada por arquivo escapa; a mesma em outro arquivo não', () => {
  expect(failures('border-slate-700', { 'src/A.tsx': ['border-slate-700'] })).toEqual([])
  expect(failures('border-slate-700', { 'src/B.tsx': ['border-slate-700'] })).toHaveLength(2)
})

test('arquivo sem nenhuma cor resolvida reprova, em vez de passar vazio', () => {
  expect(failures('flex gap-2 text-sm')).toEqual([
    '.rpg-x · src/A.tsx: nenhuma cor de texto, borda ou anel resolvida',
  ])
})
