import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { openStorage } from '../i18n/locale'
import type { SoundChannel } from '../ui/SoundToggle'
import { AudioContext, type AudioControls } from './audioContext'
import { createAudioPlayer } from './audioPlayer'
import type { AudioSrc } from './audioSrc'
import { sfxSrc, type SfxName } from './sfx'
import {
  SOUND_OFF,
  readInviteDismissed,
  readSoundPrefs,
  withChannel,
  writeInviteDismissed,
  writeSoundPrefs,
  type SoundPrefs,
} from './soundPrefs'

export interface AudioProviderProps {
  children: ReactNode
  /** `null` = sem storage (som desligado, nada lembrado). Ausente: o `localStorage`, se acessível. */
  storage?: Storage | null
  createElement?: () => HTMLAudioElement
  warn?: (message: string) => void
}

const SOUND_ON: SoundPrefs = { voice: true, sfx: true }

function browserStorage(): Storage | null {
  return openStorage(() => window.localStorage)
}

function createBrowserAudio(): HTMLAudioElement {
  return new Audio()
}

function warnInConsole(message: string): void {
  console.warn(message)
}

/**
 * Guarda as preferências de som do dispositivo, o convite da primeira visita
 * e um player por canal. Com o canal desligado, `playVoice`/`playSfx` não
 * fazem nada: nenhum elemento de áudio é criado e nenhum arquivo é pedido.
 */
export function AudioProvider({
  children,
  storage,
  createElement = createBrowserAudio,
  warn = warnInConsole,
}: AudioProviderProps) {
  // Lidos uma vez: o storage e o player valem pela vida do provider.
  const [store] = useState(() => (storage === undefined ? browserStorage() : storage))
  const [player] = useState(() => createAudioPlayer({ createElement, warn }))
  const [boot] = useState(() => {
    const saved = readSoundPrefs(store)
    return {
      prefs: saved ?? SOUND_OFF,
      inviteVisible: saved === null && !readInviteDismissed(store),
    }
  })
  const [prefs, setPrefs] = useState<SoundPrefs>(boot.prefs)
  const [inviteVisible, setInviteVisible] = useState(boot.inviteVisible)

  // Nada toca depois que o provider sai da árvore (HMR, remontagem da raiz).
  useEffect(
    () => () => {
      player.stop('voice')
      player.stop('sfx')
    },
    [player],
  )

  const setPref = useCallback(
    (channel: SoundChannel, on: boolean) => {
      // Updater funcional: duas chamadas no mesmo evento partem do valor mais
      // novo, e a gravação acompanha esse valor. Gravar aqui dentro é
      // idempotente (o mesmo `prev` dá o mesmo JSON), então a dupla chamada
      // do updater no StrictMode só repete a mesma escrita.
      setPrefs((prev) => {
        const next = withChannel(prev, channel, on)
        writeSoundPrefs(store, next)
        return next
      })
      setInviteVisible(false)
      if (!on) {
        player.stop(channel)
      }
    },
    [store, player],
  )

  const playVoice = useCallback(
    (src: AudioSrc) => {
      if (prefs.voice) {
        player.play('voice', src)
      }
    },
    [prefs.voice, player],
  )

  const stopVoice = useCallback(() => {
    player.stop('voice')
  }, [player])

  const playSfx = useCallback(
    (name: SfxName) => {
      if (prefs.sfx) {
        player.play('sfx', sfxSrc(name))
      }
    },
    [prefs.sfx, player],
  )

  const acceptInvite = useCallback(() => {
    writeSoundPrefs(store, SOUND_ON)
    writeInviteDismissed(store)
    setPrefs(SOUND_ON)
    setInviteVisible(false)
  }, [store])

  const dismissInvite = useCallback(() => {
    writeInviteDismissed(store)
    setInviteVisible(false)
  }, [store])

  const value = useMemo<AudioControls>(
    () => ({
      prefs,
      setPref,
      playVoice,
      stopVoice,
      playSfx,
      inviteVisible,
      acceptInvite,
      dismissInvite,
    }),
    [prefs, setPref, playVoice, stopVoice, playSfx, inviteVisible, acceptInvite, dismissInvite],
  )

  return <AudioContext value={value}>{children}</AudioContext>
}
