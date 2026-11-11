import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { audioSrc } from '../../shared/audio/audioSrc'
import { useAudio } from '../../shared/audio/useAudio'
import { fakeAudio, memoryStorage, type FakeAudio } from '../../test/audioDoubles'
import { routeFetch } from '../../test/fetchRoutes'
import { renderWithI18n } from '../../test/i18n'
import { stubViewport } from '../../test/viewport'
import { PANEL_OPEN_KEY } from './panelPreference'
import { TutorPanel } from './TutorPanel'

const SOUND_ON = {
  'kairyaquest.sound': '{"voice":true,"sfx":true}',
  'kairyaquest.soundInvite': '1',
}

function VoiceStarter() {
  const { playVoice } = useAudio()
  return (
    <button
      type="button"
      data-testid="start-voice"
      onClick={() => {
        playVoice(audioSrc('/audio/voice/pt-BR/greet_morning_1.mp3'))
      }}
    />
  )
}

function mount(kind: 'desktop' | 'mobile') {
  routeFetch({
    'GET /api/tutoring/status': () => Response.json({ available: true }),
    'GET /api/tutoring/messages': () => Response.json([]),
  })
  stubViewport(kind)
  const elements: FakeAudio[] = []
  renderWithI18n(
    <>
      <VoiceStarter />
      <TutorPanel onMissionCreated={vi.fn()} boardHref="#missions-heading" />
    </>,
    {
      audio: {
        storage: memoryStorage(SOUND_ON),
        createElement: () => {
          const element = fakeAudio()
          elements.push(element)
          return element
        },
      },
    },
  )
  const sfx = () => elements.find((element) => element.src.includes('/sfx/'))
  return {
    voice: () => elements.find((element) => !element.src.includes('/sfx/')),
    sfxSrc: () => sfx()?.src ?? null,
    sfxPlays: () => sfx()?.play.mock.calls.length ?? 0,
    startVoice: () => {
      fireEvent.click(screen.getByTestId('start-voice'))
    },
  }
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('TutorPanel -- efeitos e voz', () => {
  it('no celular, abrir a folha toca panel_open e corta a voz; fechar nao a retoma', () => {
    const rig = mount('mobile')
    rig.startVoice()
    const voice = rig.voice()!
    expect(voice.play).toHaveBeenCalledTimes(1)
    const pausesBefore = voice.pause.mock.calls.length

    fireEvent.click(screen.getByTestId('tutor-sheet-open'))

    expect(rig.sfxSrc()).toMatch(/\/audio\/sfx\/panel_open\.mp3$/)
    expect(voice.pause.mock.calls.length).toBeGreaterThan(pausesBefore)

    fireEvent.click(screen.getByTestId('tutor-sheet-close'))

    expect(voice.play).toHaveBeenCalledTimes(1)
    expect(rig.sfxPlays()).toBe(1)
  })

  it('no desktop, expandir o painel recolhido toca panel_open sem cortar a voz', () => {
    localStorage.setItem(PANEL_OPEN_KEY, 'false')
    const rig = mount('desktop')
    rig.startVoice()
    const voice = rig.voice()!
    const pausesBefore = voice.pause.mock.calls.length

    fireEvent.click(screen.getByTestId('tutor-panel-toggle'))

    expect(rig.sfxSrc()).toMatch(/\/audio\/sfx\/panel_open\.mp3$/)
    expect(voice.pause.mock.calls.length).toBe(pausesBefore)
  })

  it('recolher, montar aberto e restaurar nao tocam nada', () => {
    const rig = mount('desktop')
    expect(rig.sfxPlays()).toBe(0)

    fireEvent.click(screen.getByTestId('tutor-panel-toggle'))

    expect(screen.getByTestId('tutor-panel-toggle')).toHaveAttribute('aria-expanded', 'false')
    expect(rig.sfxSrc()).toBeNull()
  })
})
