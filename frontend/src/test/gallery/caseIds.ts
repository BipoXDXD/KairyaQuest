// Os estados que a galeria monta, um por URL (`/ui-gallery.html?case=<id>`).
// Sem imports: o `ui-states.spec.ts` do Playwright lê esta lista sem carregar
// React nem o resto do app. Hover e active não são montáveis; o axe mede o
// estado em repouso.
export const GALLERY_CASE_IDS = [
  'button-primary-default',
  'button-primary-disabled',
  'button-primary-loading',
  'button-secondary-default',
  'button-secondary-disabled',
  'button-secondary-loading',
  'button-tertiary-default',
  'button-tertiary-disabled',
  'button-tertiary-loading',
  'button-danger-confirm-default',
  'button-danger-confirm-disabled',
  'button-danger-confirm-loading',
  'icon-button-default',
  'icon-button-pressed',
  'icon-button-disabled',
  'icon-button-loading',
  'confirm-dialog-open',
  'confirm-dialog-confirming',
  'panel-sunken',
  'panel-surface',
  'panel-raised',
  'panel-glow',
  'badge-neutral',
  'badge-success',
  'badge-danger',
  'badge-action',
  'progress-bar-empty',
  'progress-bar-partial',
  'progress-bar-full',
  'status-line-neutral',
  'status-line-success',
  'status-line-danger',
  'skeleton-default',
  'speech-bubble-neutral',
  'speech-bubble-celebrating',
  'speech-bubble-concerned',
  'empty-state-missions',
  'empty-state-plan',
  'empty-state-campaign-new',
] as const

export type GalleryCaseId = (typeof GALLERY_CASE_IDS)[number]

export function isGalleryCaseId(value: string | null): value is GalleryCaseId {
  return GALLERY_CASE_IDS.some((id) => id === value)
}
