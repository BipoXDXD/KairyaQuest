import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { memoryStorage } from '../../test/audioDoubles'
import { KairyaPresenceProvider, type KairyaPresenceProviderProps } from './KairyaPresenceProvider'
import { useKairya } from './useKairya'
import type { KairyaEvent } from './events'

const MORNING_DAY_10 = new Date('2026-11-10T12:00:00Z')
/** `random` cuja semente é 1: uma fala escolhida de novo trocaria o grupo de `_1` para `_2`. */
const SEED_ONE = 1 / 2 ** 31

const noScheduler = () => () => undefined

const MISSION_DONE: KairyaEvent = { type: 'celebrate', reason: 'missionDone', detail: null }
const LEVEL_UP: KairyaEvent = {
  type: 'celebrate',
  reason: 'levelUp',
  detail: { kind: 'level', level: 5 },
}

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

type ProviderOptions = Omit<KairyaPresenceProviderProps, 'children'>

/** O hook `useKairya` dentro de um provider com `scheduler` e `random` fixos (semente 0). */
function setup(options: ProviderOptions = {}) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(KairyaPresenceProvider, {
      scheduler: noScheduler,
      random: () => 0,
      greeting: false,
      ...options,
      children,
    })
  return renderHook(() => useKairya(), { wrapper })
}

describe('useKairya', () => {
  it('lança fora do provider', () => {
    expect(() => renderHook(() => useKairya())).toThrow(/KairyaPresenceProvider/)
  })
})

describe('dispatchAll', () => {
  it.each([
    ['missionDone antes de levelUp', [MISSION_DONE, LEVEL_UP]],
    ['levelUp antes de missionDone', [LEVEL_UP, MISSION_DONE]],
  ])('%s termina na celebração mais forte', (_name, events) => {
    const view = setup()
    act(() => {
      view.result.current.dispatchAll(events)
    })
    expect(view.result.current.state.celebration).toBe('levelUp')
    expect(view.result.current.state.cue?.line).toBe('level_up_1')
  })

  it('despacha em ordem: a segunda fala escolhida usa a segunda semente', () => {
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(SEED_ONE)
    const view = setup({ random })
    act(() => {
      view.result.current.dispatchAll([
        { type: 'say', topic: 'evalMeets' },
        { type: 'say', topic: 'evalMeets' },
      ])
    })
    expect(random).toHaveBeenCalledTimes(2)
    expect(view.result.current.state.cue?.line).toBe('eval_meets_2')
  })

  it('mantém a identidade de dispatch, dispatchAll e reportStreak entre renders', () => {
    const view = setup()
    const first = view.result.current
    view.rerender()
    expect(view.result.current.dispatch).toBe(first.dispatch)
    expect(view.result.current.dispatchAll).toBe(first.dispatchAll)
    expect(view.result.current.reportStreak).toBe(first.reportStreak)
  })
})

describe('saudação do dia', () => {
  it('reportStreak saúda uma vez, grava o dia e não repete na mesma sessão', () => {
    const storage = memoryStorage()
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValue(SEED_ONE)
    const view = setup({ greeting: true, clock: () => MORNING_DAY_10, storage, random })
    act(() => {
      view.result.current.reportStreak(3)
    })
    expect(view.result.current.state.cue?.line).toBe('greet_morning_1')
    expect(storage.getItem('kairyaquest.lastGreeting')).toBe('2026-11-10')
    act(() => {
      view.result.current.reportStreak(4)
    })
    expect(view.result.current.state.cue?.line).toBe('greet_morning_1')
    expect(random).toHaveBeenCalledTimes(1)
  })

  it('remontar o provider com o mesmo storage não saúda de novo', () => {
    const storage = memoryStorage()
    const options = { greeting: true, clock: () => MORNING_DAY_10, storage }
    const first = setup(options)
    act(() => {
      first.result.current.reportStreak(3)
    })
    first.unmount()
    const second = setup(options)
    act(() => {
      second.result.current.reportStreak(3)
    })
    expect(second.result.current.state.cue).toBeNull()
  })

  it('com greeting=false, reportStreak não muda o estado nem escreve no storage', () => {
    const storage = memoryStorage()
    const setItem = vi.spyOn(storage, 'setItem')
    const view = setup({ greeting: false, clock: () => MORNING_DAY_10, storage })
    const before = view.result.current.state
    act(() => {
      view.result.current.reportStreak(3)
    })
    expect(view.result.current.state).toBe(before)
    expect(setItem).not.toHaveBeenCalled()
    expect(storage.getItem('kairyaquest.lastGreeting')).toBeNull()
  })

  it.each([
    ['storage que lança em todo método', BROKEN_STORAGE],
    ['storage null', null],
  ])('%s: não lança e a saudação sai uma vez por sessão', (_name, storage) => {
    const view = setup({ greeting: true, clock: () => MORNING_DAY_10, storage })
    act(() => {
      view.result.current.reportStreak(3)
    })
    expect(view.result.current.state.cue?.line).toBe('greet_morning_1')
    act(() => {
      view.result.current.dispatch({ type: 'dismissed' })
    })
    act(() => {
      view.result.current.reportStreak(3)
    })
    expect(view.result.current.state.cue).toBeNull()
  })
})

describe('readStreak', () => {
  it('é null antes de qualquer leitura do ciclo', () => {
    const view = setup({ greeting: true, clock: () => MORNING_DAY_10, storage: memoryStorage() })
    expect(view.result.current.readStreak()).toBeNull()
  })

  it('devolve a sequência da última chamada de reportStreak', () => {
    const view = setup({ greeting: true, clock: () => MORNING_DAY_10, storage: memoryStorage() })
    act(() => {
      view.result.current.reportStreak(3)
    })
    act(() => {
      view.result.current.reportStreak(5)
    })
    expect(view.result.current.readStreak()).toBe(5)
  })

  it('com greeting=false continua null depois de reportStreak', () => {
    const view = setup({ greeting: false })
    act(() => {
      view.result.current.reportStreak(3)
    })
    expect(view.result.current.readStreak()).toBeNull()
  })

  it('mantém a identidade entre renders, mesmo depois de reportStreak', () => {
    const view = setup({ greeting: true, clock: () => MORNING_DAY_10, storage: memoryStorage() })
    const first = view.result.current.readStreak
    act(() => {
      view.result.current.reportStreak(3)
    })
    expect(view.result.current.readStreak).toBe(first)
  })
})
