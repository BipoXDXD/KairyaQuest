import { describe, expect, expectTypeOf, it } from 'vitest'
import { CATALOGS, type MessageKey } from '../../shared/i18n/catalog'
import { LOCALES } from '../../shared/i18n/locale'
import type { KairyaEvent } from './events'
import {
  isOpeningLine,
  LINE_GROUPS,
  LINE_IDS,
  lineKey,
  linesFor,
  pickLine,
  sentenceCount,
  type LineGroup,
  type LineId,
} from './lines'

describe('catálogo de falas da Kairya', () => {
  it('há exatamente 36 ids, sem repetição', () => {
    expect(LINE_IDS).toHaveLength(36)
    expect(new Set(LINE_IDS).size).toBe(36)
  })

  it.each<[LineGroup, number]>([
    ['greetMorning', 2],
    ['greetAfternoon', 2],
    ['greetEvening', 2],
    ['missionDone', 4],
    ['weeklyTrialDone', 2],
    ['levelUp', 3],
    ['achievement', 3],
    ['evalMeets', 2],
    ['evalPartial', 2],
    ['evalNotMeets', 2],
    ['streakKept', 2],
    ['comeback', 2],
    ['weekPlanCreated', 2],
    ['proposalAccepted', 2],
    ['tutorOffline', 2],
    ['farewell', 2],
  ])('o grupo %s tem %d falas (spec §4)', (group, n) => {
    expect(LINE_GROUPS[group]).toHaveLength(n)
  })

  it('todo LineId tem chave no catálogo, nos dois idiomas', () => {
    expectTypeOf<`kairya.lines.${LineId}`>().toExtend<MessageKey>()
    for (const locale of LOCALES) {
      for (const id of LINE_IDS) expect(CATALOGS[locale][lineKey(id)].trim()).not.toBe('')
    }
  })

  it('nenhuma fala gravada cita número ou placeholder', () => {
    for (const locale of LOCALES) {
      for (const id of LINE_IDS) {
        const text = CATALOGS[locale][lineKey(id)]
        expect(text, `${locale} ${id}`).not.toMatch(/\d/)
        expect(text, `${locale} ${id}`).not.toMatch(/[{}]/)
      }
    }
  })

  it.each<[string, number]>([
    ['Feito.', 1],
    ['Feito. Isso é treino de verdade.', 2],
    ['Boa tarde. Bom te ver. O que cabe agora?', 3],
    ['Um. Dois. Três. Quatro.', 4],
    ['Sem ponto final', 1],
    ['Pouco tempo? Escolhe uma.', 2],
    ['Isso! Feito.', 2],
    ['Pronto!', 1],
    ['a.b', 1],
    ['Ex.:a', 1],
    ['Quê?!Sim', 1],
    ['', 0],
  ])('sentenceCount(%j) → %d', (text, n) => expect(sentenceCount(text)).toBe(n))

  it('cada fala tem até 12 palavras e até 3 frases, sem exceção', () => {
    for (const locale of LOCALES) {
      for (const id of LINE_IDS) {
        const text = CATALOGS[locale][lineKey(id)]
        expect(text.split(/\s+/).length, `${locale} ${id}`).toBeLessThanOrEqual(12)
        expect(sentenceCount(text), `${locale} ${id}`).toBeLessThanOrEqual(3)
      }
    }
  })

  it('só as falas de abertura do dia são anunciadas (D11)', () => {
    expect(LINE_IDS.filter(isOpeningLine)).toEqual([
      'greet_morning_1',
      'greet_morning_2',
      'greet_afternoon_1',
      'greet_afternoon_2',
      'greet_evening_1',
      'greet_evening_2',
      'comeback_1',
      'comeback_2',
    ])
  })

  it('nenhuma fala usa aversão à perda (spec §3)', () => {
    const perda =
      /vai perder|vão perder|não perca|perder sua|última chance|\blose\b|\blosing\b|don't miss|last chance|before it's gone/i
    for (const locale of LOCALES) {
      for (const id of LINE_IDS) expect(CATALOGS[locale][lineKey(id)]).not.toMatch(perda)
    }
  })

  it.each<[KairyaEvent, readonly LineId[]]>([
    [{ type: 'greet', period: 'evening' }, ['greet_evening_1', 'greet_evening_2']],
    [{ type: 'celebrate', reason: 'dailyDone', detail: null }, ['streak_kept_1', 'streak_kept_2']],
    [{ type: 'concern', reason: 'streakReset' }, ['comeback_1', 'comeback_2']],
    [{ type: 'tutorFailed', offline: true }, ['tutor_offline_1', 'tutor_offline_2']],
    [{ type: 'tutorFailed', offline: false }, []],
    [{ type: 'firstToken' }, []],
  ])('linesFor(%o)', (event, expected) => {
    expect(linesFor(event)).toEqual(expected)
  })

  it.each<[KairyaEvent, LineGroup]>([
    [{ type: 'greet', period: 'morning' }, 'greetMorning'],
    [{ type: 'greet', period: 'afternoon' }, 'greetAfternoon'],
    [{ type: 'celebrate', reason: 'missionDone', detail: null }, 'missionDone'],
    [{ type: 'celebrate', reason: 'weeklyTrialDone', detail: null }, 'weeklyTrialDone'],
    [{ type: 'celebrate', reason: 'levelUp', detail: { kind: 'level', level: 4 } }, 'levelUp'],
    [{ type: 'celebrate', reason: 'achievement', detail: null }, 'achievement'],
    [{ type: 'concern', reason: 'evalNotMeets' }, 'evalNotMeets'],
    [{ type: 'say', topic: 'evalMeets' }, 'evalMeets'],
    [{ type: 'say', topic: 'evalPartial' }, 'evalPartial'],
    [{ type: 'say', topic: 'proposalAccepted' }, 'proposalAccepted'],
    [{ type: 'say', topic: 'weekPlanCreated' }, 'weekPlanCreated'],
    [{ type: 'say', topic: 'farewell' }, 'farewell'],
  ])('linesFor(%o) devolve o grupo %s', (event, group) => {
    expect(linesFor(event)).toEqual(LINE_GROUPS[group])
  })

  const silentEvents: KairyaEvent[] = [
    { type: 'userTyped' },
    { type: 'draftCleared' },
    { type: 'questionSent' },
    { type: 'answerFinished' },
    { type: 'celebrationEnded' },
    { type: 'dismissed' },
  ]

  it.each(silentEvents)('o evento $type não tem fala', (event) => {
    expect(linesFor(event)).toEqual([])
  })

  it('pickLine escolhe dentro do grupo do evento', () => {
    expect(pickLine({ type: 'say', topic: 'farewell' }, 1)).toBe('farewell_2')
    expect(pickLine({ type: 'tutorFailed', offline: true }, 0)).toBe('tutor_offline_1')
  })

  it.each<[number, LineId]>([
    [0, 'mission_done_1'],
    [3, 'mission_done_4'],
    [4, 'mission_done_1'],
    [-1, 'mission_done_4'],
    [1.9, 'mission_done_2'],
  ])('pickLine é determinístico: seed %d → %s', (seed, expected) => {
    expect(pickLine({ type: 'celebrate', reason: 'missionDone', detail: null }, seed)).toBe(
      expected,
    )
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'pickLine falha alto com seed não finita (%d)',
    (seed) => {
      expect(() => pickLine({ type: 'say', topic: 'farewell' }, seed)).toThrow(
        new RangeError('pickLine: seed precisa ser finita'),
      )
    },
  )
})
