import { useId, useMemo, useState, type ReactNode } from 'react'
import { WeekPlanEntry, WeekPlanForm } from '../../features/campaigns'
import { KairyaPresenceProvider } from '../../features/kairya'
import { I18nContext } from '../../shared/i18n/i18nContext'
import { useLocale } from '../../shared/i18n/useLocale'
import { useT } from '../../shared/i18n/useT'
import { Badge, type BadgeTone } from '../../shared/ui/Badge'
import { Button, type ButtonVariant } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { EmptyState, type EmptyArt } from '../../shared/ui/EmptyState'
import { Field } from '../../shared/ui/Field'
import { IconButton } from '../../shared/ui/IconButton'
import { LanguageSwitcher } from '../../shared/ui/LanguageSwitcher'
import { NavTabs } from '../../shared/ui/NavTabs'
import { Panel, type Elevation } from '../../shared/ui/Panel'
import { ProgressBar } from '../../shared/ui/ProgressBar'
import { Skeleton } from '../../shared/ui/Skeleton'
import { SoundToggle, type SoundChannel } from '../../shared/ui/SoundToggle'
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

type FieldState = 'default' | 'help' | 'error' | 'raised'

export function FieldCase({ state }: { state: FieldState }) {
  const t = useT()
  const field = (
    <Field
      label={t('shell.locale.label')}
      help={state === 'help' || state === 'error' ? t('ui.loading') : undefined}
      error={
        state === 'error'
          ? t('shell.locale.saveFailed', { language: t('shell.locale.en') })
          : undefined
      }
    >
      {(control) => <input type="text" {...control} />}
    </Field>
  )
  return state === 'raised' ? <Panel elevation="raised">{field}</Panel> : field
}

type GalleryTab = 'pt' | 'en'

export function NavTabsCase() {
  const t = useT()
  const [active, setActive] = useState<GalleryTab>('pt')
  return (
    <NavTabs<GalleryTab>
      items={[
        { id: 'pt', label: t('shell.locale.ptBR') },
        { id: 'en', label: t('shell.locale.en') },
      ]}
      active={active}
      onSelect={setActive}
    />
  )
}

/**
 * `saveFails`: o `setLocale` rejeita, como faria um PATCH com 503, e o spec
 * clica em EN para ver a falha. O `I18nProvider` desta base ainda grava só no
 * navegador; a falha vem deste contexto, e não de uma rota interceptada.
 */
export function LanguageSwitcherCase({ saveFails }: { saveFails: boolean }) {
  const outer = useLocale()
  const value = useMemo(
    () =>
      saveFails
        ? {
            locale: outer.locale,
            setLocale: () => Promise.reject(new Error('galeria: falha simulada ao salvar')),
          }
        : outer,
    [outer, saveFails],
  )
  return (
    <I18nContext value={value}>
      <LanguageSwitcher />
    </I18nContext>
  )
}

export function SoundToggleCase({ channel, pressed }: { channel: SoundChannel; pressed: boolean }) {
  const [on, setOn] = useState(pressed)
  return <SoundToggle channel={channel} pressed={on} onPressedChange={setOn} />
}

function noop(): void {
  // A galeria mede o estado em repouso: nenhum dos avisos do formulário importa.
}

/**
 * O `h2` só para leitor de tela faz o papel do título da trilha, que na tela
 * real vem antes do formulário (`h3`): sem ele o axe acusa pulo de nível.
 */
function PlanContext({ children }: { children: ReactNode }) {
  const t = useT()
  return (
    <>
      <h2 className="sr-only">{t('campaigns.lantern.title')}</h2>
      {children}
    </>
  )
}

/** O estado vazio da trilha: o botão que abre o formulário. A Kairya é do pai real, e aqui vem pelo provider. */
export function WeekPlanEntryCase() {
  return (
    <KairyaPresenceProvider greeting={false}>
      <PlanContext>
        <WeekPlanEntry onCreated={noop} onExists={noop} />
      </PlanContext>
    </KairyaPresenceProvider>
  )
}

/**
 * O formulário aberto. O erro de campo, o envio e a falha vêm de interações do
 * spec (clicar em "Criar plano", com o `POST /api/plans` interceptado), pela
 * mesma decisão N3 dos outros casos: a API do componente não ganha prop só
 * para a galeria.
 */
export function WeekPlanFormCase() {
  return (
    <PlanContext>
      <WeekPlanForm onCreated={noop} onExists={noop} onCancel={noop} />
    </PlanContext>
  )
}
