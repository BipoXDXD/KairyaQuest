import type { WeekChoice } from './planDates'
import type { PlanCreateBody } from './types'

/**
 * O teto de cada texto, em unidades UTF-16 (`String.length`): a mesma conta do
 * `maxLength` do campo e do contador. Espelha
 * `TAMANHO_MAXIMO_DO_TEXTO_DO_PLANO` do backend, que responde 422 acima dele;
 * `tests/unit/test_limite_do_texto_do_plano.py` prende os dois valores.
 */
export const MAX_TEXT_LENGTH = 500

/** A partir de quantos caracteres o contador aparece: 90% do teto. */
export const COUNTER_VISIBLE_FROM = (MAX_TEXT_LENGTH * 9) / 10

export const DAYS_IN_PLAN = 7
export const MIN_DIFFICULTY = 1
export const MAX_DIFFICULTY = 5
export const MIN_MINUTES = 1
/** Minutos de um dia (`MINUTOS_DO_DIA`, no backend). */
export const MAX_MINUTES = 1440

/** 2 de 5: nem facil demais nem puxado, para o primeiro plano nao assustar. */
export const DEFAULT_DIFFICULTY = 2
/** Um pomodoro: o tamanho que a voz da Kairya ja promete ("vinte minutos contam"). */
export const DEFAULT_MINUTES = '25'

/** Os minutos ficam como texto: o campo numerico vazio e um estado valido do rascunho. */
export interface DayDraft {
  instructions: string
  criterion: string
  difficulty: number
  minutes: string
}

export interface TrialDraft {
  instructions: string
  criterion: string
  minutes: string
}

export interface PlanDraft {
  week: WeekChoice
  days: DayDraft[]
  trial: TrialDraft
}

export type TextField = 'instructions' | 'criterion'
export type DayField = TextField | 'difficulty' | 'minutes'
export type TrialField = TextField | 'minutes'

/** Por que um campo nao pode sair, como chave do catalogo resolve (`campaigns.form.error.*`). */
export type FieldError = 'required' | 'tooLong' | 'minutesRange' | 'invalidChars'

/**
 * Um campo invalido. `key` e a identidade do campo na tela (ex.: `day-0-minutes`,
 * `trial-criterion`); `day` e o indice do treino, ou `null` na prova.
 */
export interface FieldIssue {
  key: string
  day: number | null
  error: FieldError
}

export function dayFieldKey(day: number, field: DayField): string {
  return `day-${day}-${field}`
}

export function trialFieldKey(field: TrialField): string {
  return `trial-${field}`
}

function emptyDay(): DayDraft {
  return {
    instructions: '',
    criterion: '',
    difficulty: DEFAULT_DIFFICULTY,
    minutes: DEFAULT_MINUTES,
  }
}

/** O rascunho de abertura: esta semana, sete treinos em branco e a prova em branco. */
export function emptyDraft(): PlanDraft {
  return {
    week: 'current',
    days: Array.from({ length: DAYS_IN_PLAN }, emptyDay),
    trial: { instructions: '', criterion: '', minutes: DEFAULT_MINUTES },
  }
}

function textError(value: string): FieldError | null {
  // U+0000: o servidor o recusa (`rejeitar_nul`) e a coluna de texto nao o
  // guarda. Nao se remove em silencio: a pessoa e quem decide.
  if (value.includes('\u0000')) {
    return 'invalidChars'
  }
  const text = value.trim()
  if (text === '') {
    return 'required'
  }
  return text.length > MAX_TEXT_LENGTH ? 'tooLong' : null
}

function minutesError(value: string): FieldError | null {
  const text = value.trim()
  if (text === '') {
    return 'required'
  }
  // So digitos: "1e2" e "1.5" sao aceitos pelo campo numerico, mas nao sao
  // minutos inteiros que o usuario quis dizer.
  if (!/^\d+$/.test(text)) {
    return 'minutesRange'
  }
  const minutes = Number(text)
  return minutes < MIN_MINUTES || minutes > MAX_MINUTES ? 'minutesRange' : null
}

function difficultyError(value: number): FieldError | null {
  return Number.isInteger(value) && value >= MIN_DIFFICULTY && value <= MAX_DIFFICULTY
    ? null
    : 'required'
}

function dayIssues(day: DayDraft, index: number): FieldIssue[] {
  const checks: [DayField, FieldError | null][] = [
    ['instructions', textError(day.instructions)],
    ['criterion', textError(day.criterion)],
    ['difficulty', difficultyError(day.difficulty)],
    ['minutes', minutesError(day.minutes)],
  ]
  return checks.flatMap(([field, error]) =>
    error === null ? [] : [{ key: dayFieldKey(index, field), day: index, error }],
  )
}

function trialIssues(trial: TrialDraft): FieldIssue[] {
  const checks: [TrialField, FieldError | null][] = [
    ['instructions', textError(trial.instructions)],
    ['criterion', textError(trial.criterion)],
    ['minutes', minutesError(trial.minutes)],
  ]
  return checks.flatMap(([field, error]) =>
    error === null ? [] : [{ key: trialFieldKey(field), day: null, error }],
  )
}

/** Todos os campos invalidos, na ordem da tela: treinos de segunda a domingo, depois a prova. */
export function validateDraft(draft: PlanDraft): FieldIssue[] {
  return [...draft.days.flatMap(dayIssues), ...trialIssues(draft.trial)]
}

/** O treino esta pronto: nenhum dos quatro campos tem problema. */
export function isDayReady(day: DayDraft, index: number): boolean {
  return dayIssues(day, index).length === 0
}

/**
 * O dia nao foi tocado: sem texto e com os padroes de dificuldade e minutos.
 * So esses dias recebem a copia de segunda; um dia onde a pessoa ja mexeu em
 * qualquer coisa nao e sobrescrito.
 */
function isUntouched(day: DayDraft): boolean {
  return (
    day.instructions.trim() === '' &&
    day.criterion.trim() === '' &&
    day.difficulty === DEFAULT_DIFFICULTY &&
    day.minutes === DEFAULT_MINUTES
  )
}

/** Copia a segunda para os dias intocados; os demais ficam exatamente como estao. */
export function copyMondayToUntouched(draft: PlanDraft): PlanDraft {
  const [monday, ...others] = draft.days
  return {
    ...draft,
    days: [monday, ...others.map((day) => (isUntouched(day) ? { ...monday } : day))],
  }
}

/**
 * O corpo do POST, so com as chaves de `PlanCreateBody` e os textos sem as
 * pontas. Chame so com o rascunho valido (`validateDraft` vazio): e a fronteira
 * que converte texto de tela em numero.
 */
export function toPlanBody(draft: PlanDraft, weekStart: string): PlanCreateBody {
  return {
    week_start: weekStart,
    days: draft.days.map((day) => ({
      instructions: day.instructions.trim(),
      completion_criterion: day.criterion.trim(),
      difficulty: day.difficulty,
      estimated_minutes: Number(day.minutes.trim()),
    })),
    bonus: {
      instructions: draft.trial.instructions.trim(),
      completion_criterion: draft.trial.criterion.trim(),
      estimated_minutes: Number(draft.trial.minutes.trim()),
    },
  }
}
