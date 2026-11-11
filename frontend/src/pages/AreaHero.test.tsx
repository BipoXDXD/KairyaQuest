/// <reference types="node" />
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { listSources, readSource } from '../test/readSource'
import { ART } from '../shared/ui'
import { contrastRatio, parseTokens, resolveToken } from '../shared/ui/tokens/contrast'
import { AreaHero, type AreaScene } from './AreaHero'

const tokens = parseTokens(readSource('src/styles/tokens.css'))
const baseCss = readSource('src/styles/base.css')
const MINIMUM_TEXT_RATIO = 4.5
const SCENES: readonly AreaScene[] = ['hq', 'campaigns']

/**
 * O token de cor efetivo de `element` para o prefixo de utility dado
 * (`text` ou `bg`): a classe mais próxima, subindo pelos ancestrais, cujo
 * nome casa com um `--color-*` de `tokens.css`. `text-2xl` não casa
 * (`--color-2xl` não existe), então só cor conta. A cor sai da classe que o
 * componente aplica de fato e do valor no CSS dos tokens: trocar a classe ou
 * o token muda o resultado.
 */
function colorToken(element: Element, prefix: 'text' | 'bg'): string {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    for (const cls of node.classList) {
      const name = cls.startsWith(`${prefix}-`) ? `color-${cls.slice(prefix.length + 1)}` : ''
      if (tokens.has(name)) return name
    }
  }
  throw new Error(`nenhuma classe ${prefix}-<token> acima de <${element.tagName.toLowerCase()}>`)
}

function textContrast(element: Element): number {
  return contrastRatio(
    resolveToken(tokens, colorToken(element, 'text')),
    resolveToken(tokens, colorToken(element, 'bg')),
  )
}

function renderHero(scene: AreaScene) {
  render(<AreaHero scene={scene} headingId="area-heading" title="Título" note="Nota" />)
  return { heading: screen.getByRole('heading', { level: 1 }), note: screen.getByText('Nota') }
}

describe('AreaHero', () => {
  it.each(SCENES)('%s: o header leva a classe da cena', (scene) => {
    const { heading } = renderHero(scene)

    expect(heading.closest('header')).toHaveClass('area-hero', `area-hero--${scene}`)
  })

  it.each(SCENES)('%s: título e nota ficam num Panel surface, não sobre a imagem', (scene) => {
    const { heading, note } = renderHero(scene)

    const panel = heading.closest('[data-elevation]')
    expect(panel).toHaveAttribute('data-elevation', 'surface')
    expect(panel).toContainElement(note)
    expect(panel).not.toHaveClass('area-hero')
  })

  it('o título é focável por programa, com o id recebido', () => {
    const { heading } = renderHero('hq')

    expect(heading).toHaveAttribute('id', 'area-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it.each(SCENES)('%s: título e nota têm 4,5:1 sobre a superfície, pelos tokens', (scene) => {
    const { heading, note } = renderHero(scene)

    expect(colorToken(heading, 'bg')).toBe('color-bg-surface')
    expect(textContrast(heading)).toBeGreaterThanOrEqual(MINIMUM_TEXT_RATIO)
    expect(textContrast(note)).toBeGreaterThanOrEqual(MINIMUM_TEXT_RATIO)
  })

  it('a medição reprova uma cor de texto sem contraste (o teste não passa vazio)', () => {
    render(
      <div className="bg-bg-surface">
        <p className="text-border-subtle">decorativo</p>
      </div>,
    )

    expect(textContrast(screen.getByText('decorativo'))).toBeLessThan(MINIMUM_TEXT_RATIO)
  })

  it('a medição recusa elemento sem classe de cor', () => {
    render(<p>sem cor</p>)

    expect(() => colorToken(screen.getByText('sem cor'), 'text')).toThrow(/text-<token>/)
  })
})

describe('CSS do cabeçalho das áreas', () => {
  function ruleBody(selector: string): string {
    const start = baseCss.indexOf(`${selector} {`)
    expect(start, `regra ${selector} ausente em base.css`).toBeGreaterThanOrEqual(0)
    return baseCss.slice(start, baseCss.indexOf('}', start))
  }

  it.each(SCENES)('.area-hero--%s usa a cena de ART e o gradiente da spec', (scene) => {
    const body = ruleBody(`.area-hero--${scene}`).replace(/\s+/g, ' ')

    expect(body).toContain(
      'linear-gradient( 90deg, color-mix(in oklab, var(--ink-950) 90%, transparent), color-mix(in oklab, var(--ink-950) 20%, transparent) )',
    )
    expect(body).toContain(`url('${ART.scenes[scene]}')`)
  })

  it('nenhum CSS mantém as classes legadas do shell', () => {
    const legacy =
      /\.(?:rpg-nav|rpg-brand|rpg-crest|rpg-wordmark|rpg-hero|rpg-eyebrow|rpg-main|app-shell)\b/
    const offenders = listSources('src/**/*.css').filter((p) => legacy.test(readSource(p)))
    expect(offenders).toEqual([])
  })
})
