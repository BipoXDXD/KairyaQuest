import { describe, expect, it } from 'vitest'
import type { KairyaEvent, Mood } from './events'
import {
  acceptsEvent,
  CELEBRATION_PRIORITY,
  INITIAL_PRESENCE,
  nextMood,
  presenceReducer,
  type PresenceState,
  type SpeechCue,
} from './useKairyaMood'

const MOODS: readonly Mood[] = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'celebrating',
  'concerned',
]

const ALL: readonly KairyaEvent[] = [
  { type: 'userTyped' },
  { type: 'draftCleared' },
  { type: 'questionSent' },
  { type: 'firstToken' },
  { type: 'answerFinished' },
  { type: 'tutorFailed', offline: false },
  { type: 'celebrate', reason: 'missionDone', detail: null },
  { type: 'celebrationEnded' },
  { type: 'concern', reason: 'evalNotMeets' },
  { type: 'dismissed' },
  { type: 'greet', period: 'morning' },
  { type: 'say', topic: 'evalMeets' },
]

const TABLE: Readonly<Record<Mood, Readonly<Record<KairyaEvent['type'], Mood>>>> = {
  idle: {
    userTyped: 'listening',
    draftCleared: 'idle',
    questionSent: 'thinking',
    firstToken: 'idle',
    answerFinished: 'idle',
    tutorFailed: 'concerned',
    celebrate: 'celebrating',
    celebrationEnded: 'idle',
    concern: 'concerned',
    dismissed: 'idle',
    greet: 'idle',
    say: 'idle',
  },
  listening: {
    userTyped: 'listening',
    draftCleared: 'idle',
    questionSent: 'thinking',
    firstToken: 'listening',
    answerFinished: 'listening',
    tutorFailed: 'concerned',
    celebrate: 'celebrating',
    celebrationEnded: 'listening',
    concern: 'concerned',
    dismissed: 'listening',
    greet: 'listening',
    say: 'listening',
  },
  thinking: {
    userTyped: 'thinking',
    draftCleared: 'thinking',
    questionSent: 'thinking',
    firstToken: 'speaking',
    answerFinished: 'idle',
    tutorFailed: 'concerned',
    celebrate: 'thinking',
    celebrationEnded: 'thinking',
    concern: 'thinking',
    dismissed: 'thinking',
    greet: 'thinking',
    say: 'thinking',
  },
  speaking: {
    userTyped: 'speaking',
    draftCleared: 'speaking',
    questionSent: 'speaking',
    firstToken: 'speaking',
    answerFinished: 'idle',
    tutorFailed: 'concerned',
    celebrate: 'speaking',
    celebrationEnded: 'speaking',
    concern: 'speaking',
    dismissed: 'speaking',
    greet: 'speaking',
    say: 'speaking',
  },
  celebrating: {
    userTyped: 'celebrating',
    draftCleared: 'celebrating',
    questionSent: 'thinking',
    firstToken: 'celebrating',
    answerFinished: 'celebrating',
    tutorFailed: 'celebrating',
    celebrate: 'celebrating',
    celebrationEnded: 'idle',
    concern: 'celebrating',
    dismissed: 'idle',
    greet: 'celebrating',
    say: 'celebrating',
  },
  concerned: {
    userTyped: 'listening',
    draftCleared: 'concerned',
    questionSent: 'thinking',
    firstToken: 'concerned',
    answerFinished: 'concerned',
    tutorFailed: 'concerned',
    celebrate: 'celebrating',
    celebrationEnded: 'concerned',
    concern: 'concerned',
    dismissed: 'idle',
    greet: 'idle',
    say: 'concerned',
  },
}

const CUE: SpeechCue = { line: 'greet_morning_1', detail: null }

function stateIn(mood: Mood): PresenceState {
  return {
    ...INITIAL_PRESENCE,
    mood,
    celebration: mood === 'celebrating' ? 'missionDone' : null,
  }
}

function celebrating(): PresenceState {
  return presenceReducer(INITIAL_PRESENCE, {
    event: { type: 'celebrate', reason: 'missionDone', detail: null },
    seed: 0,
  })
}

describe('nextMood', () => {
  it.each(MOODS.flatMap((mood) => ALL.map((event) => [mood, event] as const)))(
    'nextMood(%s, %o) segue a tabela',
    (mood, event) => {
      expect(nextMood(mood, event)).toBe(TABLE[mood][event.type])
    },
  )
})

describe('presenceReducer', () => {
  it('estado inicial é idle, sem fala nem celebração', () => {
    expect(INITIAL_PRESENCE).toEqual({
      mood: 'idle',
      cue: null,
      celebration: null,
      celebrationId: 0,
    })
  })

  it('prioridades de celebração seguem D2', () => {
    expect(CELEBRATION_PRIORITY).toEqual({
      weeklyTrialDone: 5,
      levelUp: 4,
      achievement: 3,
      dailyDone: 2,
      missionDone: 1,
    })
  })

  it('evento ignorado devolve a mesma referência de estado', () => {
    const s: PresenceState = { ...INITIAL_PRESENCE, mood: 'speaking' }
    expect(
      presenceReducer(s, {
        event: { type: 'celebrate', reason: 'levelUp', detail: null },
        seed: 0,
      }),
    ).toBe(s)
  })

  it('celebração entra com fala, motivo e id novo', () => {
    const s = presenceReducer(INITIAL_PRESENCE, {
      event: { type: 'celebrate', reason: 'levelUp', detail: { kind: 'level', level: 5 } },
      seed: 0,
    })
    expect(s).toEqual({
      mood: 'celebrating',
      cue: { line: 'level_up_1', detail: { kind: 'level', level: 5 } },
      celebration: 'levelUp',
      celebrationId: 1,
    })
  })

  it('celebração a partir de concerned também entra com id novo', () => {
    const s: PresenceState = { ...INITIAL_PRESENCE, mood: 'concerned', celebrationId: 4 }
    expect(
      presenceReducer(s, {
        event: { type: 'celebrate', reason: 'dailyDone', detail: null },
        seed: 1,
      }),
    ).toEqual({
      mood: 'celebrating',
      cue: { line: 'streak_kept_2', detail: null },
      celebration: 'dailyDone',
      celebrationId: 5,
    })
  })

  it('celebração de prioridade maior troca a fala sem reiniciar (Review Focus 1)', () => {
    const a = celebrating()
    const b = presenceReducer(a, {
      event: { type: 'celebrate', reason: 'weeklyTrialDone', detail: null },
      seed: 1,
    })
    expect(b).toEqual({
      mood: 'celebrating',
      cue: { line: 'weekly_trial_done_2', detail: null },
      celebration: 'weeklyTrialDone',
      celebrationId: a.celebrationId,
    })
  })

  it('celebração de prioridade menor ou igual é ignorada (Review Focus 1)', () => {
    const a = presenceReducer(INITIAL_PRESENCE, {
      event: { type: 'celebrate', reason: 'levelUp', detail: null },
      seed: 0,
    })
    expect(
      presenceReducer(a, {
        event: { type: 'celebrate', reason: 'achievement', detail: null },
        seed: 0,
      }),
    ).toBe(a)
    expect(
      presenceReducer(a, {
        event: { type: 'celebrate', reason: 'levelUp', detail: null },
        seed: 2,
      }),
    ).toBe(a)
  })

  it('fim da celebração volta a idle e mantém a fala (D3)', () => {
    const a = celebrating()
    expect(presenceReducer(a, { event: { type: 'celebrationEnded' }, seed: 0 })).toEqual({
      mood: 'idle',
      cue: a.cue,
      celebration: null,
      celebrationId: a.celebrationId,
    })
  })

  it('fim da celebração fora de celebrating é ignorado', () => {
    const s: PresenceState = { ...INITIAL_PRESENCE, cue: CUE }
    expect(presenceReducer(s, { event: { type: 'celebrationEnded' }, seed: 0 })).toBe(s)
  })

  it('saudação fala sem mudar o humor', () => {
    expect(
      presenceReducer(INITIAL_PRESENCE, {
        event: { type: 'greet', period: 'afternoon' },
        seed: 1,
      }),
    ).toEqual({ ...INITIAL_PRESENCE, cue: { line: 'greet_afternoon_2', detail: null } })
  })

  it('saudação em listening fala e mantém listening', () => {
    const s: PresenceState = { ...INITIAL_PRESENCE, mood: 'listening' }
    expect(presenceReducer(s, { event: { type: 'greet', period: 'evening' }, seed: 0 })).toEqual({
      ...s,
      cue: { line: 'greet_evening_1', detail: null },
    })
  })

  it.each(['thinking', 'speaking', 'celebrating'] as const)('saudação é ignorada em %s', (mood) => {
    const s = stateIn(mood)
    expect(presenceReducer(s, { event: { type: 'greet', period: 'morning' }, seed: 0 })).toBe(s)
  })

  it('saudação a partir de concerned vai a idle com a fala do período (Review Focus 2)', () => {
    const s: PresenceState = {
      ...INITIAL_PRESENCE,
      mood: 'concerned',
      cue: { line: 'eval_not_meets_1', detail: null },
    }
    expect(presenceReducer(s, { event: { type: 'greet', period: 'morning' }, seed: 0 })).toEqual({
      mood: 'idle',
      cue: { line: 'greet_morning_1', detail: null },
      celebration: null,
      celebrationId: 0,
    })
  })

  it.each(['idle', 'listening', 'thinking', 'speaking', 'concerned'] as const)(
    '"say" em %s fala o tópico sem mudar o humor',
    (mood) => {
      const s = stateIn(mood)
      expect(
        presenceReducer(s, { event: { type: 'say', topic: 'proposalAccepted' }, seed: 0 }),
      ).toEqual({ ...s, cue: { line: 'proposal_accepted_1', detail: null } })
    },
  )

  it('"say" é ignorado durante a celebração', () => {
    const a = celebrating()
    expect(presenceReducer(a, { event: { type: 'say', topic: 'evalMeets' }, seed: 0 })).toBe(a)
  })

  it('falha offline fala tutor_offline', () => {
    const s: PresenceState = { ...INITIAL_PRESENCE, mood: 'thinking' }
    expect(presenceReducer(s, { event: { type: 'tutorFailed', offline: true }, seed: 1 })).toEqual({
      ...s,
      mood: 'concerned',
      cue: { line: 'tutor_offline_2', detail: null },
    })
  })

  it('falha comum vai a concerned e zera a fala', () => {
    const s: PresenceState = { ...INITIAL_PRESENCE, mood: 'speaking', cue: CUE }
    expect(presenceReducer(s, { event: { type: 'tutorFailed', offline: false }, seed: 0 })).toEqual(
      { ...s, mood: 'concerned', cue: null },
    )
  })

  it('falha durante a celebração é ignorada', () => {
    const a = celebrating()
    expect(presenceReducer(a, { event: { type: 'tutorFailed', offline: true }, seed: 0 })).toBe(a)
  })

  it.each([
    ['streakReset', 'comeback_1'],
    ['evalNotMeets', 'eval_not_meets_1'],
  ] as const)('concern %s aceito fala %s', (reason, line) => {
    expect(
      presenceReducer(INITIAL_PRESENCE, { event: { type: 'concern', reason }, seed: 0 }),
    ).toEqual({ ...INITIAL_PRESENCE, mood: 'concerned', cue: { line, detail: null } })
  })

  it('concern a partir de concerned é ignorado', () => {
    const s: PresenceState = { ...INITIAL_PRESENCE, mood: 'concerned', cue: CUE }
    expect(presenceReducer(s, { event: { type: 'concern', reason: 'streakReset' }, seed: 0 })).toBe(
      s,
    )
  })

  it('concern durante a celebração é ignorado (Review Focus 1)', () => {
    const a = celebrating()
    expect(
      presenceReducer(a, { event: { type: 'concern', reason: 'evalNotMeets' }, seed: 0 }),
    ).toBe(a)
  })

  it('questionSent limpa a fala e vai a thinking', () => {
    const s: PresenceState = { ...INITIAL_PRESENCE, mood: 'listening', cue: CUE }
    expect(presenceReducer(s, { event: { type: 'questionSent' }, seed: 0 })).toEqual({
      ...s,
      mood: 'thinking',
      cue: null,
    })
  })

  it('questionSent ignorado em thinking devolve a mesma referência', () => {
    const s: PresenceState = { ...INITIAL_PRESENCE, mood: 'thinking', cue: CUE }
    expect(presenceReducer(s, { event: { type: 'questionSent' }, seed: 0 })).toBe(s)
  })

  it('dismissed a partir de concerned volta a idle e limpa a fala', () => {
    const s: PresenceState = { ...INITIAL_PRESENCE, mood: 'concerned', cue: CUE }
    expect(presenceReducer(s, { event: { type: 'dismissed' }, seed: 0 })).toEqual({
      ...s,
      mood: 'idle',
      cue: null,
    })
  })

  it('dismissed a partir de concerned sem fala também volta a idle', () => {
    const s: PresenceState = { ...INITIAL_PRESENCE, mood: 'concerned' }
    expect(presenceReducer(s, { event: { type: 'dismissed' }, seed: 0 })).toEqual({
      ...s,
      mood: 'idle',
    })
  })

  it('dismissed a partir de celebrating volta a idle, sem fala nem celebração', () => {
    const a = celebrating()
    expect(presenceReducer(a, { event: { type: 'dismissed' }, seed: 0 })).toEqual({
      mood: 'idle',
      cue: null,
      celebration: null,
      celebrationId: a.celebrationId,
    })
  })

  it.each(['idle', 'listening', 'thinking', 'speaking'] as const)(
    'dismissed com fala em %s zera a fala e mantém o humor (D3)',
    (mood) => {
      const s: PresenceState = { ...INITIAL_PRESENCE, mood, cue: CUE }
      expect(presenceReducer(s, { event: { type: 'dismissed' }, seed: 0 })).toEqual({
        ...s,
        cue: null,
      })
    },
  )

  it.each(['idle', 'listening', 'thinking', 'speaking'] as const)(
    'dismissed sem fala em %s devolve a mesma referência',
    (mood) => {
      const s: PresenceState = { ...INITIAL_PRESENCE, mood }
      expect(presenceReducer(s, { event: { type: 'dismissed' }, seed: 0 })).toBe(s)
    },
  )

  it.each([
    ['userTyped', 'idle', 'listening'],
    ['draftCleared', 'listening', 'idle'],
    ['firstToken', 'thinking', 'speaking'],
    ['answerFinished', 'speaking', 'idle'],
  ] as const)('%s aceito (%s → %s) mantém a fala', (type, from, to) => {
    const s: PresenceState = { ...INITIAL_PRESENCE, mood: from, cue: CUE }
    expect(presenceReducer(s, { event: { type }, seed: 0 })).toEqual({ ...s, mood: to })
  })

  it.each(['userTyped', 'draftCleared', 'firstToken', 'answerFinished'] as const)(
    '%s sem transição devolve a mesma referência',
    (type) => {
      const s: PresenceState = { ...INITIAL_PRESENCE, mood: 'celebrating', celebration: 'levelUp' }
      expect(presenceReducer(s, { event: { type }, seed: 0 })).toBe(s)
    },
  )

  it.each(['celebrationEnded', 'dismissed', 'questionSent'] as const)(
    'sair de celebrating por %s zera celebration (invariante)',
    (type) => {
      expect(presenceReducer(celebrating(), { event: { type }, seed: 0 }).celebration).toBeNull()
    },
  )

  it('invariante celebration !== null ⇔ mood === celebrating em toda a tabela', () => {
    for (const mood of MOODS) {
      for (const event of ALL) {
        const next = presenceReducer(stateIn(mood), { event, seed: 0 })
        expect(next.celebration !== null).toBe(next.mood === 'celebrating')
      }
    }
  })
})

describe('acceptsEvent', () => {
  it.each<[Mood, KairyaEvent, boolean]>([
    ['speaking', { type: 'greet', period: 'morning' }, false],
    ['concerned', { type: 'greet', period: 'morning' }, true],
    ['thinking', { type: 'concern', reason: 'streakReset' }, false],
    ['idle', { type: 'concern', reason: 'streakReset' }, true],
  ])('acceptsEvent(%s, %o) → %s', (mood, event, expected) => {
    expect(acceptsEvent({ ...INITIAL_PRESENCE, mood }, event)).toBe(expected)
  })

  it('acceptsEvent(dismissed) depende da fala: com cue em idle → true; sem cue em idle → false', () => {
    expect(acceptsEvent({ ...INITIAL_PRESENCE, cue: CUE }, { type: 'dismissed' })).toBe(true)
    expect(acceptsEvent(INITIAL_PRESENCE, { type: 'dismissed' })).toBe(false)
  })
})
