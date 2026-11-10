import { expect, test, vi } from 'vitest'
import { fakeAudio, settlePlays, type FakeAudio } from '../../test/audioDoubles'
import {
  AUTOPLAY_BLOCKED_WARNING,
  SFX_VOLUME,
  UNAVAILABLE_WARNING_PREFIX,
  VOICE_VOLUME,
  createAudioPlayer,
} from './audioPlayer'
import { audioSrc } from './audioSrc'

const GREET_1 = audioSrc('/audio/pt-BR/greet_morning_1.mp3')
const GREET_2 = audioSrc('/audio/pt-BR/greet_morning_2.mp3')
const GREET_1_EN = audioSrc('/audio/en/greet_morning_1.mp3')
const LANTERN = audioSrc('/audio/sfx/lantern_lit.mp3')

/** Um player cujos elementos ficam numa lista, na ordem em que foram criados. */
function setup() {
  const elements: FakeAudio[] = []
  const createElement = vi.fn(() => {
    const el = fakeAudio()
    elements.push(el)
    return el
  })
  const warn = vi.fn()
  const player = createAudioPlayer({ createElement, warn })
  return { player, elements, createElement, warn }
}

test('os volumes dos canais', () => {
  expect(VOICE_VOLUME).toBe(1)
  expect(SFX_VOLUME).toBe(0.6)
})

test('os textos dos avisos', () => {
  expect(AUTOPLAY_BLOCKED_WARNING).toBe(
    'kairyaquest: autoplay blocked by the browser; audio waits for a user gesture',
  )
  expect(UNAVAILABLE_WARNING_PREFIX).toBe('kairyaquest: audio unavailable for this session:')
})

test('nada é criado antes do primeiro play (Review Focus 3)', () => {
  const createElement = vi.fn(fakeAudio)
  const player = createAudioPlayer({ createElement, warn: vi.fn() })
  player.stop('voice')
  player.stop('sfx')
  expect(createElement).not.toHaveBeenCalled()
})

test('um elemento por canal, reaproveitado; preload none e volume do canal', () => {
  const { player, elements, createElement } = setup()
  player.play('voice', GREET_1)
  player.play('voice', GREET_2)
  player.play('sfx', LANTERN)
  expect(createElement).toHaveBeenCalledTimes(2)
  const [voice, sfx] = elements
  expect(voice?.preload).toBe('none')
  expect(voice?.volume).toBe(1)
  expect(voice?.src).toBe('/audio/pt-BR/greet_morning_2.mp3')
  expect(voice?.play).toHaveBeenCalledTimes(2)
  expect(sfx?.preload).toBe('none')
  expect(sfx?.volume).toBe(0.6)
  expect(sfx?.src).toBe('/audio/sfx/lantern_lit.mp3')
  expect(sfx?.play).toHaveBeenCalledTimes(1)
})

test('fala nova interrompe a anterior: pause antes de trocar o src e currentTime 0', () => {
  const { player, elements } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.currentTime = 3.2
  const srcAtPause: string[] = []
  voice.pause.mockImplementation(() => {
    srcAtPause.push(voice.src)
  })
  player.play('voice', GREET_2)
  expect(srcAtPause).toEqual(['/audio/pt-BR/greet_morning_1.mp3'])
  expect(voice.src).toBe('/audio/pt-BR/greet_morning_2.mp3')
  expect(voice.currentTime).toBe(0)
  expect(voice.play).toHaveBeenCalledTimes(2)
})

test('a mesma fala de novo recomeça do início sem trocar o src', () => {
  const { player, elements } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.currentTime = 1.5
  voice.src = 'sentinela'
  player.play('voice', GREET_1)
  expect(voice.src).toBe('sentinela')
  expect(voice.currentTime).toBe(0)
  expect(voice.pause).toHaveBeenCalledTimes(2)
})

test('o efeito não interrompe a voz', () => {
  const { player, elements } = setup()
  player.play('voice', GREET_1)
  player.play('sfx', LANTERN)
  expect(elements[0]?.pause).toHaveBeenCalledTimes(1)
})

test('stop pausa só o canal pedido', () => {
  const { player, elements } = setup()
  player.play('voice', GREET_1)
  player.play('sfx', LANTERN)
  player.stop('voice')
  expect(elements[0]?.pause).toHaveBeenCalledTimes(2)
  expect(elements[1]?.pause).toHaveBeenCalledTimes(1)
})

test('NotAllowedError não lança, avisa exatamente uma vez com AUTOPLAY_BLOCKED_WARNING e não marca (Review Focus 1)', async () => {
  const { player, elements, warn } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.play.mockRejectedValue(new DOMException('', 'NotAllowedError'))
  player.play('voice', GREET_1)
  player.play('voice', GREET_1)
  player.play('voice', GREET_2)
  await settlePlays(voice.play)
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith(AUTOPLAY_BLOCKED_WARNING)
  expect(player.isUnavailable(GREET_1)).toBe(false)
  expect(player.isUnavailable(GREET_2)).toBe(false)
  voice.play.mockResolvedValue(undefined)
  player.play('voice', GREET_1)
  expect(voice.play).toHaveBeenCalledTimes(5)
})

test('o player nunca chama play de novo sozinho depois de uma rejeição', async () => {
  const { player, elements } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.play.mockRejectedValue(new DOMException('', 'NotAllowedError'))
  player.play('voice', GREET_2)
  await settlePlays(voice.play)
  expect(voice.play).toHaveBeenCalledTimes(2)
})

test('play() que lança síncrono é tratado como rejeição', () => {
  const { player, elements, warn } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.play.mockImplementation(() => {
    throw new DOMException('', 'NotSupportedError')
  })
  expect(() => {
    player.play('voice', GREET_2)
  }).not.toThrow()
  expect(player.isUnavailable(GREET_2)).toBe(true)
  expect(warn).toHaveBeenCalledWith(
    `${UNAVAILABLE_WARNING_PREFIX} /audio/pt-BR/greet_morning_2.mp3`,
  )
})

test('play() que lança NotAllowedError síncrono só avisa', () => {
  const { player, elements, warn } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.play.mockImplementation(() => {
    throw new DOMException('', 'NotAllowedError')
  })
  player.play('voice', GREET_2)
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith(AUTOPLAY_BLOCKED_WARNING)
  expect(player.isUnavailable(GREET_2)).toBe(false)
})

test('play() que devolve undefined: sem erro, sem aviso, sem marca', async () => {
  const { player, elements, warn } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.play.mockReturnValue(undefined)
  expect(() => {
    player.play('voice', GREET_2)
  }).not.toThrow()
  await settlePlays(voice.play)
  expect(warn).not.toHaveBeenCalled()
  expect(player.isUnavailable(GREET_2)).toBe(false)
})

test('AbortError é ignorado: sem aviso, sem marca', async () => {
  const { player, elements, warn } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.play.mockRejectedValue(new DOMException('', 'AbortError'))
  player.play('voice', GREET_2)
  await settlePlays(voice.play)
  expect(warn).not.toHaveBeenCalled()
  expect(player.isUnavailable(GREET_2)).toBe(false)
})

test('NotSupportedError marca o caminho, avisa com UNAVAILABLE_WARNING_PREFIX e o próximo play dele não chama el.play (Review Focus 2)', async () => {
  const { player, elements, warn } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.play.mockRejectedValue(new DOMException('', 'NotSupportedError'))
  player.play('voice', GREET_2)
  await settlePlays(voice.play)
  expect(player.isUnavailable(GREET_2)).toBe(true)
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith(
    `${UNAVAILABLE_WARNING_PREFIX} /audio/pt-BR/greet_morning_2.mp3`,
  )
  player.play('voice', GREET_2)
  expect(voice.play).toHaveBeenCalledTimes(2)
  expect(player.isUnavailable(GREET_1)).toBe(false)
})

test('rejeição que não é DOMException também marca o caminho', async () => {
  const { player, elements, warn } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.play.mockRejectedValue(new Error('falha qualquer'))
  player.play('voice', GREET_2)
  await settlePlays(voice.play)
  expect(player.isUnavailable(GREET_2)).toBe(true)
  expect(warn).toHaveBeenCalledTimes(1)
})

test('evento error do elemento marca o caminho atual e avisa uma vez', () => {
  const { player, elements, warn } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.fire('error')
  voice.fire('error')
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith(
    `${UNAVAILABLE_WARNING_PREFIX} /audio/pt-BR/greet_morning_1.mp3`,
  )
  player.play('voice', GREET_1)
  expect(voice.play).toHaveBeenCalledTimes(1)
  player.play('voice', GREET_2)
  expect(voice.play).toHaveBeenCalledTimes(2)
})

test('evento error depois de trocar a fala marca a fala nova, não a antiga', () => {
  const { player, elements } = setup()
  player.play('voice', GREET_1)
  player.play('voice', GREET_2)
  elements[0]?.fire('error')
  expect(player.isUnavailable(GREET_2)).toBe(true)
  expect(player.isUnavailable(GREET_1)).toBe(false)
})

test('o mesmo caminho em outro idioma continua disponível', () => {
  const { player, elements } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.fire('error')
  player.play('voice', GREET_1_EN)
  expect(player.isUnavailable(GREET_1)).toBe(true)
  expect(player.isUnavailable(GREET_1_EN)).toBe(false)
  expect(voice.src).toBe('/audio/en/greet_morning_1.mp3')
  expect(voice.play).toHaveBeenCalledTimes(2)
})

test('caminho indisponível no primeiro play de um canal não cria o elemento dele', () => {
  const { player, elements, createElement } = setup()
  player.play('voice', GREET_1)
  elements[0]?.fire('error')
  player.play('sfx', GREET_1)
  expect(createElement).toHaveBeenCalledTimes(1)
})

test('fala nova com arquivo indisponível corta a anterior e não toca', () => {
  const { player, elements } = setup()
  player.play('voice', GREET_2)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.fire('error')
  player.play('voice', GREET_1)
  expect(voice.pause).toHaveBeenCalledTimes(2)
  player.play('voice', GREET_2)
  expect(voice.pause).toHaveBeenCalledTimes(3)
  expect(voice.play).toHaveBeenCalledTimes(2)
  expect(voice.src).toBe('/audio/pt-BR/greet_morning_1.mp3')
})

test('404 real: rejeição NotSupportedError e evento error do mesmo caminho avisam uma vez só', async () => {
  const { player, elements, warn } = setup()
  player.play('voice', GREET_1)
  const [voice] = elements
  if (voice === undefined) throw new Error('o canal de voz não criou elemento')
  voice.play.mockRejectedValue(new DOMException('', 'NotSupportedError'))
  player.play('voice', GREET_2)
  voice.fire('error')
  await settlePlays(voice.play)
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith(
    `${UNAVAILABLE_WARNING_PREFIX} /audio/pt-BR/greet_morning_2.mp3`,
  )
  expect(player.isUnavailable(GREET_2)).toBe(true)
  expect(player.isUnavailable(GREET_1)).toBe(false)
})
