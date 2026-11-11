import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { fakeAudio, memoryStorage, settlePlays, type FakeAudio } from '../../test/audioDoubles'
import { renderWithI18n } from '../../test/i18n'
import { listSources, readSource } from '../../test/readSource'
import { AudioProvider, type AudioProviderProps } from './AudioProvider'
import { AUTOPLAY_BLOCKED_WARNING } from './audioPlayer'
import { audioSrc } from './audioSrc'
import { SOUND_OFF } from './soundPrefs'
import { useAudio } from './useAudio'

const GREET = audioSrc('/audio/pt-BR/greet_morning_1.mp3')

/** Expõe os controles do `useAudio` por botões e o estado por `data-*`. */
function Probe() {
  const audio = useAudio()
  return (
    <div
      data-testid="state"
      data-voice={String(audio.prefs.voice)}
      data-sfx={String(audio.prefs.sfx)}
      data-invite={String(audio.inviteVisible)}
    >
      <button
        type="button"
        data-testid="play-voice"
        onClick={() => {
          audio.playVoice(GREET)
        }}
      />
      <button
        type="button"
        data-testid="stop-voice"
        onClick={() => {
          audio.stopVoice()
        }}
      />
      <button
        type="button"
        data-testid="play-sfx"
        onClick={() => {
          audio.playSfx('lantern_lit')
        }}
      />
      <button
        type="button"
        data-testid="voice-on"
        onClick={() => {
          audio.setPref('voice', true)
        }}
      />
      <button
        type="button"
        data-testid="voice-off"
        onClick={() => {
          audio.setPref('voice', false)
        }}
      />
      <button
        type="button"
        data-testid="sfx-off"
        onClick={() => {
          audio.setPref('sfx', false)
        }}
      />
      <button
        type="button"
        data-testid="both-on"
        onClick={() => {
          audio.setPref('voice', true)
          audio.setPref('sfx', true)
        }}
      />
      <button
        type="button"
        data-testid="accept"
        onClick={() => {
          audio.acceptInvite()
        }}
      />
      <button
        type="button"
        data-testid="dismiss"
        onClick={() => {
          audio.dismissInvite()
        }}
      />
    </div>
  )
}

function setup(props: Omit<AudioProviderProps, 'children'> = {}) {
  const elements: FakeAudio[] = []
  const createElement = vi.fn(() => {
    const el = fakeAudio()
    elements.push(el)
    return el
  })
  const storage = props.storage === undefined ? memoryStorage() : props.storage
  const warn = vi.fn()
  const { unmount } = render(
    <AudioProvider storage={storage} createElement={createElement} warn={warn} {...props}>
      <Probe />
    </AudioProvider>,
  )
  return { elements, createElement, storage, warn, unmount }
}

function click(testId: string): void {
  fireEvent.click(screen.getByTestId(testId))
}

function state(): HTMLElement {
  return screen.getByTestId('state')
}

test('sem preferência: som desligado, convite visível, nenhum elemento criado ao pedir voz', () => {
  const { createElement } = setup()
  expect(state()).toHaveAttribute('data-voice', 'false')
  expect(state()).toHaveAttribute('data-sfx', 'false')
  expect(state()).toHaveAttribute('data-invite', 'true')
  click('play-voice')
  click('play-sfx')
  click('stop-voice')
  expect(createElement).not.toHaveBeenCalled()
})

test('preferência salva {"voice":true,"sfx":false}: sem convite; playVoice toca; playSfx não cria elemento', () => {
  const { elements, createElement } = setup({
    storage: memoryStorage({ 'kairyaquest.sound': '{"voice":true,"sfx":false}' }),
  })
  expect(state()).toHaveAttribute('data-invite', 'false')
  expect(state()).toHaveAttribute('data-voice', 'true')
  click('play-voice')
  expect(createElement).toHaveBeenCalledTimes(1)
  expect(elements[0]?.src).toBe('/audio/pt-BR/greet_morning_1.mp3')
  expect(elements[0]?.play).toHaveBeenCalledTimes(1)
  click('play-sfx')
  expect(createElement).toHaveBeenCalledTimes(1)
})

test('convite dispensado sem preferência: som desligado e sem convite', () => {
  setup({ storage: memoryStorage({ 'kairyaquest.soundInvite': '1' }) })
  expect(state()).toHaveAttribute('data-invite', 'false')
  expect(state()).toHaveAttribute('data-voice', 'false')
})

test('setPref(voice, false) durante uma fala chama pause e grava (Review Focus 3)', () => {
  const { elements, storage } = setup({
    storage: memoryStorage({ 'kairyaquest.sound': '{"voice":true,"sfx":true}' }),
  })
  click('play-voice')
  const [voice] = elements
  expect(voice?.pause).toHaveBeenCalledTimes(1)
  click('voice-off')
  expect(voice?.pause).toHaveBeenCalledTimes(2)
  expect(storage?.getItem('kairyaquest.sound')).toBe('{"voice":false,"sfx":true}')
  expect(state()).toHaveAttribute('data-voice', 'false')
  click('play-voice')
  expect(voice?.play).toHaveBeenCalledTimes(1)
})

test('desligar os efeitos pausa o canal de efeitos, não a voz', () => {
  const { elements } = setup({
    storage: memoryStorage({ 'kairyaquest.sound': '{"voice":true,"sfx":true}' }),
  })
  click('play-voice')
  click('play-sfx')
  click('sfx-off')
  expect(elements[0]?.pause).toHaveBeenCalledTimes(1)
  expect(elements[1]?.pause).toHaveBeenCalledTimes(2)
})

test('setPref(voice, true) grava, liga e esconde o convite', () => {
  const { storage } = setup()
  click('voice-on')
  expect(state()).toHaveAttribute('data-voice', 'true')
  expect(state()).toHaveAttribute('data-sfx', 'false')
  expect(state()).toHaveAttribute('data-invite', 'false')
  expect(storage?.getItem('kairyaquest.sound')).toBe('{"voice":true,"sfx":false}')
})

test('stopVoice pausa a fala em curso', () => {
  const { elements } = setup({
    storage: memoryStorage({ 'kairyaquest.sound': '{"voice":true,"sfx":false}' }),
  })
  click('play-voice')
  click('stop-voice')
  expect(elements[0]?.pause).toHaveBeenCalledTimes(2)
})

test('acceptInvite liga os dois, grava kairyaquest.sound e kairyaquest.soundInvite, esconde o convite', () => {
  const { storage } = setup()
  click('accept')
  expect(state()).toHaveAttribute('data-voice', 'true')
  expect(state()).toHaveAttribute('data-sfx', 'true')
  expect(state()).toHaveAttribute('data-invite', 'false')
  expect(storage?.getItem('kairyaquest.sound')).toBe('{"voice":true,"sfx":true}')
  expect(storage?.getItem('kairyaquest.soundInvite')).toBe('1')
})

test('dismissInvite deixa desligado, grava o convite e esconde', () => {
  const { storage } = setup()
  click('dismiss')
  expect(state()).toHaveAttribute('data-voice', 'false')
  expect(state()).toHaveAttribute('data-sfx', 'false')
  expect(state()).toHaveAttribute('data-invite', 'false')
  expect(storage?.getItem('kairyaquest.soundInvite')).toBe('1')
  expect(storage?.getItem('kairyaquest.sound')).toBeNull()
})

test('storage que lança: desligado, convite visível; dismissInvite esconde na sessão (Review Focus 4)', () => {
  // Dublê parcial: o provider só usa getItem e setItem, e os dois lançam como
  // um navegador com storage bloqueado.
  const broken = {
    getItem: () => {
      throw new DOMException('', 'SecurityError')
    },
    setItem: () => {
      throw new DOMException('', 'QuotaExceededError')
    },
  } as unknown as Storage
  setup({ storage: broken })
  expect(state()).toHaveAttribute('data-voice', 'false')
  expect(state()).toHaveAttribute('data-invite', 'true')
  click('dismiss')
  expect(state()).toHaveAttribute('data-invite', 'false')
})

test('storage null: desligado, convite visível; acceptInvite liga na sessão', () => {
  setup({ storage: null })
  expect(state()).toHaveAttribute('data-invite', 'true')
  click('accept')
  expect(state()).toHaveAttribute('data-voice', 'true')
  expect(state()).toHaveAttribute('data-invite', 'false')
})

test('playSfx usa sfxSrc', () => {
  const { elements } = setup({
    storage: memoryStorage({ 'kairyaquest.sound': '{"voice":false,"sfx":true}' }),
  })
  click('play-sfx')
  expect(elements[0]?.src).toBe('/audio/sfx/lantern_lit.mp3')
  expect(elements[0]?.volume).toBe(0.6)
  expect(elements[0]?.play).toHaveBeenCalledTimes(1)
})

test('o player é criado uma vez: o elemento sobrevive a re-renderizações', () => {
  const { createElement } = setup({
    storage: memoryStorage({ 'kairyaquest.sound': '{"voice":true,"sfx":false}' }),
  })
  click('play-voice')
  click('voice-on')
  click('play-voice')
  expect(createElement).toHaveBeenCalledTimes(1)
})

test('padrões reais: sem createElement, warn nem storage, com a voz ligada no localStorage', async () => {
  localStorage.setItem('kairyaquest.sound', '{"voice":true,"sfx":true}')
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValue(new DOMException('', 'NotAllowedError'))
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const { unmount } = render(
    <AudioProvider>
      <Probe />
    </AudioProvider>,
  )
  expect(state()).toHaveAttribute('data-voice', 'true')
  click('play-voice')
  expect(play).toHaveBeenCalledTimes(1)
  expect(play.mock.contexts[0]).toBeInstanceOf(HTMLAudioElement)
  await settlePlays(play)
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith(AUTOPLAY_BLOCKED_WARNING)
  // Desmonta aqui, com o `pause` ainda falso: o `restoreAllMocks` do setup roda
  // antes do cleanup do RTL, e o `pause` real do jsdom imprime "Not implemented".
  unmount()
  expect(pause).toHaveBeenCalledTimes(2)
})

test('padrões reais com localStorage bloqueado: som desligado, sem lançar', () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('', 'SecurityError')
  })
  render(
    <AudioProvider>
      <Probe />
    </AudioProvider>,
  )
  expect(state()).toHaveAttribute('data-voice', 'false')
  expect(state()).toHaveAttribute('data-invite', 'true')
})

test('duas mudanças de canal no mesmo evento mantêm as duas', () => {
  const { storage } = setup()
  click('both-on')
  expect(state()).toHaveAttribute('data-voice', 'true')
  expect(state()).toHaveAttribute('data-sfx', 'true')
  expect(storage?.getItem('kairyaquest.sound')).toBe('{"voice":true,"sfx":true}')
})

test('desmontar o provider pausa os elementos criados', () => {
  const { elements, unmount } = setup({
    storage: memoryStorage({ 'kairyaquest.sound': '{"voice":true,"sfx":true}' }),
  })
  click('play-voice')
  click('play-sfx')
  unmount()
  expect(elements[0]?.pause).toHaveBeenCalledTimes(2)
  expect(elements[1]?.pause).toHaveBeenCalledTimes(2)
})

test('desmontar sem nada tocado não cria elemento', () => {
  const { createElement, unmount } = setup()
  unmount()
  expect(createElement).not.toHaveBeenCalled()
})

test('a preferência é lida do storage uma vez só na montagem', () => {
  const storage = memoryStorage({ 'kairyaquest.sound': '{"voice":true,"sfx":false}' })
  const getItem = vi.spyOn(storage, 'getItem')
  setup({ storage })
  expect(getItem.mock.calls.filter(([key]) => key === 'kairyaquest.sound')).toHaveLength(1)
})

test('useAudio fora do provider lança', () =>
  expect(() => renderHook(() => useAudio())).toThrow(/AudioProvider/))

test('renderWithI18n sem opções: som desligado e convite dispensado (D3)', () => {
  renderWithI18n(<Probe />)
  expect(state()).toHaveAttribute('data-voice', 'false')
  expect(state()).toHaveAttribute('data-sfx', 'false')
  expect(state()).toHaveAttribute('data-invite', 'false')
})

test('renderWithI18n sem opções devolve exatamente SOUND_OFF', () => {
  function ReadPrefs() {
    return <output data-testid="prefs" data-prefs={JSON.stringify(useAudio().prefs)} />
  }
  renderWithI18n(<ReadPrefs />)
  const raw = screen.getByTestId('prefs').getAttribute('data-prefs')
  expect(JSON.parse(raw ?? 'null')).toEqual(SOUND_OFF)
})

test('renderWithI18n com audio: usa o storage passado e mostra o convite', () => {
  renderWithI18n(<Probe />, { audio: { storage: memoryStorage() } })
  expect(state()).toHaveAttribute('data-invite', 'true')
})

test('nenhum código de shared/audio consulta prefers-reduced-motion', () => {
  const files = listSources('src/shared/audio/**/*.{ts,tsx}', { excludeTests: true })
  expect(files.length).toBeGreaterThanOrEqual(5) // a varredura enxerga os arquivos
  for (const f of files) expect(readSource(f)).not.toMatch(/prefers-reduced-motion|matchMedia/)
})
