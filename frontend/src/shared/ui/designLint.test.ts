/// <reference types="node" />
import { expect, test } from 'vitest'
import { listSources, readSource } from '../../test/readSource'

// Lê do disco (C1): o ?raw de CSS volta vazio no Vitest 5.0.1. Os *.test.tsx ficam fora:
// a regra governa o que vai para o app, e um teste pode citar uma classe proibida para afirmar a ausência dela.
const sources: Record<string, string> = Object.fromEntries(
  listSources('src/**/*.{ts,tsx,css}', { excludeTests: true }).map((p) => [p, readSource(p)]),
)

const RULES: readonly { name: string; pattern: RegExp }[] = [
  {
    name: 'paleta padrão do Tailwind',
    pattern:
      /\b(?:bg|text|border(?:-[trblxyse])?|ring|ring-offset|outline|from|via|to|fill|stroke|divide|placeholder|accent|caret|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?\b/,
  },
  { name: 'valor arbitrário', pattern: /\b[a-z-]+-\[[^\]]+\]/ },
  { name: 'variável CSS arbitrária em classe', pattern: /\b[a-z-]+-\(--[^)]+\)/ },
  { name: 'caixa alta', pattern: /\buppercase\b|text-transform:\s*uppercase/ },
  // 500 só em título, pela regra de h1–h4 do base.css: a Alegreya Sans não tem 500 e cairia para 400 em silêncio (M8).
  {
    name: 'peso fora de 400/500/700',
    pattern:
      /\bfont-(?:thin|extralight|light|medium|semibold|extrabold|black)\b|font-weight:\s*(?:100|200|300|600|800|900)\b/,
  },
  {
    name: 'raio fora de ui/pill',
    pattern:
      /\brounded(?:-(?:[trblsexy]{1,2}))?-(?:xs|sm|md|lg|xl|2xl|3xl|4xl|full)\b|\brounded\b(?!-)/,
  },
  // Mira utilitários de classe. Declarações de CSS (`--shadow-*: initial`, `box-shadow:`, `filter: drop-shadow(`) não casam:
  // o lookbehind exclui `--shadow-`, e `drop-shadow(` não tem o hífen seguido de nome.
  {
    name: 'sombra ou desfoque fora do glow',
    pattern:
      /(?<![-\w])shadow-(?!glow-lantern\b)[a-z0-9]|\bdrop-shadow-[a-z0-9]|\binset-shadow-[a-z0-9]|(?<![-\w])(?:backdrop-)?blur(?:-[a-z0-9]+)?\b/,
  },
  {
    name: 'espaço fora da escala',
    pattern:
      /\b-?(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|top|right|bottom|left)-(?:5|7|9|10|11|14|20|24|28|32|36|40|44|48|52|56|60|64|72|80|96|0\.5|1\.5|2\.5|3\.5)\b/,
  },
  { name: 'token legado --fq-', pattern: /--fq-/ },
]

// Catraca: só encolhe. As Tarefas 4.6–4.9 tiram arquivos daqui; a 4.9 apaga a lista.
const PENDING_MIGRATION: ReadonlySet<string> = new Set([
  'src/App.tsx',
  'src/app/SideNav.tsx',
  'src/features/campaigns/CampaignTrail.tsx',
  'src/features/missions/CycleSection.tsx',
  'src/features/missions/EvaluationPanel.tsx',
  'src/features/missions/EvidenceForm.tsx',
  'src/features/missions/MissionCard.tsx',
  'src/features/missions/MissionList.tsx',
  'src/features/missions/RescheduleForm.tsx',
  'src/features/missions/RescheduleHistory.tsx',
  'src/features/missions/RewardAnnouncement.tsx',
  'src/features/progression/ProgressPanel.tsx',
  'src/features/tutoring/DecisionControls.tsx',
  'src/features/tutoring/ProposalCard.tsx',
  'src/features/tutoring/RescheduleProposalCard.tsx',
  'src/features/tutoring/TutorConversation.tsx',
  'src/features/tutoring/TutorPanel.tsx',
  'src/pages/Campaigns.tsx',
  'src/pages/Headquarters.tsx',
  'src/shared/i18n/LocaleSwitcher.tsx',
])

test('a varredura enxerga o CSS de verdade', () => {
  expect(sources['src/styles/tokens.css']).toContain('--ink-950')
  expect(sources['src/index.css']).toMatch(/@import/)
})

test('a varredura enxerga as classes que moram em .ts (base de todo botão)', () => {
  expect(sources['src/shared/ui/buttonBase.ts']).toContain('min-h-11')
})

test.each([
  ['shadow-lg', true],
  ['drop-shadow-md', true],
  ['blur-sm', true],
  ['rounded-full', true],
  ['font-medium', true],
  ['shadow-glow-lantern', false],
  ['--shadow-*: initial;', false],
  ['filter: drop-shadow(0 0 12px red);', false],
  ['box-shadow: none;', false],
])('as regras acusam %s → %s', (text, flagged) => {
  expect(RULES.some(({ pattern }) => pattern.test(text))).toBe(flagged)
})

test.each(RULES)('nenhum arquivo fora da lista pendente viola: $name', ({ pattern }) => {
  const offenders = Object.entries(sources)
    .filter(([path, text]) => !PENDING_MIGRATION.has(path) && pattern.test(text))
    .map(([path]) => path)
  expect(offenders).toEqual([])
})

test('a lista pendente não tem arquivo já limpo nem arquivo inexistente', () => {
  const stale = [...PENDING_MIGRATION].filter(
    (p) => !(p in sources) || RULES.every(({ pattern }) => !pattern.test(sources[p])),
  )
  expect(stale).toEqual([])
})
