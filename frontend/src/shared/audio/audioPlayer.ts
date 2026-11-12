import type { SoundChannel } from '../ui/SoundToggle'
import type { AudioSrc } from './audioSrc'

export const VOICE_VOLUME = 1
export const SFX_VOLUME = 0.6

export const AUTOPLAY_BLOCKED_WARNING =
  'kairyaquest: autoplay blocked by the browser; this audio was not played and will not be retried'
/** O aviso de indisponível é `${UNAVAILABLE_WARNING_PREFIX} ${src}`. */
export const UNAVAILABLE_WARNING_PREFIX = 'kairyaquest: audio unavailable for this session:'

const CHANNEL_VOLUME: Record<SoundChannel, number> = { voice: VOICE_VOLUME, sfx: SFX_VOLUME }

export interface PlayerDeps {
  createElement: () => HTMLAudioElement
  warn: (message: string) => void
}

export interface AudioPlayer {
  play(channel: SoundChannel, src: AudioSrc): void
  stop(channel: SoundChannel): void
  isUnavailable(src: AudioSrc): boolean
}

interface Channel {
  readonly element: HTMLAudioElement
  /** O caminho atual; o `element.src` não serve, porque o navegador o devolve como URL absoluta. */
  src: AudioSrc
}

/**
 * Um `HTMLAudioElement` por canal, criado só no primeiro `play` dele: com o
 * som desligado nada é criado e nenhum arquivo é pedido. O som novo de um
 * canal interrompe o anterior. Nenhuma falha lança e nada é tentado de novo
 * sozinho: autoplay bloqueado só avisa (uma vez na sessão), e um arquivo que
 * não toca (404, decodificação) fica mudo até o fim da sessão.
 */
export function createAudioPlayer(deps: PlayerDeps): AudioPlayer {
  const channels = new Map<SoundChannel, Channel>()
  const unavailable = new Set<AudioSrc>()
  let autoplayWarned = false

  function markUnavailable(src: AudioSrc): void {
    if (unavailable.has(src)) {
      return
    }
    unavailable.add(src)
    deps.warn(`${UNAVAILABLE_WARNING_PREFIX} ${src}`)
  }

  function handleFailure(src: AudioSrc, error: unknown): void {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      // Autoplay bloqueado não é defeito do arquivo: depois de um gesto, a
      // próxima fala deve tocar. Por isso só avisa, e uma vez.
      if (!autoplayWarned) {
        autoplayWarned = true
        deps.warn(AUTOPLAY_BLOCKED_WARNING)
      }
      return
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      // Um `play` novo (ou `pause`) interrompeu este antes de começar.
      return
    }
    markUnavailable(src)
  }

  function openChannel(name: SoundChannel, src: AudioSrc): Channel {
    const element = deps.createElement()
    element.preload = 'none'
    element.volume = CHANNEL_VOLUME[name]
    element.src = src
    const channel: Channel = { element, src }
    element.addEventListener('error', () => {
      markUnavailable(channel.src)
    })
    channels.set(name, channel)
    return channel
  }

  return {
    play(name, src) {
      if (unavailable.has(src)) {
        // O som novo interrompe o anterior mesmo quando não pode tocar: sem
        // o corte, a fala antiga seguiria sob a legenda nova.
        channels.get(name)?.element.pause()
        return
      }
      const channel = channels.get(name) ?? openChannel(name, src)
      const { element } = channel
      element.pause()
      if (channel.src !== src) {
        channel.src = src
        element.src = src
      }
      element.currentTime = 0
      // `play()` pode lançar síncrono e, em navegador antigo (e no jsdom), não
      // devolver promessa; os dois casos caem no mesmo tratamento.
      let started: Promise<void> | undefined
      try {
        started = element.play()
      } catch (error) {
        handleFailure(src, error)
        return
      }
      started?.catch((error: unknown) => {
        handleFailure(src, error)
      })
    },
    stop(name) {
      channels.get(name)?.element.pause()
    },
    isUnavailable(src) {
      return unavailable.has(src)
    },
  }
}
