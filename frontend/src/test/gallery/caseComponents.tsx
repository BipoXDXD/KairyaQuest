import { useT } from '../../shared/i18n/useT'
import { Button, type ButtonVariant } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { IconButton } from '../../shared/ui/IconButton'

// Os componentes de cada caso da galeria. Todo texto vem do catálogo, como no
// app; a galeria reaproveita chaves que já existem em vez de criar chaves só de
// teste no catálogo de produção.

type ButtonState = 'default' | 'disabled' | 'loading'

export function ButtonCase({ variant, state }: { variant: ButtonVariant; state: ButtonState }) {
  const t = useT()
  return (
    <Button variant={variant} disabled={state === 'disabled'} loading={state === 'loading'}>
      {t('ui.dialog.cancel')}
    </Button>
  )
}

function GalleryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="8" strokeWidth="2" />
    </svg>
  )
}

type IconButtonState = 'default' | 'pressed' | 'disabled' | 'loading'

export function IconButtonCase({ state }: { state: IconButtonState }) {
  const t = useT()
  return (
    <IconButton
      label={t('shell.locale.label')}
      icon={<GalleryIcon />}
      onClick={() => undefined}
      pressed={state === 'pressed' ? true : undefined}
      disabled={state === 'disabled'}
      loading={state === 'loading'}
    />
  )
}

/** `pending`: o `onConfirm` nunca resolve, e o spec clica para ver o "confirmando". */
export function ConfirmDialogCase({ pending }: { pending: boolean }) {
  const t = useT()
  return (
    <ConfirmDialog
      open
      title={t('shell.locale.label')}
      body={t('shell.locale.saveFailed', { language: t('shell.locale.en') })}
      confirmLabel={t('shell.locale.en')}
      onConfirm={() => (pending ? new Promise<void>(() => undefined) : undefined)}
      onCancel={() => undefined}
    />
  )
}
