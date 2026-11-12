import type { ReactElement } from 'react'
import type { MessageKey } from '../i18n/catalog'
import { useT } from '../i18n/useT'
import { IconButton } from './IconButton'

export type SoundChannel = 'voice' | 'sfx'

interface SoundToggleProps {
  channel: SoundChannel
  /** `true` = som ligado. Controlado: o estado e a persistência são de quem monta. */
  pressed: boolean
  onPressedChange: (next: boolean) => void
}

const LABEL_KEY: Record<SoundChannel, MessageKey> = {
  voice: 'ui.sound.voice',
  sfx: 'ui.sound.sfx',
}

/** Barra diagonal que corta o desenho: a forma muda, não só a cor. */
const SLASH = <path d="m3 3 18 18" />

interface ChannelDrawing {
  on: ReactElement
  off: ReactElement
}

const DRAWINGS: Record<SoundChannel, ChannelDrawing> = {
  // Balão de fala: com duas linhas de texto (ligado) ou riscado (cortado).
  voice: {
    on: (
      <>
        <path d="M4 4h16v12H11l-4 4v-4H4z" />
        <path d="M8 8.5h8M8 12h5" />
      </>
    ),
    off: (
      <>
        <path d="M4 4h16v12H11l-4 4v-4H4z" />
        {SLASH}
      </>
    ),
  },
  // Nota musical: inteira (ligado) ou riscada (cortado).
  sfx: {
    on: (
      <>
        <path d="M9 18V5l11-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="17" cy="16" r="3" />
      </>
    ),
    off: (
      <>
        <path d="M9 18V5l11-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="17" cy="16" r="3" />
        {SLASH}
      </>
    ),
  },
}

/** Ícone do canal (balão de fala para a voz, nota musical para os efeitos). */
function ChannelIcon({ channel, on }: { channel: SoundChannel; on: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-icon={channel}
      data-testid={on ? 'sound-icon-on' : 'sound-icon-off'}
    >
      {on ? DRAWINGS[channel].on : DRAWINGS[channel].off}
    </svg>
  )
}

/**
 * Liga e desliga um canal de som. Sem estado nem `localStorage`: a Fase 8 o
 * liga ao `useAudio`; até lá só a galeria o monta.
 */
export function SoundToggle({ channel, pressed, onPressedChange }: SoundToggleProps) {
  const t = useT()
  return (
    <IconButton
      label={t(LABEL_KEY[channel])}
      icon={<ChannelIcon channel={channel} on={pressed} />}
      pressed={pressed}
      onClick={() => {
        onPressedChange(!pressed)
      }}
    />
  )
}
