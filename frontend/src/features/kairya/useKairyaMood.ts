import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { CaptionDetail, CelebrationReason, KairyaEvent, Mood, SpokenEvent } from './events'
import { pickLine, type LineId } from './lines'

type EventType = KairyaEvent['type']

/**
 * As transições da expressão. Par ausente quer dizer que o humor fica: a
 * tabela lista só o que muda (spec §4, D3 e Review Focus 1 e 2).
 */
const TRANSITIONS: Readonly<Record<Mood, Partial<Record<EventType, Mood>>>> = {
  idle: {
    userTyped: 'listening',
    questionSent: 'thinking',
    tutorFailed: 'concerned',
    celebrate: 'celebrating',
    concern: 'concerned',
  },
  listening: {
    draftCleared: 'idle',
    questionSent: 'thinking',
    tutorFailed: 'concerned',
    celebrate: 'celebrating',
    concern: 'concerned',
  },
  // `answerFinished` sai de `thinking` porque uma resposta vazia (done sem
  // delta) não pode deixar o rosto preso em "pensando".
  thinking: { firstToken: 'speaking', answerFinished: 'idle', tutorFailed: 'concerned' },
  speaking: { answerFinished: 'idle', tutorFailed: 'concerned' },
  celebrating: { questionSent: 'thinking', celebrationEnded: 'idle', dismissed: 'idle' },
  concerned: {
    userTyped: 'listening',
    questionSent: 'thinking',
    celebrate: 'celebrating',
    dismissed: 'idle',
    // A saudação do novo dia conta como a "próxima ação" que tira do "não atende".
    greet: 'idle',
  },
}

/** O humor depois do evento; evento sem transição devolve o mesmo humor. */
export function nextMood(mood: Mood, event: KairyaEvent): Mood {
  return TRANSITIONS[mood][event.type] ?? mood
}

/** A fala na bolha: o id gravado e o detalhe que só a legenda mostra. */
export interface SpeechCue {
  line: LineId
  detail: CaptionDetail | null
}

/** Humor e fala separados (D1); `celebration` só existe durante `celebrating`. */
export interface PresenceState {
  mood: Mood
  cue: SpeechCue | null
  celebration: CelebrationReason | null
  /** Cresce a cada celebração nova; a troca por prioridade o mantém (D2). */
  celebrationId: number
}

export const INITIAL_PRESENCE: PresenceState = {
  mood: 'idle',
  cue: null,
  celebration: null,
  celebrationId: 0,
}

/** Uma celebração por vez: só a de prioridade maior troca a fala (D2). */
export const CELEBRATION_PRIORITY: Readonly<Record<CelebrationReason, number>> = {
  weeklyTrialDone: 5,
  levelUp: 4,
  achievement: 3,
  dailyDone: 2,
  missionDone: 1,
}

/** Humores em que a saudação entra; os demais a deixam esperar (D4). */
const GREETABLE: ReadonlySet<Mood> = new Set<Mood>(['idle', 'listening', 'concerned'])

export interface PresenceAction {
  event: KairyaEvent
  /** Escolhe a fala do grupo; a mesma semente dá a mesma fala. */
  seed: number
}

/**
 * Decide humor e fala. Evento ignorado devolve a mesma referência de `state`,
 * o que permite a `acceptsEvent` saber se o evento seria aceito.
 */
export function presenceReducer(state: PresenceState, action: PresenceAction): PresenceState {
  const { event, seed } = action
  const mood = nextMood(state.mood, event)
  const moodChanged = mood !== state.mood
  // Sem `default`: o retorno declarado obriga cada `type` a ter `case`, então
  // um evento novo sem caso não compila (mesma forma de `groupFor`, em lines.ts).
  switch (event.type) {
    case 'celebrate':
      return celebrate(state, event, seed)
    case 'concern':
      return moodChanged ? { ...state, mood, cue: spoken(event, seed) } : state
    case 'tutorFailed':
      if (!moodChanged) return state
      return {
        ...state,
        mood,
        cue: event.offline ? spoken({ type: 'tutorFailed', offline: true }, seed) : null,
      }
    case 'greet':
      return GREETABLE.has(state.mood) ? { ...state, mood, cue: spoken(event, seed) } : state
    case 'say':
      return state.mood === 'celebrating' ? state : { ...state, cue: spoken(event, seed) }
    case 'questionSent':
      return moodChanged ? { ...state, mood, cue: null, celebration: null } : state
    case 'dismissed':
      // Com fala presente, fechar é aceito em qualquer humor (D3).
      if (!moodChanged && state.cue === null) return state
      return { ...state, mood, cue: null, celebration: null }
    case 'celebrationEnded':
      // A fala fica na bolha depois dos 3 s (D3): só o humor e o motivo saem.
      return moodChanged ? { ...state, mood, celebration: null } : state
    case 'userTyped':
    case 'draftCleared':
    case 'firstToken':
    case 'answerFinished':
      return moodChanged ? { ...state, mood } : state
  }
}

/** `true` quando o estado aceitaria o evento, isto é, o reducer mudaria algo. */
export function acceptsEvent(state: PresenceState, event: KairyaEvent): boolean {
  return presenceReducer(state, { event, seed: 0 }) !== state
}

function celebrate(
  state: PresenceState,
  event: Extract<KairyaEvent, { type: 'celebrate' }>,
  seed: number,
): PresenceState {
  const cue = spoken(event, seed)
  const current = state.celebration
  if (current !== null) {
    // Troca sem reiniciar o timer: `celebrationId` fica (Review Focus 1).
    return CELEBRATION_PRIORITY[event.reason] > CELEBRATION_PRIORITY[current]
      ? { ...state, cue, celebration: event.reason }
      : state
  }
  if (nextMood(state.mood, event) !== 'celebrating') return state
  return {
    mood: 'celebrating',
    cue,
    celebration: event.reason,
    celebrationId: state.celebrationId + 1,
  }
}

function spoken(event: SpokenEvent, seed: number): SpeechCue {
  return { line: pickLine(event, seed), detail: event.type === 'celebrate' ? event.detail : null }
}

/** Agenda `run` depois de `ms` e devolve o cancelamento. */
export type Scheduler = (run: () => void, ms: number) => () => void

export const browserScheduler: Scheduler = (run, ms) => {
  const id = window.setTimeout(run, ms)
  return () => {
    window.clearTimeout(id)
  }
}

/** Quanto tempo o rosto fica em `celebrating` (spec §4); a fala fica além disso (D3). */
export const CELEBRATION_MS = 3000

/** Faixa da semente: inteiros não negativos de 31 bits. */
const SEED_RANGE = 2 ** 31

export interface PresenceOptions {
  scheduler?: Scheduler
  random?: () => number
}

export interface KairyaPresence {
  state: PresenceState
  dispatch: (event: KairyaEvent) => void
}

/**
 * Guarda a presença e encerra a celebração depois de `CELEBRATION_MS`.
 * `dispatch` tem identidade estável; o timer só reinicia com celebração nova.
 */
export function useKairyaMood(options: PresenceOptions = {}): KairyaPresence {
  const { scheduler = browserScheduler, random = Math.random } = options
  const [state, apply] = useReducer(presenceReducer, INITIAL_PRESENCE)
  // Em ref para que um `scheduler` ou `random` recriado a cada render não
  // reinicie o timer nem troque a identidade de `dispatch`.
  const schedulerRef = useRef(scheduler)
  const randomRef = useRef(random)
  useEffect(() => {
    schedulerRef.current = scheduler
    randomRef.current = random
  }, [scheduler, random])

  const dispatch = useCallback((event: KairyaEvent) => {
    apply({ event, seed: Math.floor(randomRef.current() * SEED_RANGE) })
  }, [])

  const isCelebrating = state.mood === 'celebrating'
  const { celebrationId } = state
  useEffect(() => {
    if (!isCelebrating) return undefined
    return schedulerRef.current(() => {
      apply({ event: { type: 'celebrationEnded' }, seed: 0 })
    }, CELEBRATION_MS)
  }, [isCelebrating, celebrationId])

  return { state, dispatch }
}
