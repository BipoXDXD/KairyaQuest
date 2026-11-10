import { createContext } from 'react'
import type { SoundChannel } from '../ui/SoundToggle'
import type { AudioSrc } from './audioSrc'
import type { SfxName } from './sfx'
import type { SoundPrefs } from './soundPrefs'

export interface AudioControls {
  prefs: SoundPrefs
  setPref(channel: SoundChannel, on: boolean): void
  playVoice(src: AudioSrc): void
  stopVoice(): void
  playSfx(name: SfxName): void
  inviteVisible: boolean
  acceptInvite(): void
  dismissInvite(): void
}

/**
 * Sem valor padrão (`null`): um default falso esconderia o esquecimento do
 * `AudioProvider`. `useAudio` lança quando lê `null`.
 *
 * Fica num `.ts` separado porque o `react-refresh/only-export-components`
 * reprova `.tsx` que exporta algo além de componentes.
 */
export const AudioContext = createContext<AudioControls | null>(null)
