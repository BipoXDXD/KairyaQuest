// Contraste WCAG 2.x sobre os tokens de cor do CSS. O CSS é a fonte única dos
// tokens: este módulo só lê declarações `--nome: valor;` e mede pares.

export interface ContrastPair {
  readonly fg: string
  readonly bg: string
  readonly min: 4.5 | 3
  readonly use: string
}

type Resolution =
  | { readonly kind: 'value'; readonly value: string }
  | { readonly kind: 'missing'; readonly name: string }
  | { readonly kind: 'cycle'; readonly chain: readonly string[] }

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const DECLARATION = /(?:^|[{;\s])--([\w-]+)\s*:\s*([^;}]+)/g
const VAR_REFERENCE = /^var\(--([\w-]+)\)$/
// Limiar e expoente da linearização do canal sRGB (WCAG 2.x, "relative luminance").
const SRGB_LINEAR_LIMIT = 0.04045
const LUMA_RED = 0.2126
const LUMA_GREEN = 0.7152
const LUMA_BLUE = 0.0722
const FLARE = 0.05

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lighter + FLARE) / (darker + FLARE)
}

export function relativeLuminance(hex: string): number {
  if (!HEX_COLOR.test(hex)) {
    throw new Error(`cor fora do formato #rrggbb: "${hex}"`)
  }
  const channel = (offset: number) => linearize(parseInt(hex.slice(offset, offset + 2), 16) / 255)
  return LUMA_RED * channel(1) + LUMA_GREEN * channel(3) + LUMA_BLUE * channel(5)
}

function linearize(srgb: number): number {
  return srgb <= SRGB_LINEAR_LIMIT ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

/** Nome sem `--` → valor cru, de todas as declarações de qualquer bloco. */
export function parseTokens(css: string): ReadonlyMap<string, string> {
  const tokens = new Map<string, string>()
  for (const [, name, value] of css.matchAll(DECLARATION)) {
    tokens.set(name, value.trim())
  }
  return tokens
}

/** Segue `var(--x)` em cadeia até um valor final, hex ou não. */
export function resolveToken(tokens: ReadonlyMap<string, string>, name: string): string {
  const resolution = resolve(tokens, name)
  switch (resolution.kind) {
    case 'value':
      return resolution.value
    case 'missing':
      throw new Error(`token inexistente: --${resolution.name}`)
    case 'cycle':
      throw new Error(`ciclo em var(): ${resolution.chain.map((n) => `--${n}`).join(' → ')}`)
  }
}

function resolve(tokens: ReadonlyMap<string, string>, name: string): Resolution {
  const chain: string[] = []
  let current = name
  for (;;) {
    if (chain.includes(current)) {
      return { kind: 'cycle', chain: [...chain, current] }
    }
    chain.push(current)
    const value = tokens.get(current)
    if (value === undefined) {
      return { kind: 'missing', name: current }
    }
    const reference = VAR_REFERENCE.exec(value)
    if (reference === null) {
      return { kind: 'value', value }
    }
    current = reference[1]
  }
}

/** Uma linha por par reprovado; token que não resolve para `#rrggbb` reprova. */
export function findContrastFailures(
  tokens: ReadonlyMap<string, string>,
  pairs: readonly ContrastPair[],
): string[] {
  return pairs.flatMap((pair) => {
    const failure = describeFailure(tokens, pair)
    return failure === undefined ? [] : [failure]
  })
}

function describeFailure(
  tokens: ReadonlyMap<string, string>,
  { fg, bg, min, use }: ContrastPair,
): string | undefined {
  const label = `${fg}/${bg}`
  const colors = [resolve(tokens, fg), resolve(tokens, bg)]
  if (colors.some((c) => c.kind === 'cycle')) {
    return `${label}: ciclo em var() (${use})`
  }
  const [fgHex, bgHex] = colors.map(hexOf)
  if (fgHex === undefined || bgHex === undefined) {
    return `${label}: token ausente (${use})`
  }
  const ratio = contrastRatio(fgHex, bgHex)
  return ratio < min ? `${label} = ${truncateToHundredths(ratio)} < ${min} (${use})` : undefined
}

// Trunca em vez de arredondar: 2,996 arredondado viraria "3.00 < 3", uma
// mensagem que contradiz a própria reprovação.
export function truncateToHundredths(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2)
}

function hexOf(resolution: Resolution): string | undefined {
  return resolution.kind === 'value' && HEX_COLOR.test(resolution.value)
    ? resolution.value
    : undefined
}
