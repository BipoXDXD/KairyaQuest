import type { ReactElement } from 'react'
import { useT } from '../i18n/useT'
import { Button, Panel } from '../ui'
import { useAudio } from './useAudio'

/**
 * Convite da primeira visita para ligar voz e efeitos. Não é modal: sem foco
 * forçado, sem anúncio, sem timer; quem ignora segue usando a página. O título
 * é um `<p>` (não um heading): o convite vem antes do `h1` da página.
 */
export function SoundInvite(): ReactElement | null {
  const t = useT()
  const { inviteVisible, acceptInvite, dismissInvite } = useAudio()
  if (!inviteVisible) {
    return null
  }
  return (
    <Panel as="section" aria-labelledby="sound-invite-title" data-testid="sound-invite">
      <div className="flex flex-col gap-3 p-4">
        <p id="sound-invite-title" className="font-display text-lg text-text-primary">
          {t('audio.invite.title')}
        </p>
        <p className="text-sm text-text-muted">{t('audio.invite.body')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={acceptInvite} data-testid="sound-invite-accept">
            {t('audio.invite.accept')}
          </Button>
          <Button variant="tertiary" onClick={dismissInvite} data-testid="sound-invite-decline">
            {t('audio.invite.decline')}
          </Button>
        </div>
      </div>
    </Panel>
  )
}
