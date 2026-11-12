import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithI18n } from '../../test/i18n'
import { KairyaTurntable } from './KairyaTurntable'
import type { TurntableAsset } from './turntable'

const ASSET: TurntableAsset = {
  video: '/art/kairya/turntable.webm',
  poster: '/art/kairya/turntable.webp',
  width: 480,
  height: 600,
}

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    matches: reduced,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

describe('KairyaTurntable', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sem asset, mostra o placeholder com a arte celebrating', () => {
    renderWithI18n(<KairyaTurntable asset={null} />)

    const img = screen.getByTestId('kairya-turntable-placeholder')
    expect(img).toHaveAttribute('alt', 'A Kairya comemora o seu novo nível')
    expect(img).toHaveAttribute('src', expect.stringContaining('celebrating'))
    expect(screen.queryByTestId('kairya-turntable')).not.toBeInTheDocument()
  })

  it('sem a prop, usa o TURNTABLE (hoje nulo) e mostra o placeholder', () => {
    renderWithI18n(<KairyaTurntable />)

    expect(screen.getByTestId('kairya-turntable-placeholder')).toBeInTheDocument()
  })

  it('com asset, toca o video mudo em loop com poster', () => {
    stubReducedMotion(false)
    renderWithI18n(<KairyaTurntable asset={ASSET} />)

    const video = screen.getByTestId('kairya-turntable')
    expect(video).toBeInstanceOf(HTMLVideoElement)
    if (!(video instanceof HTMLVideoElement)) throw new Error('esperava um <video>')
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video).toHaveAttribute('src', '/art/kairya/turntable.webm')
    expect(video).toHaveAttribute('poster', '/art/kairya/turntable.webp')
    expect(video).toHaveAttribute('role', 'img')
    expect(video).toHaveAttribute('aria-label', 'A Kairya gira e comemora o seu novo nível')
  })

  it.each([['autoplay'], ['playsinline']])('o video tem o atributo %s', (attr) => {
    stubReducedMotion(false)
    renderWithI18n(<KairyaTurntable asset={ASSET} />)

    expect(screen.getByTestId('kairya-turntable')).toHaveAttribute(attr)
  })

  it('o video reserva o espaco com a largura e a altura do asset', () => {
    stubReducedMotion(false)
    renderWithI18n(<KairyaTurntable asset={ASSET} />)

    const video = screen.getByTestId('kairya-turntable')
    expect(video).toHaveAttribute('width', '480')
    expect(video).toHaveAttribute('height', '600')
  })

  it('com movimento reduzido, mostra so o poster, sem video', () => {
    stubReducedMotion(true)
    renderWithI18n(<KairyaTurntable asset={ASSET} />)

    const poster = screen.getByTestId('kairya-turntable-poster')
    expect(poster).toHaveAttribute('src', '/art/kairya/turntable.webp')
    expect(poster).toHaveAttribute('alt', 'A Kairya gira e comemora o seu novo nível')
    expect(screen.queryByTestId('kairya-turntable')).not.toBeInTheDocument()
    expect(document.querySelector('video')).toBeNull()
  })

  it('se o video falha, volta para o placeholder', () => {
    stubReducedMotion(false)
    renderWithI18n(<KairyaTurntable asset={ASSET} />)

    fireEvent.error(screen.getByTestId('kairya-turntable'))

    expect(screen.getByTestId('kairya-turntable-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('kairya-turntable')).not.toBeInTheDocument()
  })

  it('em ingles, o alt e o ingles', () => {
    stubReducedMotion(false)
    renderWithI18n(<KairyaTurntable asset={ASSET} />, { locale: 'en' })

    expect(screen.getByTestId('kairya-turntable')).toHaveAttribute(
      'aria-label',
      'Kairya turns around, celebrating your new level',
    )
  })

  it('em ingles, o placeholder tambem', () => {
    renderWithI18n(<KairyaTurntable asset={null} />, { locale: 'en' })

    expect(screen.getByTestId('kairya-turntable-placeholder')).toHaveAttribute(
      'alt',
      'Kairya celebrates your new level',
    )
  })
})
