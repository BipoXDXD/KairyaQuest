import { useT } from '../i18n/useT'

interface SkeletonProps {
  /** Inteiro a partir de 1. */
  lines?: number
  /**
   * O que o leitor de tela anuncia. Ausente ou vazio, vale `ui.loading` do
   * catálogo: um status sem texto não anuncia nada.
   */
  label?: string
  'data-testid'?: string
}

const DEFAULT_LINES = 3

/**
 * Placeholder de carregamento. Estrutura fixa: o status `sr-only` e as linhas
 * `aria-hidden` são filhos diretos do contêiner. A pulsação só existe sob
 * `motion-safe` (`prefers-reduced-motion` a desliga).
 */
export function Skeleton({ lines = DEFAULT_LINES, label, 'data-testid': testId }: SkeletonProps) {
  const t = useT()
  if (!Number.isInteger(lines) || lines < 1) {
    throw new RangeError(`Skeleton: lines deve ser inteiro a partir de 1, recebeu ${lines}.`)
  }
  return (
    <div data-testid={testId} className="flex flex-col gap-2">
      <p role="status" className="sr-only">
        {label === undefined || label === '' ? t('ui.loading') : label}
      </p>
      {Array.from({ length: lines }, (_, n) => (
        <div
          key={n}
          aria-hidden="true"
          className="h-12 rounded-ui bg-bg-raised motion-safe:animate-pulse"
        />
      ))}
    </div>
  )
}
