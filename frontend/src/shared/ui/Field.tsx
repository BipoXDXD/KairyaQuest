import { useId, type ReactNode } from 'react'

/** O que o `Field` entrega ao controle: espalhe tudo no `input`/`textarea`/`select`. */
export interface FieldControlProps {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
  className: string
}

interface FieldProps {
  label: string
  /** Texto de apoio, sempre visível. Vazio conta como ausente. */
  help?: string
  /** Mensagem de erro. Presente, o controle fica `aria-invalid`. Vazia conta como ausente. */
  error?: string
  children: (control: FieldControlProps) => ReactNode
}

// `border-strong` (ink-400) passa 3:1 sobre canvas, surface e raised
// (`contrastPairs.ts`), então o campo vale em qualquer elevação.
const CONTROL_CLASS =
  'min-h-11 w-full rounded-ui border border-border-strong bg-bg-canvas px-3 py-2 font-body text-base text-text-primary placeholder:text-text-muted hover:border-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring aria-invalid:border-feedback-danger disabled:cursor-not-allowed disabled:opacity-60'

/**
 * Rótulo, controle, ajuda e erro ligados por id. O controle é do chamador
 * (render prop), para o `Field` servir a `input`, `textarea` e `select` sem
 * repassar cada atributo deles.
 */
export function Field({ label, help, error, children }: FieldProps) {
  const id = useId()
  const helpId = help ? `${id}-help` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [helpId, errorId].filter((part) => part !== undefined).join(' ')
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-body text-base font-bold text-text-primary">
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
        'aria-invalid': errorId === undefined ? undefined : true,
        className: CONTROL_CLASS,
      })}
      {helpId !== undefined && (
        <p id={helpId} className="text-sm text-text-muted">
          {help}
        </p>
      )}
      {errorId !== undefined && (
        <p id={errorId} className="flex items-center gap-2 text-sm text-feedback-danger">
          <span aria-hidden="true" className="inline-flex shrink-0">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M12 6v8M12 17.5v.5" />
            </svg>
          </span>
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
