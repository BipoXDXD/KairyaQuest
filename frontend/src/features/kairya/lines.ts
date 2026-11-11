import type { MessageKey } from '../../shared/i18n/catalog'
import type {
  CelebrationReason,
  GreetingPeriod,
  KairyaEvent,
  SayTopic,
  SpokenEvent,
} from './events'

/**
 * As 36 falas gravadas, por grupo. A ordem dos grupos define a de `LINE_IDS`;
 * o texto de cada id mora no catálogo, em `kairya.lines.<id>`.
 */
export const LINE_GROUPS = {
  greetMorning: ['greet_morning_1', 'greet_morning_2'],
  greetAfternoon: ['greet_afternoon_1', 'greet_afternoon_2'],
  greetEvening: ['greet_evening_1', 'greet_evening_2'],
  missionDone: ['mission_done_1', 'mission_done_2', 'mission_done_3', 'mission_done_4'],
  weeklyTrialDone: ['weekly_trial_done_1', 'weekly_trial_done_2'],
  levelUp: ['level_up_1', 'level_up_2', 'level_up_3'],
  achievement: ['achievement_1', 'achievement_2', 'achievement_3'],
  evalMeets: ['eval_meets_1', 'eval_meets_2'],
  evalPartial: ['eval_partial_1', 'eval_partial_2'],
  evalNotMeets: ['eval_not_meets_1', 'eval_not_meets_2'],
  streakKept: ['streak_kept_1', 'streak_kept_2'],
  comeback: ['comeback_1', 'comeback_2'],
  weekPlanCreated: ['week_plan_created_1', 'week_plan_created_2'],
  proposalAccepted: ['proposal_accepted_1', 'proposal_accepted_2'],
  tutorOffline: ['tutor_offline_1', 'tutor_offline_2'],
  farewell: ['farewell_1', 'farewell_2'],
} as const satisfies Record<string, readonly [string, ...string[]]>

export type LineGroup = keyof typeof LINE_GROUPS

export type LineId = (typeof LINE_GROUPS)[LineGroup][number]

export const LINE_IDS: readonly LineId[] = Object.values(LINE_GROUPS).flat()

/** Os grupos que abrem o dia: só eles são anunciados ao leitor de tela (D11). */
export const OPENING_GROUPS: readonly LineGroup[] = [
  'greetMorning',
  'greetAfternoon',
  'greetEvening',
  'comeback',
]

const OPENING_IDS: ReadonlySet<LineId> = new Set(
  OPENING_GROUPS.flatMap((group) => LINE_GROUPS[group]),
)

const GREETING_GROUP: Readonly<Record<GreetingPeriod, LineGroup>> = {
  morning: 'greetMorning',
  afternoon: 'greetAfternoon',
  evening: 'greetEvening',
}

const CELEBRATION_GROUP: Readonly<Record<CelebrationReason, LineGroup>> = {
  missionDone: 'missionDone',
  dailyDone: 'streakKept',
  weeklyTrialDone: 'weeklyTrialDone',
  levelUp: 'levelUp',
  achievement: 'achievement',
}

const CONCERN_GROUP: Readonly<Record<'streakReset' | 'evalNotMeets', LineGroup>> = {
  streakReset: 'comeback',
  evalNotMeets: 'evalNotMeets',
}

const SAY_GROUP: Readonly<Record<SayTopic, LineGroup>> = {
  evalMeets: 'evalMeets',
  evalPartial: 'evalPartial',
  proposalAccepted: 'proposalAccepted',
  weekPlanCreated: 'weekPlanCreated',
  farewell: 'farewell',
}

/** A chave do catálogo com o texto da fala. */
export function lineKey(id: LineId): MessageKey {
  return `kairya.lines.${id}`
}

/** As falas possíveis para o evento; vazio quando o evento não tem fala. */
export function linesFor(event: KairyaEvent): readonly LineId[] {
  const group = groupFor(event)
  return group === null ? [] : LINE_GROUPS[group]
}

function groupFor(event: KairyaEvent): LineGroup | null {
  switch (event.type) {
    case 'greet':
      return GREETING_GROUP[event.period]
    case 'celebrate':
      return CELEBRATION_GROUP[event.reason]
    case 'concern':
      return CONCERN_GROUP[event.reason]
    case 'say':
      return SAY_GROUP[event.topic]
    case 'tutorFailed':
      return event.offline ? 'tutorOffline' : null
    case 'userTyped':
    case 'draftCleared':
    case 'questionSent':
    case 'firstToken':
    case 'answerFinished':
    case 'celebrationEnded':
    case 'dismissed':
      return null
  }
}

/**
 * Uma fala do evento, escolhida pela semente: a mesma semente dá a mesma fala.
 * A semente é truncada e reduzida ao resto não negativo, então qualquer número
 * finito serve; semente não finita lança `RangeError`.
 */
export function pickLine(event: SpokenEvent, seed: number): LineId {
  if (!Number.isFinite(seed)) throw new RangeError('pickLine: seed precisa ser finita')
  const lines = linesFor(event)
  const n = lines.length
  const s = Math.trunc(seed)
  return lines[((s % n) + n) % n]
}

/** `true` só para as falas de abertura do dia (saudações e retorno). */
export function isOpeningLine(id: LineId): boolean {
  return OPENING_IDS.has(id)
}

/**
 * Quantas frases o texto tem: cada trecho terminado em `.`, `?` ou `!` seguido
 * de espaço ou fim conta uma, e um trecho final sem pontuação conta mais uma.
 * Trechos vazios não contam.
 */
export function sentenceCount(text: string): number {
  return text.split(/(?<=[.?!])(?:\s+|$)/).filter((part) => part.trim() !== '').length
}
