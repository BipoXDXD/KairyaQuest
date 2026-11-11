import type { ReactElement } from 'react'
import { useT } from '../i18n/useT'
import { SoundToggle, type SoundChannel } from '../ui'
import { useAudio } from './useAudio'

const CHANNELS: readonly SoundChannel[] = ['voice', 'sfx']

/** Os dois botões de som do menu: um por canal, ligados às preferências do dispositivo. */
export function SoundControls(): ReactElement {
  const t = useT()
  const { prefs, setPref } = useAudio()
  return (
    <div
      role="group"
      aria-label={t('audio.controls.label')}
      data-testid="sound-controls"
      className="flex gap-2"
    >
      {CHANNELS.map((channel) => (
        <SoundToggle
          key={channel}
          channel={channel}
          pressed={prefs[channel]}
          onPressedChange={(on) => {
            setPref(channel, on)
          }}
        />
      ))}
    </div>
  )
}
