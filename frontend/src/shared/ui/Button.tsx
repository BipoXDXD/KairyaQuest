import type { ButtonHTMLAttributes, Ref } from 'react'
import { busyProps } from './busy'
import { BUTTON_BASE } from './buttonBase'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger-confirm'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

/**
 * A pirâmide de botões: um primário sólido por tela, secundário em contorno,
 * terciário como link. `danger-confirm` é sólido e só aparece dentro do
 * `ConfirmDialog`, no passo de confirmação.
 */
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-action-primary px-4 text-text-on-action hover:bg-action-primary-hover',
  // O contorno também clareia no hover: sobre `bg-bg-raised` (o fundo do
  // `ConfirmDialog`), só o `hover:bg-bg-raised` não mudaria nada.
  secondary:
    'border-border-strong px-4 text-text-primary hover:border-text-primary hover:bg-bg-raised',
  tertiary: 'border-transparent px-2 text-action-primary underline-offset-4 hover:underline',
  'danger-confirm':
    'border-transparent bg-feedback-danger px-4 text-text-on-action underline-offset-4 hover:underline',
}

/**
 * Botão do design system. Sem `className` público: o espaçamento entre botões
 * é do pai (`gap`). `data-variant` fica exposto para teste e para CSS.
 */
export function Button({
  variant = 'secondary',
  loading = false,
  type = 'button',
  onClick,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      data-variant={variant}
      className={`${BUTTON_BASE} ${VARIANT_CLASS[variant]}`}
      {...busyProps(loading, onClick)}
    >
      {children}
    </button>
  )
}
