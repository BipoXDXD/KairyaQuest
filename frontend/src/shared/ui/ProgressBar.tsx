interface ProgressBarProps {
  /** Fora de `[0, max]`, é limitado à faixa: o progresso nunca passa do trilho. */
  value: number
  /** Positivo e finito; zero, negativo ou NaN é erro de programação. */
  max: number
  /** O nome acessível da barra. */
  label: string
  /** O valor lido pelo leitor de tela, já formatado ("40 de 200 XP"). */
  valueText: string
  'data-testid'?: string
}

const PERCENT = 100

/**
 * Barra de progresso com `role="progressbar"`. A largura do preenchimento vai
 * no `style`, em %, por ser valor dinâmico (classe arbitrária é vetada pelo
 * lint de design).
 */
export function ProgressBar({
  value,
  max,
  label,
  valueText,
  'data-testid': testId,
}: ProgressBarProps) {
  if (!Number.isFinite(max) || max <= 0) {
    throw new RangeError(`ProgressBar: max deve ser positivo e finito, recebeu ${max}.`)
  }
  if (Number.isNaN(value)) {
    throw new RangeError('ProgressBar: value não pode ser NaN.')
  }
  const clamped = Math.min(max, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamped}
      aria-valuetext={valueText}
      data-testid={testId}
      className="h-2 w-full overflow-hidden rounded-pill border border-border-strong bg-bg-canvas"
    >
      <div
        className="h-full rounded-pill bg-action-primary"
        style={{ width: `${(clamped / max) * PERCENT}%` }}
      />
    </div>
  )
}
