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

/** Alto-falante com ondas (ligado) ou com um X (cortado): a forma muda, não só a cor. */
function SpeakerIcon({ on }: { on: boolean }) {
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
      data-testid={on ? 'sound-icon-on' : 'sound-icon-off'}
    >
      <path d="M4 9v6h4l5 4V5L8 9z" />
      {on ? (
        <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
      ) : (
        <path d="m16 9 5 6M21 9l-5 6" />
      )}
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
      icon={<SpeakerIcon on={pressed} />}
      pressed={pressed}
      onClick={() => {
        onPressedChange(!pressed)
      }}
    />
  )
}
