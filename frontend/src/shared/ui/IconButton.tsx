import type { ReactNode } from 'react'
import { busyProps } from './busy'
import { BUTTON_BASE } from './buttonBase'

interface IconButtonProps {
  /** O nome acessível; o ícone é decorativo. */
  label: string
  icon: ReactNode
  onClick: () => void
  /** Botão de alternância: vira `aria-pressed`. Ausente, o atributo não existe. */
  pressed?: boolean
  disabled?: boolean
  /** Mesma semântica do `Button`: ocupado, focável e sem repassar o clique. */
  loading?: boolean
  'data-testid'?: string
}

const ICON_CLASS =
  'size-11 border-border-strong text-text-primary hover:bg-bg-raised aria-pressed:border-action-primary aria-pressed:bg-bg-raised aria-pressed:text-action-primary'

/** Botão quadrado de 44px só com ícone; o rótulo vai para `aria-label`. */
export function IconButton({
  label,
  icon,
  onClick,
  pressed,
  disabled,
  loading = false,
  'data-testid': testId,
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      data-testid={testId}
      className={`${BUTTON_BASE} ${ICON_CLASS}`}
      {...busyProps(loading, onClick)}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  )
}
