import type { ReactNode, Ref } from 'react'
import { busyProps } from './busy'
import { BUTTON_BASE } from './buttonBase'

interface IconButtonProps {
  /** O nome acessível; o ícone é decorativo. */
  label: string
  icon: ReactNode
  onClick: () => void
  /** Botão de alternância: vira `aria-pressed`. Ausente, o atributo não existe. */
  pressed?: boolean
  /** Botão que mostra ou esconde outra região: vira `aria-expanded`. */
  expanded?: boolean
  /** O `id` da região que o botão mostra ou esconde: vira `aria-controls`. */
  controls?: string
  /** Dica do ponteiro, para quem não usa leitor de tela; costuma repetir o `label`. */
  title?: string
  ref?: Ref<HTMLButtonElement>
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
  expanded,
  controls,
  title,
  ref,
  disabled,
  loading = false,
  'data-testid': testId,
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      title={title}
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
