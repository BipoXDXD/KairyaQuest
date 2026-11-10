/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Lido do disco, a partir da raiz do frontend, onde o Vitest roda: no Vitest,
// `import './index.css?raw'` chega vazio (processamento de CSS desligado) e o
// `import.meta.url` do jsdom nao e um caminho de arquivo.
const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8')

/*
 * O axe nao mede contraste sobre imagem de fundo. Este teste prova o pior
 * caso pela conta WCAG 2.x: um pixel branco do cenario sob cada stop do
 * gradiente dos heroes, contra cada cor de texto do hero. Os cenarios tem
 * realces quase brancos em toda a largura e o texto alcanca a borda direita
 * no celular, entao todo stop entra na conta.
 */

const MINIMUM_RATIO = 4.5
const WHITE = { r: 255, g: 255, b: 255 }
/** `text-slate-50` do Tailwind v4 no h1: oklch(98.4% 0.003 247.858). */
const HEADING = { r: 0xf8, g: 0xfa, b: 0xfc }

type Rgb = { r: number; g: number; b: number }

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `regra ${selector} ausente em index.css`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

function hexColor(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

function capture(pattern: RegExp, text: string, missing: string): string {
  const match = pattern.exec(text)
  if (match === null) throw new Error(missing)
  return match[1]
}

function declaredColor(selector: string): Rgb {
  return hexColor(
    capture(/(?:^|\s)color:\s*(#[0-9a-f]{6});/i, ruleBody(selector), `${selector} sem cor`),
  )
}

function gradientStops(selector: string): { hex: string; alpha: number }[] {
  const gradient = capture(
    /linear-gradient\(([^)]*)\)/,
    ruleBody(selector),
    `${selector} sem linear-gradient`,
  )
  return [...gradient.matchAll(/#([0-9a-f]{8})/gi)].map(([, hex]) => ({
    hex: `#${hex}`,
    alpha: parseInt(hex.slice(6, 8), 16) / 255,
  }))
}

function over(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  const mix = (a: number, b: number) => alpha * a + (1 - alpha) * b
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b) }
}

function luminance({ r, g, b }: Rgb): number {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('contraste do texto dos heroes sobre o cenario', () => {
  it('a conta reproduz valores WCAG conhecidos', () => {
    expect(contrast(WHITE, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 5)
    expect(contrast(WHITE, { r: 0x76, g: 0x76, b: 0x76 })).toBeCloseTo(4.54, 2)
  })

  it.each(['.rpg-hero-library', '.rpg-hero-citadel'])(
    '%s garante 4,5:1 em todo stop com um pixel branco por baixo',
    (selector) => {
      const texts = {
        eyebrow: declaredColor('.rpg-eyebrow'),
        titulo: HEADING,
        subtitulo: declaredColor('.rpg-hero > p:last-child'),
      }
      const stops = gradientStops(selector)
      expect(stops).toHaveLength(3)

      for (const stop of stops) {
        const background = over(hexColor(stop.hex), stop.alpha, WHITE)
        for (const [name, color] of Object.entries(texts)) {
          expect(
            contrast(color, background),
            `${name} sobre ${stop.hex} com pixel branco`,
          ).toBeGreaterThanOrEqual(MINIMUM_RATIO)
        }
      }
    },
  )

  it('o stop mais claro deixa o eyebrow em 4,93:1 no pior caso', () => {
    const background = over(hexColor('#07101b'), 0xb3 / 255, WHITE)
    expect(contrast(declaredColor('.rpg-eyebrow'), background)).toBeCloseTo(4.93, 2)
  })
})
