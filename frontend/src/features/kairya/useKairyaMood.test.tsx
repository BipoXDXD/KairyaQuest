import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KairyaEvent } from './events'
import {
  browserScheduler,
  CELEBRATION_MS,
  useKairyaMood,
  type PresenceOptions,
  type Scheduler,
} from './useKairyaMood'

interface Scheduled {
  run: () => void
  ms: number
  cancelled: boolean
}

function fakeScheduler(): { scheduler: Scheduler; calls: Scheduled[]; fire: () => void } {
  const calls: Scheduled[] = []
  const scheduler: Scheduler = (run, ms) => {
    const entry: Scheduled = { run, ms, cancelled: false }
    calls.push(entry)
    return () => {
      entry.cancelled = true
    }
  }
  const fire = () => {
    const pending = calls.filter((c) => !c.cancelled)
    act(() => {
      for (const c of pending) c.run()
    })
  }
  return { scheduler, calls, fire }
}

const MISSION: KairyaEvent = { type: 'celebrate', reason: 'missionDone', detail: null }

function renderPresence(options: PresenceOptions) {
  return renderHook(() => useKairyaMood(options))
}

describe('useKairyaMood', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('começa em idle, sem fala', () => {
    const { result } = renderPresence({ scheduler: fakeScheduler().scheduler, random: () => 0 })
    expect(result.current.state).toEqual({
      mood: 'idle',
      cue: null,
      celebration: null,
      celebrationId: 0,
    })
  })

  it('agenda o fim da celebração em 3000 ms e volta a idle ao disparar', () => {
    const fake = fakeScheduler()
    const { result } = renderPresence({ scheduler: fake.scheduler, random: () => 0 })
    act(() => {
      result.current.dispatch(MISSION)
    })
    expect(CELEBRATION_MS).toBe(3000)
    expect(fake.calls.map((c) => c.ms)).toEqual([3000])
    expect(result.current.state.mood).toBe('celebrating')
    fake.fire()
    expect(result.current.state).toEqual({
      mood: 'idle',
      cue: { line: 'mission_done_1', detail: null },
      celebration: null,
      celebrationId: 1,
    })
  })

  it('o clique (dismissed) encerra antes e cancela o timer', () => {
    const fake = fakeScheduler()
    const { result } = renderPresence({ scheduler: fake.scheduler, random: () => 0 })
    act(() => {
      result.current.dispatch(MISSION)
    })
    act(() => {
      result.current.dispatch({ type: 'dismissed' })
    })
    expect(result.current.state.mood).toBe('idle')
    expect(result.current.state.cue).toBeNull()
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].cancelled).toBe(true)
  })

  it('questionSent durante a celebração cancela o timer', () => {
    const fake = fakeScheduler()
    const { result } = renderPresence({ scheduler: fake.scheduler, random: () => 0 })
    act(() => {
      result.current.dispatch(MISSION)
    })
    act(() => {
      result.current.dispatch({ type: 'questionSent' })
    })
    expect(fake.calls[0].cancelled).toBe(true)
  })

  it('troca por prioridade não agenda outro timer (Review Focus 1)', () => {
    const fake = fakeScheduler()
    const { result } = renderPresence({ scheduler: fake.scheduler, random: () => 0 })
    act(() => {
      result.current.dispatch(MISSION)
    })
    act(() => {
      result.current.dispatch({ type: 'celebrate', reason: 'weeklyTrialDone', detail: null })
    })
    expect(result.current.state.cue?.line).toBe('weekly_trial_done_1')
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].cancelled).toBe(false)
    fake.fire()
    expect(result.current.state.mood).toBe('idle')
  })

  it('celebração nova depois do fim agenda outro timer', () => {
    const fake = fakeScheduler()
    const { result } = renderPresence({ scheduler: fake.scheduler, random: () => 0 })
    act(() => {
      result.current.dispatch(MISSION)
    })
    fake.fire()
    act(() => {
      result.current.dispatch(MISSION)
    })
    expect(fake.calls).toHaveLength(2)
    expect(result.current.state.celebrationId).toBe(2)
  })

  it('desmontar cancela o timer pendente', () => {
    const fake = fakeScheduler()
    const { result, unmount } = renderPresence({ scheduler: fake.scheduler, random: () => 0 })
    act(() => {
      result.current.dispatch(MISSION)
    })
    unmount()
    expect(fake.calls[0].cancelled).toBe(true)
  })

  it('dispatch mantém a identidade entre renders', () => {
    const fake = fakeScheduler()
    const { result, rerender } = renderPresence({ scheduler: fake.scheduler, random: () => 0 })
    const first = result.current.dispatch
    act(() => {
      first({ type: 'userTyped' })
    })
    rerender()
    expect(result.current.state.mood).toBe('listening')
    expect(result.current.dispatch).toBe(first)
  })

  it('a semente vem de random injetado', () => {
    // 0.5 × 2^31 = 2^30, e 2^30 mod 3 = 1: a segunda das três falas de nível.
    const { result } = renderPresence({ scheduler: fakeScheduler().scheduler, random: () => 0.5 })
    act(() => {
      result.current.dispatch({ type: 'celebrate', reason: 'levelUp', detail: null })
    })
    expect(result.current.state.cue?.line).toBe('level_up_2')
  })

  it('sem opções usa o timer do navegador e Math.random', () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const { result } = renderHook(() => useKairyaMood())
    act(() => {
      result.current.dispatch({ type: 'celebrate', reason: 'levelUp', detail: null })
    })
    expect(result.current.state.cue?.line).toBe('level_up_2')
    act(() => {
      vi.advanceTimersByTime(2999)
    })
    expect(result.current.state.mood).toBe('celebrating')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.state.mood).toBe('idle')
  })
})

describe('browserScheduler', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('roda depois do prazo e o cancelamento impede a execução', () => {
    vi.useFakeTimers()
    const ran = vi.fn()
    const cancelled = vi.fn()
    browserScheduler(ran, 100)
    const cancel = browserScheduler(cancelled, 100)
    cancel()
    vi.advanceTimersByTime(99)
    expect(ran).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(ran).toHaveBeenCalledTimes(1)
    expect(cancelled).not.toHaveBeenCalled()
  })
})
