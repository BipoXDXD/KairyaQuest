import { useId } from 'react'
import { useT } from '../../shared/i18n/useT'
import { Badge, type BadgeTone } from '../../shared/ui/Badge'
import { Button, type ButtonVariant } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { EmptyState, type EmptyArt } from '../../shared/ui/EmptyState'
import { IconButton } from '../../shared/ui/IconButton'
import { Panel, type Elevation } from '../../shared/ui/Panel'
import { ProgressBar } from '../../shared/ui/ProgressBar'
import { Skeleton } from '../../shared/ui/Skeleton'
import { SpeechBubble, type SpeechTone } from '../../shared/ui/SpeechBubble'
import { StatusLine, type StatusTone } from '../../shared/ui/StatusLine'

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

/** Painel como `section` nomeada, para o axe ver o landmark com nome. */
export function PanelCase({ elevation, glow = false }: { elevation: Elevation; glow?: boolean }) {
  const t = useT()
  const titleId = useId()
  return (
    <Panel as="section" elevation={elevation} glow={glow} aria-labelledby={titleId}>
      <h2 id={titleId}>{t('shell.locale.label')}</h2>
      <p>{t('shell.locale.saveFailed', { language: t('shell.locale.en') })}</p>
    </Panel>
  )
}

export function BadgeCase({ tone }: { tone: BadgeTone }) {
  const t = useT()
  return <Badge tone={tone}>{t('shell.locale.en')}</Badge>
}

const PROGRESS_MAX = 200

export function ProgressBarCase({ value }: { value: number }) {
  const t = useT()
  return (
    <ProgressBar
      value={value}
      max={PROGRESS_MAX}
      label={t('shell.locale.label')}
      valueText={`${value} / ${PROGRESS_MAX}`}
    />
  )
}

export function StatusLineCase({ tone }: { tone: StatusTone }) {
  const t = useT()
  return (
    <StatusLine tone={tone}>
      {t('shell.locale.saveFailed', { language: t('shell.locale.en') })}
    </StatusLine>
  )
}

/** As linhas são visíveis: a guarda do spec procura um descendente visível. */
export function SkeletonCase() {
  return <Skeleton />
}

export function SpeechBubbleCase({ tone }: { tone: SpeechTone }) {
  const t = useT()
  return (
    <SpeechBubble speaker={t('shell.locale.label')} tone={tone}>
      {t('shell.locale.saveFailed', { language: t('shell.locale.en') })}
    </SpeechBubble>
  )
}

export function EmptyStateCase({ art }: { art: EmptyArt }) {
  const t = useT()
  return (
    <EmptyState
      art={art}
      title={t('shell.locale.label')}
      body={t('shell.locale.saveFailed', { language: t('shell.locale.en') })}
      action={<Button variant="primary">{t('ui.dialog.cancel')}</Button>}
    />
  )
}
