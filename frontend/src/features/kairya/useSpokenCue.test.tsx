import { act, fireEvent, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AUTOPLAY_BLOCKED_WARNING } from '../../shared/audio/audioPlayer'
import { useAudio } from '../../shared/audio/useAudio'
import { LanguageSwitcher } from '../../shared/ui/LanguageSwitcher'
import { fakeAudio, memoryStorage, settlePlays, type FakeAudio } from '../../test/audioDoubles'
import { renderWithI18n } from '../../test/i18n'
import { useKairya } from './useKairya'
import type { SpeechCue } from './useKairyaMood'
import { useSpokenCue } from './useSpokenCue'

const SOUND_ON = {
  'kairyaquest.sound': '{"voice":true,"sfx":true}',
  'kairyaquest.soundInvite': '1',
}
const MORNING_DAY_10 = new Date('2026-11-10T12:00:00Z')

const CUE_A: SpeechCue = { line: 'greet_morning_1', detail: null }
const CUE_B: SpeechCue = { line: 'mission_done_1', detail: null }

const noScheduler = () => () => undefined

/** Os elementos de áudio criados, para o teste ver `play`/`pause` por canal. */
function audioRig(entries: Record<string, string> = SOUND_ON) {
  const elements: FakeAudio[] = []
  return {
    elements,
    audio: {
      storage: memoryStorage(entries),
      createElement: () => {
        const element = fakeAudio()
        elements.push(element)
        return element
      },
    },
    voice: () => elements.find((element) => !element.src.includes('/sfx/')),
    sfx: () => elements.find((element) => element.src.includes('/sfx/')),
  }
}

/** A região da legenda: `hidden` ou `inert` (ancestral) a deixa invisível. */
function Speaker({
  cue,
  hidden = false,
  inert = false,
}: {
  cue: SpeechCue | null
  hidden?: boolean
  inert?: boolean
}) {
  const anchor = useRef<HTMLDivElement>(null)
  useSpokenCue(cue, anchor)
  return (
    <div hidden={hidden} inert={inert}>
      <div ref={anchor} />
    </div>
  )
}

function VoiceOn() {
  const { setPref } = useAudio()
  return (
    <button
      type="button"
      onClick={() => {
        setPref('voice', true)
      }}
    >
      Ligar voz
    </button>
  )
}

/** Fala a `cue` da presença, como a bolha faz. */
function PresenceSpeaker() {
  const { state } = useKairya()
  const anchor = useRef<HTMLDivElement>(null)
  useSpokenCue(state.cue, anchor)
  return <div ref={anchor} />
}

function Controls({ onReady }: { onReady: (api: ReturnType<typeof useKairya>) => void }) {
  onReady(useKairya())
  return null
}

const flushMicrotasks = () => act(async () => Promise.resolve())

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSpokenCue', () => {
  it('a cue mostrada toca o arquivo do idioma atual (en)', () => {
    const rig = audioRig()
    renderWithI18n(<Speaker cue={CUE_A} />, { locale: 'en', audio: rig.audio })
    expect(rig.voice()?.src).toBe('/audio/en/greet_morning_1.mp3')
    expect(rig.voice()?.play).toHaveBeenCalledTimes(1)
  })

  it('a cue mostrada toca o arquivo do idioma atual (pt-BR)', () => {
    const rig = audioRig()
    renderWithI18n(<Speaker cue={CUE_A} />, { audio: rig.audio })
    expect(rig.voice()?.src).toBe('/audio/pt-BR/greet_morning_1.mp3')
  })

  it('a mesma cue com re-render e troca de idioma não toca de novo', () => {
    const rig = audioRig()
    const tree = (
      <>
        <LanguageSwitcher />
        <Speaker cue={CUE_A} />
      </>
    )
    const view = renderWithI18n(tree, { audio: rig.audio })
    view.rerender(tree)
    fireEvent.click(screen.getByRole('button', { name: 'EN, English' }))
    expect(rig.voice()?.play).toHaveBeenCalledTimes(1)
  })

  it('cue nova interrompe a anterior e continua tocando', async () => {
    const rig = audioRig()
    const view = renderWithI18n(<Speaker cue={CUE_A} />, { audio: rig.audio })
    view.rerender(<Speaker cue={CUE_B} />)
    await flushMicrotasks()
    const voice = rig.voice()
    expect(voice?.src).toBe('/audio/pt-BR/mission_done_1.mp3')
    const lastPlay = Math.max(...(voice?.play.mock.invocationCallOrder ?? []))
    const lastPause = Math.max(...(voice?.pause.mock.invocationCallOrder ?? []))
    expect(lastPlay).toBeGreaterThan(lastPause)
  })

  it('cue null para a voz na microtask seguinte', async () => {
    const rig = audioRig()
    const view = renderWithI18n(<Speaker cue={CUE_A} />, { audio: rig.audio })
    const pausesBefore = rig.voice()?.pause.mock.calls.length
    view.rerender(<Speaker cue={null} />)
    expect(rig.voice()?.pause).toHaveBeenCalledTimes(pausesBefore ?? -1)
    await flushMicrotasks()
    expect(rig.voice()?.pause).toHaveBeenCalledTimes((pausesBefore ?? 0) + 1)
  })

  it('dentro de StrictMode a cue toca uma vez e não é cortada', async () => {
    const rig = audioRig()
    const view = renderWithI18n(<></>, { audio: rig.audio, strict: true })
    view.rerender(<Speaker cue={CUE_A} />)
    await flushMicrotasks()
    const voice = rig.voice()
    expect(voice?.play).toHaveBeenCalledTimes(1)
    expect(Math.max(...(voice?.pause.mock.invocationCallOrder ?? []))).toBeLessThan(
      Math.max(...(voice?.play.mock.invocationCallOrder ?? [])),
    )
  })

  it('dentro de StrictMode, desmontar a bolha corta a voz uma vez', async () => {
    const rig = audioRig()
    const view = renderWithI18n(<></>, { audio: rig.audio, strict: true })
    view.rerender(<Speaker cue={CUE_A} />)
    await flushMicrotasks()
    const pausesBefore = rig.voice()?.pause.mock.calls.length ?? 0
    view.rerender(<></>)
    await flushMicrotasks()
    expect(rig.voice()?.pause).toHaveBeenCalledTimes(pausesBefore + 1)
  })

  it('voz desligada: nenhum elemento é criado, e ligar depois não fala a cue velha', async () => {
    const rig = audioRig({ 'kairyaquest.soundInvite': '1' })
    renderWithI18n(
      <>
        <Speaker cue={CUE_A} />
        <VoiceOn />
      </>,
      { audio: rig.audio },
    )
    expect(rig.elements).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Ligar voz' }))
    await flushMicrotasks()
    expect(rig.elements).toHaveLength(0)
  })

  it('play() rejeitado com NotAllowedError não lança e avisa uma vez', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const rig = audioRig()
    const original = rig.audio.createElement
    rig.audio.createElement = () => {
      const element = original()
      element.play.mockImplementation(() =>
        Promise.reject(new DOMException('blocked', 'NotAllowedError')),
      )
      return element
    }
    renderWithI18n(<Speaker cue={CUE_A} />, { audio: rig.audio })
    const voice = rig.voice()
    expect(voice).toBeDefined()
    if (voice !== undefined) await settlePlays(voice.play)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(AUTOPLAY_BLOCKED_WARNING)
  })
})

describe('useSpokenCue: streak_kept', () => {
  function setup(streak: number | null) {
    const rig = audioRig()
    let api: ReturnType<typeof useKairya> | null = null
    renderWithI18n(
      <>
        <Controls
          onReady={(value) => {
            api = value
          }}
        />
        <PresenceSpeaker />
      </>,
      {
        audio: rig.audio,
        presence: {
          greeting: true,
          clock: () => MORNING_DAY_10,
          storage: memoryStorage(),
          scheduler: noScheduler,
          random: () => 0,
        },
      },
    )
    const current = () => {
      expect(api).not.toBeNull()
      return api as unknown as ReturnType<typeof useKairya>
    }
    return {
      rig,
      current,
      read: () => {
        if (streak !== null) {
          act(() => {
            current().reportStreak(streak)
          })
        }
      },
    }
  }

  it('saudação com sequência 3 toca streak_kept', () => {
    const ctx = setup(3)
    ctx.read()
    expect(ctx.rig.sfx()?.src).toBe('/audio/sfx/streak_kept.mp3')
    expect(ctx.rig.sfx()?.play).toHaveBeenCalledTimes(1)
  })

  it('saudação com sequência 0 não toca efeito', () => {
    const ctx = setup(0)
    ctx.read()
    expect(ctx.rig.sfx()).toBeUndefined()
  })

  it('saudação com sequência 0 ainda fala o mp3 da fala', () => {
    const ctx = setup(0)
    ctx.read()
    expect(ctx.rig.voice()?.src).toBe('/audio/pt-BR/greet_morning_1.mp3')
  })

  it('saudação adiada: só toca streak_kept quando a cue aparece', () => {
    const ctx = setup(3)
    act(() => {
      ctx.current().dispatch({ type: 'questionSent' })
    })
    ctx.read()
    expect(ctx.rig.sfx()).toBeUndefined()
    act(() => {
      ctx.current().dispatch({ type: 'tutorFailed', offline: false })
    })
    expect(ctx.rig.sfx()?.src).toBe('/audio/sfx/streak_kept.mp3')
    expect(ctx.rig.sfx()?.play).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['hidden', { hidden: true }],
    ['inert', { inert: true }],
  ])('legenda %s: não toca a voz, e a fala fica marcada para não tocar depois', (_name, flags) => {
    const rig = audioRig()
    const view = renderWithI18n(<Speaker cue={null} {...flags} />, { audio: rig.audio })
    view.rerender(<Speaker cue={CUE_A} {...flags} />)
    expect(rig.voice()).toBeUndefined()

    view.rerender(<Speaker cue={null} />)
    view.rerender(<Speaker cue={CUE_A} />)
    expect(rig.voice()).toBeUndefined()
  })

  it('legenda visível continua tocando a voz', () => {
    const rig = audioRig()
    const view = renderWithI18n(<Speaker cue={null} />, { audio: rig.audio })
    view.rerender(<Speaker cue={CUE_B} />)
    expect(rig.voice()?.src).toBe('/audio/pt-BR/mission_done_1.mp3')
    expect(rig.voice()?.play).toHaveBeenCalledTimes(1)
  })
})
