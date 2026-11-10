import type { JSX } from 'react'
import { ButtonCase, ConfirmDialogCase, IconButtonCase } from './caseComponents'
import type { GalleryCaseId } from './caseIds'

// `Record`: o compilador exige um caso para cada id, e nenhum a mais.
export const GALLERY_CASES: Record<GalleryCaseId, () => JSX.Element> = {
  'button-primary-default': () => <ButtonCase variant="primary" state="default" />,
  'button-primary-disabled': () => <ButtonCase variant="primary" state="disabled" />,
  'button-primary-loading': () => <ButtonCase variant="primary" state="loading" />,
  'button-secondary-default': () => <ButtonCase variant="secondary" state="default" />,
  'button-secondary-disabled': () => <ButtonCase variant="secondary" state="disabled" />,
  'button-secondary-loading': () => <ButtonCase variant="secondary" state="loading" />,
  'button-tertiary-default': () => <ButtonCase variant="tertiary" state="default" />,
  'button-tertiary-disabled': () => <ButtonCase variant="tertiary" state="disabled" />,
  'button-tertiary-loading': () => <ButtonCase variant="tertiary" state="loading" />,
  'button-danger-confirm-default': () => <ButtonCase variant="danger-confirm" state="default" />,
  'button-danger-confirm-disabled': () => <ButtonCase variant="danger-confirm" state="disabled" />,
  'button-danger-confirm-loading': () => <ButtonCase variant="danger-confirm" state="loading" />,
  'icon-button-default': () => <IconButtonCase state="default" />,
  'icon-button-pressed': () => <IconButtonCase state="pressed" />,
  'icon-button-disabled': () => <IconButtonCase state="disabled" />,
  'icon-button-loading': () => <IconButtonCase state="loading" />,
  'confirm-dialog-open': () => <ConfirmDialogCase pending={false} />,
  'confirm-dialog-confirming': () => <ConfirmDialogCase pending />,
}
