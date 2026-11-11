import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mood } from './events'
import { useDailyOpening } from './dailyOpening'
import {
  INITIAL_PRESENCE,
  useKairyaMood,
  type PresenceState,
  type Scheduler,
} from './useKairyaMood'

const MORNING_DAY_10 = '2026-11-10T12:00:00Z'

function failing(): never {
  throw new DOMException('denied', 'SecurityError')
}

const BROKEN_STORAGE: Storage = {
  length: 0,
  clear: failing,
  getItem: failing,
  key: failing,
  removeItem: failing,
  setItem: failing,
}

function stateIn(mood: Mood): PresenceState {
  return { ...INITIAL_PRESENCE, mood }
}

/**
 * Monta o hook com uma presença de teste: o estado vem do `rerender` e o
 * `dispatch` é um espião. O relógio lê `now`, que o teste move.
 */
function setup(options: { storage?: Storage | null; mood?: Mood; clock?: 'default' } = {}) {
  const dispatch = vi.fn()
  let now = new Date(MORNING_DAY_10)
  const clock = () => now
  const hookOptions =
    options.clock === 'default'
      ? { storage: options.storage }
      : 'storage' in options
        ? { clock, storage: options.storage }
        : { clock }
  const view = renderHook(
    ({ state }: { state: PresenceState }) => useDailyOpening({ state, dispatch }, hookOptions),
    { initialProps: { state: stateIn(options.mood ?? 'idle') } },
  )
  return {
    dispatch,
    setNow: (iso: string) => {
      now = new Date(iso)
    },
    read: (streak: number) => {
      act(() => {
        view.result.current(streak)
      })
    },
    moveTo: (mood: Mood) => {
      view.rerender({ state: stateIn(mood) })
    },
    view,
  }
}

describe('useDailyOpening', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('saúda uma vez por dia: duas leituras do ciclo no mesmo dia → um dispatch', () => {
    const t = setup()
    t.read(2)
    t.read(2)
    expect(t.dispatch).toHaveBeenCalledTimes(1)
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'greet', period: 'morning' })
  })

  it('grava kairyaquest.lastGreeting com o dia de São Paulo e kairyaquest.lastStreak com a sequência', () => {
    const t = setup()
    t.setNow('2026-11-11T02:30:00Z')
    t.read(4)
    expect(localStorage.getItem('kairyaquest.lastGreeting')).toBe('2026-11-10')
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBe('4')
  })

  it('dia já saudado na memória não saúda e atualiza a sequência na hora', () => {
    localStorage.setItem('kairyaquest.lastGreeting', '2026-11-10')
    localStorage.setItem('kairyaquest.lastStreak', '3')
    const t = setup()
    t.read(0)
    expect(t.dispatch).not.toHaveBeenCalled()
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBe('0')
  })

  it('o callback mantém a identidade entre renders', () => {
    const t = setup()
    const first = t.view.result.current
    t.moveTo('listening')
    expect(t.view.result.current).toBe(first)
  })

  it('virada do dia com a aba aberta: leitura após 00:00 de SP saúda de novo (Review Focus 2)', () => {
    const t = setup()
    t.setNow('2026-11-11T02:59:00Z')
    t.read(2)
    t.setNow('2026-11-11T03:01:00Z')
    t.read(2)
    expect(t.dispatch).toHaveBeenCalledTimes(2)
    expect(t.dispatch).toHaveBeenNthCalledWith(1, { type: 'greet', period: 'evening' })
    expect(t.dispatch).toHaveBeenNthCalledWith(2, { type: 'greet', period: 'evening' })
    expect(localStorage.getItem('kairyaquest.lastGreeting')).toBe('2026-11-11')
  })

  it('leitura do ciclo durante thinking adia a saudação até idle, sem gravar a memória antes (Review Focus 2)', () => {
    const t = setup({ mood: 'thinking' })
    t.read(2)
    expect(t.dispatch).not.toHaveBeenCalled()
    expect(localStorage.getItem('kairyaquest.lastGreeting')).toBeNull()
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBeNull()
    t.moveTo('speaking')
    expect(t.dispatch).not.toHaveBeenCalled()
    t.moveTo('idle')
    expect(t.dispatch).toHaveBeenCalledTimes(1)
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'greet', period: 'morning' })
    expect(localStorage.getItem('kairyaquest.lastGreeting')).toBe('2026-11-10')
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBe('2')
    t.moveTo('listening')
    expect(t.dispatch).toHaveBeenCalledTimes(1)
  })

  it('virada do dia com humor concerned saúda (Review Focus 2)', () => {
    const t = setup({ mood: 'concerned' })
    t.setNow('2026-11-11T03:01:00Z')
    t.read(2)
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'greet', period: 'evening' })
  })

  it('comeback durante speaking espera e lastStreak continua > 0 até ser despachado', () => {
    localStorage.setItem('kairyaquest.lastStreak', '3')
    const t = setup({ mood: 'speaking' })
    t.read(0)
    expect(t.dispatch).not.toHaveBeenCalled()
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBe('3')
    t.moveTo('idle')
    expect(t.dispatch).toHaveBeenCalledTimes(1)
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'concern', reason: 'streakReset' })
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBe('0')
  })

  it('leitura nova substitui a pendente: um dispatch só, com a sequência mais recente', () => {
    localStorage.setItem('kairyaquest.lastStreak', '3')
    const t = setup({ mood: 'thinking' })
    t.read(0)
    t.read(4)
    t.moveTo('idle')
    expect(t.dispatch).toHaveBeenCalledTimes(1)
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'greet', period: 'morning' })
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBe('4')
  })

  it('leitura de dia já saudado (outra aba) descarta a pendente e mantém a sequência nova', () => {
    const t = setup({ mood: 'thinking' })
    t.read(2)
    localStorage.setItem('kairyaquest.lastGreeting', '2026-11-10')
    t.read(5)
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBe('5')
    t.moveTo('idle')
    expect(t.dispatch).not.toHaveBeenCalled()
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBe('5')
  })

  it('pendente da véspera consumida depois da meia-noite de SP é descartada', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T02:59:00Z'))
    const t = setup({ mood: 'thinking', clock: 'default' })
    t.read(2)
    vi.setSystemTime(new Date('2026-11-11T03:01:00Z'))
    t.moveTo('idle')
    expect(t.dispatch).not.toHaveBeenCalled()
    expect(localStorage.getItem('kairyaquest.lastGreeting')).toBeNull()
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBeNull()
    t.read(2)
    expect(t.dispatch).toHaveBeenCalledTimes(1)
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'greet', period: 'evening' })
    expect(localStorage.getItem('kairyaquest.lastGreeting')).toBe('2026-11-11')
  })

  it('sequência que caiu para zero fala comeback em vez da saudação', () => {
    localStorage.setItem('kairyaquest.lastStreak', '5')
    const t = setup()
    t.read(0)
    expect(t.dispatch).toHaveBeenCalledTimes(1)
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'concern', reason: 'streakReset' })
  })

  it('com storage quebrado saúda uma vez por sessão e não lança (Review Focus 3)', () => {
    const t = setup({ storage: BROKEN_STORAGE })
    t.read(2)
    t.read(0)
    expect(t.dispatch).toHaveBeenCalledTimes(1)
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'greet', period: 'morning' })
  })

  it('com storage null saúda uma vez por sessão', () => {
    const t = setup({ storage: null })
    t.read(2)
    t.read(2)
    expect(t.dispatch).toHaveBeenCalledTimes(1)
  })

  it('sem storage informado usa o localStorage', () => {
    const t = setup()
    t.read(1)
    expect(localStorage.getItem('kairyaquest.lastStreak')).toBe('1')
  })

  it('localStorage inacessível (getter lança) vira memória vazia e saúda uma vez', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(failing)
    const t = setup()
    t.read(2)
    t.read(2)
    expect(t.dispatch).toHaveBeenCalledTimes(1)
  })

  it('pergunta enviada no mesmo tique da leitura adia a saudação (presença real)', () => {
    const scheduler: Scheduler = () => () => undefined
    const { result } = renderHook(() => {
      const presence = useKairyaMood({ scheduler, random: () => 0 })
      const onCycleRead = useDailyOpening(presence, { clock: () => new Date(MORNING_DAY_10) })
      return { presence, onCycleRead }
    })
    act(() => {
      result.current.presence.dispatch({ type: 'questionSent' })
      result.current.onCycleRead(2)
    })
    expect(result.current.presence.state).toEqual({ ...INITIAL_PRESENCE, mood: 'thinking' })
    expect(localStorage.getItem('kairyaquest.lastGreeting')).toBeNull()
    act(() => {
      result.current.presence.dispatch({ type: 'answerFinished' })
    })
    expect(result.current.presence.state.cue).toEqual({ line: 'greet_morning_1', detail: null })
    expect(localStorage.getItem('kairyaquest.lastGreeting')).toBe('2026-11-10')
  })
})
