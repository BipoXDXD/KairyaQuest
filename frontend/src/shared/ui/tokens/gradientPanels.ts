// Contraste dos textos e controles que vivem sobre os painéis de fundo em
// gradiente. O axe não decide contraste sobre `linear-gradient` (devolve
// `incomplete`), então o teste mede aqui: cada cor de texto, borda e anel que
// o código do painel usa contra os DOIS extremos do gradiente. Nada é copiado:
// os extremos vêm do `index.css`, as cores dos tokens e do tema do Tailwind.
import { contrastRatio, resolveToken, truncateToHundredths } from './contrast'

export interface GradientStops {
  readonly from: string
  readonly to: string
}

export interface ColorUse {
  readonly kind: 'text' | 'border' | 'ring'
  readonly key: string
  readonly translucent: boolean
}

export interface PanelSource {
  readonly path: string
  readonly text: string
}

interface PanelInput {
  readonly panel: string
  readonly stops: GradientStops
  readonly tokens: ReadonlyMap<string, string>
  readonly sources: readonly PanelSource[]
  /** Arquivo → classes (como `border-<cor>-<n>`) que são decoração e escapam dos 3:1. */
  readonly decorative: Readonly<Record<string, readonly string[]>>
}

const TEXT_MIN = 4.5
const UI_MIN = 3

const HEX = /^#[0-9a-f]{6}$/i
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const OKLCH = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/
const GRADIENT = /linear-gradient\(\s*[^,]+,\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/i
const SIMPLE_CLASS = /^\.[\w-]+$/
const COMMENT = /\/\*[\s\S]*?\*\//g
const RULE = /([^{}]+)\{([^{}]*)\}/g
const COLOR_CLASS = /\b(text|border|ring)-([a-z]+(?:-[a-z]+)*(?:-\d+)?)(?:\/(\d+))?(?![\w-])/g

// Matrizes OKLab → LMS → sRGB linear (Björn Ottosson, a definição do CSS Color 4).
const LMS_FROM_A = [0.3963377774, 0.2158037573]
const LMS_FROM_B = [-0.1055613458, -0.0638541728]
const LMS_FROM_C = [-0.0894841775, -1.291485548]
const RGB_FROM_LMS = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
]
const SRGB_ENCODE_LIMIT = 0.0031308

/** `oklch(70.4% 0.04 256.788)` → `#90a1b9`; o que sai da gama sRGB é limitado ao canal. */
export function oklchToHex(value: string): string {
  const match = OKLCH.exec(value)
  if (match === null) {
    throw new Error(`não é oklch(L% C H): "${value}"`)
  }
  const lightness = Number(match[1]) / 100
  const chroma = Number(match[2])
  const hue = (Number(match[3]) * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const lms = [LMS_FROM_A, LMS_FROM_B, LMS_FROM_C].map(
    ([ca, cb]) => (lightness + ca * a + cb * b) ** 3,
  )
  const channels = RGB_FROM_LMS.map((row) =>
    encode(row[0] * lms[0] + row[1] * lms[1] + row[2] * lms[2]),
  )
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function encode(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear))
  const srgb = clamped <= SRGB_ENCODE_LIMIT ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
  return Math.round(srgb * 255)
}

/** Hex, `oklch()` ou `var(--x)` (em cadeia) → `#rrggbb` minúsculo. */
export function resolveColor(tokens: ReadonlyMap<string, string>, value: string): string {
  const reference = /^var\(--([\w-]+)\)$/.exec(value)
  const raw = reference === null ? value : resolveToken(tokens, reference[1])
  if (HEX.test(raw)) {
    return raw.toLowerCase()
  }
  const short = SHORT_HEX.exec(raw)
  return short === null
    ? oklchToHex(raw)
    : `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
}

/** Seletores `.classe` simples das regras com `background: linear-gradient(`. */
export function gradientSelectors(css: string): string[] {
  return rules(css)
    .filter(({ body }) => /background:\s*linear-gradient\(/.test(body))
    .flatMap(({ selectors }) => selectors)
    .filter((selector) => SIMPLE_CLASS.test(selector))
}

/** Os dois extremos do `background: linear-gradient(...)` da regra do seletor. */
export function gradientStops(css: string, selector: string): GradientStops {
  const body = ruleBody(css, selector)
  const match = body === undefined ? null : /background:\s*([^;]+);/.exec(body)
  const stops = match === null ? null : GRADIENT.exec(match[1])
  if (stops === null) {
    throw new Error(`${selector}: sem background em linear-gradient de dois extremos hex no CSS`)
  }
  return { from: stops[1].toLowerCase(), to: stops[2].toLowerCase() }
}

/** Valor cru de uma cor declarada; em `outline`, o último termo (`2px solid <cor>`). */
export function declaredColor(css: string, selector: string, property: string): string {
  const body = ruleBody(css, selector)
  if (body === undefined) {
    throw new Error(`${selector}: regra não encontrada no CSS`)
  }
  const match = new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`).exec(body)
  if (match === null) {
    throw new Error(`${selector}: propriedade ${property} não encontrada`)
  }
  return match[1].trim().split(/\s+/).pop() as string
}

interface Rule {
  readonly selectors: readonly string[]
  readonly body: string
}

function rules(css: string): Rule[] {
  return [...css.replace(COMMENT, '').matchAll(RULE)].map(([, selectors, body]) => ({
    selectors: selectors.split(',').map((s) => s.trim()),
    body,
  }))
}

/** Os corpos de todas as regras do seletor, na ordem em que aparecem; vazio se não há. */
function ruleBody(css: string, selector: string): string | undefined {
  const bodies = rules(css)
    .filter(({ selectors }) => selectors.includes(selector))
    .map(({ body }) => body)
  return bodies.length === 0 ? undefined : bodies.join('\n')
}

/**
 * Classes de cor (`text-*`, `border-*`, `ring-*`) cujo nome existe como
 * `--color-<nome>` nos tokens. A existência do token é o filtro: `text-sm`,
 * `border-b-2` e `ring-offset-2` não são cores e ficam de fora.
 */
export function colorUsesIn(source: string, tokens: ReadonlyMap<string, string>): ColorUse[] {
  return [...source.matchAll(COLOR_CLASS)].flatMap(([, kind, key, alpha]) =>
    tokens.has(`color-${key}`)
      ? [{ kind: kind as ColorUse['kind'], key, translucent: alpha !== undefined }]
      : [],
  )
}

/** Uma linha por par reprovado; vazio quando todos atingem o mínimo nos dois extremos. */
export function panelContrastFailures(input: PanelInput): string[] {
  return input.sources.flatMap((source) => sourceFailures(input, source))
}

function sourceFailures(input: PanelInput, { path, text }: PanelSource): string[] {
  const where = `${input.panel} · ${path}`
  const uses = uniqueUses(colorUsesIn(text, input.tokens))
  if (uses.length === 0) {
    return [`${where}: nenhuma cor de texto, borda ou anel resolvida`]
  }
  return uses.flatMap((use) => {
    const name = `${use.kind}-${use.key}`
    if (use.kind === 'text' && use.translucent) {
      return [`${where} · ${name}: opacidade em texto não é medida`]
    }
    if (use.translucent || input.decorative[path]?.includes(name)) {
      return []
    }
    const color = resolveColor(input.tokens, `var(--color-${use.key})`)
    const min = use.kind === 'text' ? TEXT_MIN : UI_MIN
    return [input.stops.from, input.stops.to].flatMap((stop) => {
      const ratio = contrastRatio(color, stop)
      return ratio < min
        ? [`${where} · ${name} = ${truncateToHundredths(ratio)} < ${min} sobre ${stop}`]
        : []
    })
  })
}

function uniqueUses(uses: readonly ColorUse[]): ColorUse[] {
  const seen = new Map(uses.map((u) => [`${u.kind}-${u.key}-${String(u.translucent)}`, u]))
  return [...seen.values()]
}
