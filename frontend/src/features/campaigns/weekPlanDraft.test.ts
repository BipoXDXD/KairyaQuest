import { describe, expect, it } from 'vitest'
import {
  COUNTER_VISIBLE_FROM,
  DAYS_IN_PLAN,
  MAX_TEXT_LENGTH,
  copyMondayToUntouched,
  dayFieldKey,
  emptyDraft,
  isDayReady,
  toPlanBody,
  trialFieldKey,
  validateDraft,
  type DayDraft,
  type PlanDraft,
} from './weekPlanDraft'

const FILLED: DayDraft = {
  instructions: 'Resolver listas',
  criterion: 'Cinco exercicios corrigidos',
  difficulty: 3,
  minutes: '40',
}

function filledDraft(): PlanDraft {
  const draft = emptyDraft()
  return {
    ...draft,
    days: draft.days.map(() => ({ ...FILLED })),
    trial: { instructions: 'Prova simulada', criterion: 'Nota 7', minutes: '90' },
  }
}

function withDay(index: number, patch: Partial<DayDraft>): PlanDraft {
  const draft = filledDraft()
  return { ...draft, days: draft.days.map((d, i) => (i === index ? { ...d, ...patch } : d)) }
}

describe('emptyDraft', () => {
  it('abre na semana atual, com sete treinos nos padroes e a prova em branco', () => {
    const draft = emptyDraft()
    expect(draft.week).toBe('current')
    expect(draft.days).toHaveLength(DAYS_IN_PLAN)
    expect(draft.days[0]).toEqual({ instructions: '', criterion: '', difficulty: 2, minutes: '25' })
    expect(draft.trial).toEqual({ instructions: '', criterion: '', minutes: '25' })
  })

  it('cada treino e um objeto proprio', () => {
    const draft = emptyDraft()
    expect(draft.days[0]).not.toBe(draft.days[1])
  })
})

describe('validateDraft', () => {
  it('o rascunho vazio reprova os dois textos de cada treino e da prova, e so isso', () => {
    const issues = validateDraft(emptyDraft())
    expect(issues).toHaveLength(2 * DAYS_IN_PLAN + 2)
    expect(issues.every((i) => i.error === 'required')).toBe(true)
  })

  it('lista na ordem da tela: segunda a domingo, depois a prova', () => {
    const keys = validateDraft(emptyDraft()).map((i) => i.key)
    expect(keys[0]).toBe('day-0-instructions')
    expect(keys[1]).toBe('day-0-criterion')
    expect(keys[2]).toBe('day-1-instructions')
    expect(keys.slice(-2)).toEqual(['trial-instructions', 'trial-criterion'])
  })

  it('um rascunho completo e valido', () => {
    expect(validateDraft(filledDraft())).toEqual([])
  })

  it('so espacos conta como vazio', () => {
    expect(validateDraft(withDay(2, { instructions: '  \n\t ' }))).toEqual([
      { key: 'day-2-instructions', day: 2, error: 'required' },
    ])
  })

  it.each([
    ['1 caractere', 'a', null],
    ['500 caracteres', 'a'.repeat(MAX_TEXT_LENGTH), null],
    ['501 caracteres', 'a'.repeat(MAX_TEXT_LENGTH + 1), 'tooLong'],
    ['500 unidades UTF-16 com emoji (250 emojis)', '😀'.repeat(MAX_TEXT_LENGTH / 2), null],
    ['502 unidades UTF-16 com emoji (251 emojis)', '😀'.repeat(MAX_TEXT_LENGTH / 2 + 1), 'tooLong'],
    ['501 com espacos nas pontas que caem fora', ` ${'a'.repeat(MAX_TEXT_LENGTH)} `, null],
  ])('texto com %s', (_name, text, error) => {
    const issues = validateDraft(withDay(0, { criterion: text }))
    expect(issues).toEqual(error === null ? [] : [{ key: 'day-0-criterion', day: 0, error }])
  })

  it.each([
    ['0', 'minutesRange'],
    ['1', null],
    ['1440', null],
    ['1441', 'minutesRange'],
    ['-5', 'minutesRange'],
    ['1.5', 'minutesRange'],
    ['1e2', 'minutesRange'],
    ['abc', 'minutesRange'],
    ['', 'required'],
    ['   ', 'required'],
    [' 25 ', null],
  ])('minutos %j', (minutes, error) => {
    expect(validateDraft(withDay(4, { minutes }))).toEqual(
      error === null ? [] : [{ key: 'day-4-minutes', day: 4, error }],
    )
  })

  it.each([
    [0, 'required'],
    [1, null],
    [5, null],
    [6, 'required'],
    [2.5, 'required'],
  ])('dificuldade %d', (difficulty, error) => {
    expect(validateDraft(withDay(1, { difficulty }))).toEqual(
      error === null ? [] : [{ key: 'day-1-difficulty', day: 1, error }],
    )
  })

  it('os campos da prova tem as mesmas regras, sem dificuldade', () => {
    const draft = {
      ...filledDraft(),
      trial: { instructions: '', criterion: 'a'.repeat(501), minutes: '1441' },
    }
    expect(validateDraft(draft)).toEqual([
      { key: 'trial-instructions', day: null, error: 'required' },
      { key: 'trial-criterion', day: null, error: 'tooLong' },
      { key: 'trial-minutes', day: null, error: 'minutesRange' },
    ])
  })

  it.each([
    ['no meio', 'a\u0000b'],
    ['sozinho', '\u0000'],
    ['depois de espacos', '  \u0000'],
  ])('NUL %s e recusado, e nao vira "vazio"', (_name, text) => {
    expect(validateDraft(withDay(0, { instructions: text }))).toEqual([
      { key: 'day-0-instructions', day: 0, error: 'invalidChars' },
    ])
  })

  it('NUL tambem e recusado na prova', () => {
    const draft = { ...filledDraft(), trial: { ...filledDraft().trial, criterion: 'x\u0000' } }
    expect(validateDraft(draft)).toEqual([
      { key: 'trial-criterion', day: null, error: 'invalidChars' },
    ])
  })
})

describe('isDayReady', () => {
  it('pronto so com os quatro campos validos', () => {
    expect(isDayReady(FILLED, 0)).toBe(true)
    expect(isDayReady({ ...FILLED, criterion: '' }, 0)).toBe(false)
    expect(isDayReady({ ...FILLED, minutes: '0' }, 3)).toBe(false)
  })
})

describe('copyMondayToUntouched', () => {
  it('copia a segunda para os dias intocados', () => {
    const draft = {
      ...emptyDraft(),
      days: emptyDraft().days.map((d, i) => (i === 0 ? { ...FILLED } : d)),
    }
    const copied = copyMondayToUntouched(draft)
    expect(copied.days).toHaveLength(DAYS_IN_PLAN)
    expect(copied.days.every((d) => d.instructions === FILLED.instructions)).toBe(true)
    expect(copied.days[6]).toEqual(FILLED)
  })

  it('nao toca no dia onde a pessoa escreveu qualquer coisa', () => {
    const base = emptyDraft()
    const draft: PlanDraft = {
      ...base,
      days: base.days.map((d, i) => {
        if (i === 0) return { ...FILLED }
        if (i === 1) return { ...d, instructions: 'meu texto' }
        if (i === 2) return { ...d, criterion: 'meu criterio' }
        if (i === 3) return { ...d, difficulty: 4 }
        if (i === 4) return { ...d, minutes: '60' }
        return d
      }),
    }
    const copied = copyMondayToUntouched(draft)
    expect(copied.days[1]).toEqual(draft.days[1])
    expect(copied.days[2]).toEqual(draft.days[2])
    expect(copied.days[3]).toEqual(draft.days[3])
    expect(copied.days[4]).toEqual(draft.days[4])
    expect(copied.days[5]).toEqual(FILLED)
  })

  it('a copia e independente: editar um dia nao muda os outros', () => {
    const base = emptyDraft()
    const copied = copyMondayToUntouched({ ...base, days: [{ ...FILLED }, ...base.days.slice(1)] })
    expect(copied.days[1]).not.toBe(copied.days[0])
    expect(copied.days[1]).not.toBe(copied.days[2])
  })

  it('preserva a semana e a prova', () => {
    const draft = { ...filledDraft(), week: 'next' as const }
    const copied = copyMondayToUntouched(draft)
    expect(copied.week).toBe('next')
    expect(copied.trial).toEqual(draft.trial)
  })
})

describe('toPlanBody', () => {
  it('monta exatamente o corpo do PlanCreate, com texto sem as pontas e numeros', () => {
    const draft = filledDraft()
    draft.days[0] = {
      instructions: '  Ler  ',
      criterion: ' Resumo\n',
      difficulty: 4,
      minutes: ' 30 ',
    }
    draft.trial = { instructions: ' Prova ', criterion: ' Nota ', minutes: '120' }
    const body = toPlanBody(draft, '2026-09-28')
    expect(Object.keys(body).sort()).toEqual(['bonus', 'days', 'week_start'])
    expect(body.week_start).toBe('2026-09-28')
    expect(body.days).toHaveLength(7)
    expect(body.days[0]).toEqual({
      instructions: 'Ler',
      completion_criterion: 'Resumo',
      difficulty: 4,
      estimated_minutes: 30,
    })
    expect(body.bonus).toEqual({
      instructions: 'Prova',
      completion_criterion: 'Nota',
      estimated_minutes: 120,
    })
    expect(Object.keys(body.bonus).sort()).toEqual([
      'completion_criterion',
      'estimated_minutes',
      'instructions',
    ])
  })
})

describe('chaves e constantes', () => {
  it('chaves de campo', () => {
    expect(dayFieldKey(3, 'minutes')).toBe('day-3-minutes')
    expect(trialFieldKey('criterion')).toBe('trial-criterion')
  })

  it('o contador aparece a 90% do teto', () => {
    expect(COUNTER_VISIBLE_FROM).toBe(450)
  })
})
