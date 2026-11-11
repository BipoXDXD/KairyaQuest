import { useCallback, useEffect, useRef, useState } from 'react'
import type { GreetingPeriod, KairyaEvent } from './events'
import { acceptsEvent, type KairyaPresence } from './useKairyaMood'

export const GREETING_STORAGE_KEY = 'kairyaquest.lastGreeting'
export const STREAK_STORAGE_KEY = 'kairyaquest.lastStreak'
/** O dia e o período da saudação seguem o fuso do produto, não o do navegador. */
export const PRESENCE_TIME_ZONE = 'America/Sao_Paulo'

const MORNING_STARTS_AT = 5
const AFTERNOON_STARTS_AT = 12
const EVENING_STARTS_AT = 18

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: PRESENCE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const HOUR_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: PRESENCE_TIME_ZONE,
  hour: 'numeric',
  hourCycle: 'h23',
})

const CIVIL_DAY = /^\d{4}-\d{2}-\d{2}$/
const NON_NEGATIVE_INTEGER = /^\d+$/

/** O dia civil em São Paulo, `'YYYY-MM-DD'`. */
export function civilDayInSaoPaulo(now: Date): string {
  return DAY_FORMAT.format(now)
}

/** O período pela hora de São Paulo: `[05, 12)` manhã, `[12, 18)` tarde, o resto noite. */
export function greetingPeriod(now: Date): GreetingPeriod {
  const hour = Number(HOUR_FORMAT.format(now))
  if (hour >= MORNING_STARTS_AT && hour < AFTERNOON_STARTS_AT) return 'morning'
  if (hour >= AFTERNOON_STARTS_AT && hour < EVENING_STARTS_AT) return 'afternoon'
  return 'evening'
}

/** O que a abertura do dia lembra entre visitas. */
export interface DailyMemory {
  greetedDay(): string | null
  markGreeted(day: string): void
  lastStreak(): number | null
  rememberStreak(streak: number): void
}

/**
 * Memória sobre o `Storage`. Toda leitura e escrita engole a falha (modo
 * privado, cota, `SecurityError`) porque a memória só evita repetir a
 * saudação: perder o valor não quebra nada, e o hook ainda lembra o dia
 * saudado na sessão. Valor inválido vira `null`.
 */
export function storageMemory(storage: Storage | null): DailyMemory {
  const read = (key: string): string | null => {
    try {
      return storage === null ? null : storage.getItem(key)
    } catch {
      return null
    }
  }
  const write = (key: string, value: string): void => {
    try {
      storage?.setItem(key, value)
    } catch {
      // Sem onde gravar: a saudação passa a valer uma vez por sessão.
    }
  }
  return {
    greetedDay() {
      const raw = read(GREETING_STORAGE_KEY)
      return raw !== null && CIVIL_DAY.test(raw) ? raw : null
    },
    markGreeted(day) {
      write(GREETING_STORAGE_KEY, day)
    },
    lastStreak() {
      const raw = read(STREAK_STORAGE_KEY)
      if (raw === null || !NON_NEGATIVE_INTEGER.test(raw)) return null
      const streak = Number(raw)
      return Number.isSafeInteger(streak) ? streak : null
    },
    rememberStreak(streak) {
      // Só grava o que `lastStreak` aceitaria ler de volta.
      if (!Number.isSafeInteger(streak) || streak < 0) return
      write(STREAK_STORAGE_KEY, String(streak))
    },
  }
}

export interface OpeningInput {
  streak: number
  lastStreak: number | null
  greetedDay: string | null
  today: string
  period: GreetingPeriod
}

/**
 * A abertura do dia: nada se o dia já foi saudado; `comeback` se a sequência
 * caiu de mais que zero para zero; senão a saudação do período (D4).
 */
export function decideOpening(input: OpeningInput): KairyaEvent | null {
  if (input.greetedDay === input.today) return null
  if (input.lastStreak !== null && input.lastStreak > 0 && input.streak === 0) {
    return { type: 'concern', reason: 'streakReset' }
  }
  return { type: 'greet', period: input.period }
}

/** A abertura decidida que espera a presença aceitar o evento. */
export interface PendingOpening {
  event: KairyaEvent
  today: string
  streak: number
}

export interface DailyOpeningOptions {
  clock?: () => Date
  /** `null` desliga a memória; ausente usa `window.localStorage`. */
  storage?: Storage | null
}

/**
 * Devolve o callback chamado a cada leitura bem-sucedida do ciclo. A
 * abertura decidida fica pendente até `acceptsEvent` permitir; só então é
 * despachada e gravada na memória (D4, Review Focus 2).
 */
export function useDailyOpening(
  presence: KairyaPresence,
  options: DailyOpeningOptions = {},
): (streak: number) => void {
  const { clock = systemClock } = options
  const [memory] = useState(() =>
    storageMemory(options.storage === undefined ? defaultStorage() : options.storage),
  )
  const { state, dispatch } = presence
  const clockRef = useRef(clock)
  const presenceRef = useRef({ state, dispatch })
  // A pendente fica em ref porque o efeito que a consome não pode chamar
  // `setState` (render em cascata). `pendingVersion` só agenda esse efeito
  // para depois do render, quando a presença já tem os eventos despachados
  // no mesmo tique (uma pergunta enviada junto com a leitura do ciclo).
  const pending = useRef<PendingOpening | null>(null)
  const [pendingVersion, setPendingVersion] = useState(0)
  // O dia saudado nesta sessão vence a memória: com `localStorage` quebrado,
  // a saudação continua saindo uma vez só (Review Focus 3).
  const sessionGreetedDay = useRef<string | null>(null)

  const consumePending = useCallback(() => {
    const opening = pending.current
    if (opening === null) return
    // Pendente de outro dia sai sem despachar nem gravar; a próxima leitura
    // do ciclo decide de novo com o dia certo.
    if (civilDayInSaoPaulo(clockRef.current()) !== opening.today) {
      pending.current = null
      return
    }
    // Limitação aceita: o estado é o do último commit. Um evento enfileirado
    // entre o commit e este efeito (ex.: `questionSent`) faz o reducer ignorar
    // a saudação que já foi gravada como feita; ver HANDOFF, pendências da F6.
    if (!acceptsEvent(presenceRef.current.state, opening.event)) return
    pending.current = null
    presenceRef.current.dispatch(opening.event)
    memory.markGreeted(opening.today)
    memory.rememberStreak(opening.streak)
    sessionGreetedDay.current = opening.today
  }, [memory])

  useEffect(() => {
    clockRef.current = clock
  }, [clock])

  useEffect(() => {
    presenceRef.current = { state, dispatch }
    consumePending()
  }, [state, dispatch, consumePending, pendingVersion])

  const onCycleRead = useCallback(
    (streak: number) => {
      const now = clockRef.current()
      const today = civilDayInSaoPaulo(now)
      const greetedDay = sessionGreetedDay.current === today ? today : memory.greetedDay()
      const event = decideOpening({
        streak,
        lastStreak: memory.lastStreak(),
        greetedDay,
        today,
        period: greetingPeriod(now),
      })
      if (event === null) {
        // Dia já saudado (por outra aba, por exemplo): a pendente perdeu o
        // sentido e não pode regravar uma sequência mais velha que esta.
        pending.current = null
        memory.rememberStreak(streak)
        return
      }
      // Uma leitura nova substitui a pendente anterior.
      pending.current = { event, today, streak }
      setPendingVersion((version) => version + 1)
    },
    [memory],
  )

  return onCycleRead
}

function systemClock(): Date {
  return new Date()
}

function defaultStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    // Ler a propriedade já lança em alguns navegadores com storage bloqueado.
    return null
  }
}
