import { describe, expect, it, test } from 'vitest'
import { SFX_NAMES, type SfxName } from '../../shared/audio/sfx'
import type { MissionType, Verdict } from '../../shared/types/mission'
import type { Reward } from '../../shared/types/reward'
import type { KairyaEvent } from './events'
import type { LineId } from './lines'
import { sfxForCompletion, sfxForEvaluation, sfxForOpening, sfxForTutorEvent } from './soundCues'

const CONQUISTA = { code: 'streak_7', title: 'Sequência de 7', description: 'Sete dias seguidos' }

const SO_XP: Reward = {
  xp_awarded: 100,
  xp_total: 140,
  level_before: 3,
  level_after: 3,
  achievements_unlocked: [],
}
const COM_NIVEL: Reward = { ...SO_XP, level_after: 4 }
const COM_CONQUISTA: Reward = { ...SO_XP, achievements_unlocked: [CONQUISTA] }
const COM_NIVEL_E_CONQUISTA: Reward = { ...COM_NIVEL, achievements_unlocked: [CONQUISTA] }

type CompletionCase = [string, { type: MissionType; reward: Reward | null | undefined }, SfxName]
const COMPLETION_CASES: CompletionCase[] = [
  ['avulsa', { type: 'avulsa', reward: SO_XP }, 'mission_done'],
  ['especial', { type: 'especial', reward: SO_XP }, 'mission_done'],
  ['especial com nível', { type: 'especial', reward: COM_NIVEL }, 'level_up'],
  ['diária', { type: 'diaria', reward: SO_XP }, 'lantern_lit'],
  ['diária com nível e conquista', { type: 'diaria', reward: COM_NIVEL_E_CONQUISTA }, 'level_up'],
  ['avulsa com conquista', { type: 'avulsa', reward: COM_CONQUISTA }, 'achievement'],
  ['diária sem reward', { type: 'diaria', reward: null }, 'lantern_lit'],
  ['avulsa com reward ausente', { type: 'avulsa', reward: undefined }, 'mission_done'],
]

type EvaluationCase = [
  { verdict: Verdict | null; reward: Reward | null | undefined },
  SfxName | null,
]
const EVALUATION_CASES: EvaluationCase[] = [
  [{ verdict: 'atende', reward: SO_XP }, 'xp_tick'],
  [{ verdict: 'atende', reward: COM_NIVEL }, 'level_up'],
  [{ verdict: 'atende', reward: COM_CONQUISTA }, 'achievement'],
  [{ verdict: 'atende', reward: COM_NIVEL_E_CONQUISTA }, 'level_up'],
  [{ verdict: 'atende', reward: null }, null],
  [{ verdict: 'atende', reward: undefined }, null],
  [{ verdict: 'parcial', reward: null }, null],
  [{ verdict: 'parcial', reward: SO_XP }, null],
  [{ verdict: 'nao_atende', reward: null }, null],
  [{ verdict: null, reward: SO_XP }, null],
]

const TUTOR_CASES: [KairyaEvent, SfxName | null][] = [
  [{ type: 'questionSent' }, 'message_sent'],
  [{ type: 'tutorFailed', offline: false }, 'soft_error'],
  [{ type: 'tutorFailed', offline: true }, 'soft_error'],
  [{ type: 'firstToken' }, null],
  [{ type: 'userTyped' }, null],
]

const OPENING_CASES: [LineId, number | null, SfxName | null][] = [
  ['greet_morning_1', 3, 'streak_kept'],
  ['greet_afternoon_2', 1, 'streak_kept'],
  ['greet_evening_2', 1, 'streak_kept'],
  ['greet_afternoon_1', 0, null],
  ['greet_morning_1', null, null],
  ['comeback_1', 3, null],
  ['mission_done_1', 3, null],
]

/** Ligados direto nos componentes (LanternTrail, TutorPanel), sem função pura. */
const PAGE_WIRED: readonly SfxName[] = [
  'proposal_arrived',
  'panel_open',
  'weekly_trial_unlocked',
  'trail_step',
]

describe('sfxForCompletion', () => {
  test.each(COMPLETION_CASES)('%s', (_name, done, expected) => {
    expect(sfxForCompletion(done)).toBe(expected)
  })
})

describe('sfxForEvaluation', () => {
  test.each(EVALUATION_CASES)('%o -> %s', (done, expected) => {
    expect(sfxForEvaluation(done)).toBe(expected)
  })
})

describe('sfxForTutorEvent', () => {
  test.each(TUTOR_CASES)('%o -> %s', (event, expected) => {
    expect(sfxForTutorEvent(event)).toBe(expected)
  })
})

describe('sfxForOpening', () => {
  test.each(OPENING_CASES)('%s com sequência %s -> %s', (line, streak, expected) => {
    expect(sfxForOpening({ line, detail: null }, streak)).toBe(expected)
  })
})

it('todo SfxName é produzido por algum gatilho', () => {
  const produced = new Set<SfxName | null>([
    ...COMPLETION_CASES.map(([, done]) => sfxForCompletion(done)),
    ...EVALUATION_CASES.map(([done]) => sfxForEvaluation(done)),
    ...TUTOR_CASES.map(([event]) => sfxForTutorEvent(event)),
    ...OPENING_CASES.map(([line, streak]) => sfxForOpening({ line, detail: null }, streak)),
    ...PAGE_WIRED,
  ])
  produced.delete(null)
  expect(produced).toEqual(new Set(SFX_NAMES))
})
