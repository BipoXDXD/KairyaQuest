import { describe, expect, it } from 'vitest'
import type { MissionType } from '../../shared/types/mission'
import type { Reward } from '../../shared/types/reward'
import { completionEvents, evaluationEvents } from './celebration'
import type { CelebrationReason } from './events'
import { INITIAL_PRESENCE, presenceReducer, type PresenceState } from './useKairyaMood'

const CONQUISTAS = [
  { code: 'streak_7', title: 'Sequência de 7', description: 'Sete dias seguidos' },
  { code: 'first_week', title: 'Primeira semana', description: 'Uma semana completa' },
]

const SOBE_DE_NIVEL: Reward = {
  xp_awarded: 100,
  xp_total: 300,
  level_before: 1,
  level_after: 2,
  achievements_unlocked: CONQUISTAS,
}

const SO_XP: Reward = {
  xp_awarded: 100,
  xp_total: 140,
  level_before: 3,
  level_after: 3,
  achievements_unlocked: [],
}

const SO_NIVEL: Reward = { ...SO_XP, level_before: 3, level_after: 4 }

function fold(events: ReturnType<typeof completionEvents>): PresenceState {
  return events.reduce(
    (state, event) => presenceReducer(state, { event, seed: 0 }),
    INITIAL_PRESENCE,
  )
}

describe('completionEvents', () => {
  it.each<[MissionType, CelebrationReason]>([
    ['diaria', 'dailyDone'],
    ['especial', 'weeklyTrialDone'],
    ['avulsa', 'missionDone'],
  ])('%s sem recompensa → só a celebração do tipo', (type, reason) => {
    expect(completionEvents({ type, reward: null })).toEqual([
      { type: 'celebrate', reason, detail: null },
    ])
  })

  it.each([undefined, null])('reward %s celebra só a missão, sem exceção', (reward) => {
    expect(completionEvents({ type: 'avulsa', reward })).toEqual([
      { type: 'celebrate', reason: 'missionDone', detail: null },
    ])
  })

  it('nível novo e duas conquistas na diária somam três eventos, em ordem', () => {
    expect(completionEvents({ type: 'diaria', reward: SOBE_DE_NIVEL })).toEqual([
      { type: 'celebrate', reason: 'dailyDone', detail: null },
      { type: 'celebrate', reason: 'levelUp', detail: { kind: 'level', level: 2 } },
      {
        type: 'celebrate',
        reason: 'achievement',
        detail: { kind: 'achievements', items: CONQUISTAS },
      },
    ])
  })

  it('mesmo nível e sem conquistas → só o evento do tipo', () => {
    expect(completionEvents({ type: 'diaria', reward: SO_XP })).toEqual([
      { type: 'celebrate', reason: 'dailyDone', detail: null },
    ])
  })

  it('só nível novo → tipo e levelUp', () => {
    expect(completionEvents({ type: 'avulsa', reward: SO_NIVEL })).toEqual([
      { type: 'celebrate', reason: 'missionDone', detail: null },
      { type: 'celebrate', reason: 'levelUp', detail: { kind: 'level', level: 4 } },
    ])
  })

  it('só conquista, sem nível novo → tipo e achievement', () => {
    const reward = { ...SO_XP, achievements_unlocked: CONQUISTAS }
    expect(completionEvents({ type: 'avulsa', reward })).toEqual([
      { type: 'celebrate', reason: 'missionDone', detail: null },
      {
        type: 'celebrate',
        reason: 'achievement',
        detail: { kind: 'achievements', items: CONQUISTAS },
      },
    ])
  })

  it('dobrado pelo reducer, a diária com nível e conquista termina em levelUp', () => {
    const state = fold(completionEvents({ type: 'diaria', reward: SOBE_DE_NIVEL }))
    expect(state.celebration).toBe('levelUp')
    expect(state.cue).toEqual({ line: 'level_up_1', detail: { kind: 'level', level: 2 } })
  })
})

describe('evaluationEvents', () => {
  it.each([
    ['atende', [{ type: 'say', topic: 'evalMeets' }]],
    ['parcial', [{ type: 'say', topic: 'evalPartial' }]],
    ['nao_atende', [{ type: 'concern', reason: 'evalNotMeets' }]],
    [null, []],
  ] as const)('veredito %s', (verdict, expected) => {
    expect(evaluationEvents({ verdict, reward: null })).toEqual(expected)
  })

  it('reward ausente não lança nem acrescenta', () => {
    expect(evaluationEvents({ verdict: 'atende', reward: undefined })).toEqual([
      { type: 'say', topic: 'evalMeets' },
    ])
  })

  it('atende com bônus que sobe de nível → fala e levelUp', () => {
    expect(evaluationEvents({ verdict: 'atende', reward: SO_NIVEL })).toEqual([
      { type: 'say', topic: 'evalMeets' },
      { type: 'celebrate', reason: 'levelUp', detail: { kind: 'level', level: 4 } },
    ])
  })

  it('sem veredito mas com bônus, só a recompensa', () => {
    expect(evaluationEvents({ verdict: null, reward: SO_NIVEL })).toHaveLength(1)
  })

  it('a celebração vence o say no reducer', () => {
    const state = fold(evaluationEvents({ verdict: 'atende', reward: SO_NIVEL }))
    expect(state.celebration).toBe('levelUp')
    expect(state.cue?.line).toBe('level_up_1')
  })
})
