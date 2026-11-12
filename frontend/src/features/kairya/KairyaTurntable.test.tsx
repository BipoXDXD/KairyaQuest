import { act, fireEvent, screen } from '@testing-library/react'
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

  it('com movimento reduzido, se o poster falha, volta para o placeholder', () => {
    stubReducedMotion(true)
    renderWithI18n(<KairyaTurntable asset={ASSET} />)

    fireEvent.error(screen.getByTestId('kairya-turntable-poster'))

    expect(screen.getByTestId('kairya-turntable-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('kairya-turntable-poster')).not.toBeInTheDocument()
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

  describe('botao de pausa', () => {
    const PAUSE = 'Pausar a animação'
    const RESUME = 'Retomar a animação'

    function spyMedia(play: () => Promise<void> = () => Promise.resolve()) {
      return {
        pause: vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined),
        play: vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play),
      }
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    /** O `paused` real do elemento (o jsdom devolve true por padrao). */
    function setElementPaused(value: boolean) {
      vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => value)
    }

    it('sem evento (autoplay bloqueado) o rotulo e "Retomar"; depois do play, "Pausar"', () => {
      stubReducedMotion(false)
      renderWithI18n(<KairyaTurntable asset={ASSET} />)

      expect(screen.getByRole('button', { name: RESUME })).toBeInTheDocument()
      fireEvent.play(screen.getByTestId('kairya-turntable'))

      expect(screen.getByRole('button', { name: PAUSE })).toBeInTheDocument()
    })

    it('clicar pausa o video e troca o rotulo para retomar', () => {
      stubReducedMotion(false)
      const spies = spyMedia()
      renderWithI18n(<KairyaTurntable asset={ASSET} />)
      fireEvent.play(screen.getByTestId('kairya-turntable'))
      setElementPaused(false)

      fireEvent.click(screen.getByRole('button', { name: PAUSE }))
      expect(spies.pause).toHaveBeenCalledTimes(1)
      expect(spies.play).not.toHaveBeenCalled()
      fireEvent.pause(screen.getByTestId('kairya-turntable'))

      expect(screen.getByRole('button', { name: RESUME })).toBeInTheDocument()
    })

    it('clicar de novo retoma o video', () => {
      stubReducedMotion(false)
      const spies = spyMedia()
      renderWithI18n(<KairyaTurntable asset={ASSET} />)

      fireEvent.click(screen.getByRole('button', { name: RESUME }))
      expect(spies.play).toHaveBeenCalledTimes(1)
      expect(spies.pause).not.toHaveBeenCalled()
      fireEvent.play(screen.getByTestId('kairya-turntable'))

      expect(screen.getByRole('button', { name: PAUSE })).toBeInTheDocument()
    })

    it('a acao segue o elemento, nao o rotulo: com o evento ainda por chegar, o clique retoma', () => {
      stubReducedMotion(false)
      const spies = spyMedia()
      renderWithI18n(<KairyaTurntable asset={ASSET} />)
      fireEvent.play(screen.getByTestId('kairya-turntable'))
      setElementPaused(true)

      fireEvent.click(screen.getByRole('button', { name: PAUSE }))

      expect(spies.play).toHaveBeenCalledTimes(1)
      expect(spies.pause).not.toHaveBeenCalled()
    })

    it('play rejeitado: o tratamento da rejeicao e anexado, o rotulo segue e nao lanca', async () => {
      stubReducedMotion(false)
      const rejected = Promise.reject(new DOMException('', 'NotAllowedError'))
      const catchSpy = vi.spyOn(rejected, 'catch')
      spyMedia(() => rejected)
      renderWithI18n(<KairyaTurntable asset={ASSET} />)

      fireEvent.click(screen.getByRole('button', { name: RESUME }))
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(catchSpy).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: RESUME })).toBeInTheDocument()
    })

    it('o clique sozinho, sem evento do video, nao troca o rotulo', () => {
      stubReducedMotion(false)
      spyMedia()
      renderWithI18n(<KairyaTurntable asset={ASSET} />)
      fireEvent.play(screen.getByTestId('kairya-turntable'))
      setElementPaused(false)

      fireEvent.click(screen.getByRole('button', { name: PAUSE }))

      expect(screen.getByRole('button', { name: PAUSE })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: RESUME })).toBeNull()
    })

    it('pausa vinda do navegador atualiza o rotulo', () => {
      stubReducedMotion(false)
      renderWithI18n(<KairyaTurntable asset={ASSET} />)
      fireEvent.play(screen.getByTestId('kairya-turntable'))

      fireEvent.pause(screen.getByTestId('kairya-turntable'))

      expect(screen.getByRole('button', { name: RESUME })).toBeInTheDocument()
    })

    it('sob movimento reduzido nao ha botao', () => {
      stubReducedMotion(true)
      renderWithI18n(<KairyaTurntable asset={ASSET} />)

      expect(screen.queryByTestId('kairya-turntable-toggle')).toBeNull()
    })

    it('sem asset (placeholder) nao ha botao', () => {
      renderWithI18n(<KairyaTurntable asset={null} />)

      expect(screen.queryByTestId('kairya-turntable-toggle')).toBeNull()
    })

    it('erro do video depois de pausado volta para o placeholder, sem botao', () => {
      stubReducedMotion(false)
      renderWithI18n(<KairyaTurntable asset={ASSET} />)
      fireEvent.play(screen.getByTestId('kairya-turntable'))
      fireEvent.pause(screen.getByTestId('kairya-turntable'))

      fireEvent.error(screen.getByTestId('kairya-turntable'))

      expect(screen.getByTestId('kairya-turntable-placeholder')).toBeInTheDocument()
      expect(screen.queryByTestId('kairya-turntable-toggle')).toBeNull()
    })

    it('trocar ao vivo para movimento reduzido tira o video e o botao', () => {
      let reduced = false
      const listeners: (() => void)[] = []
      vi.stubGlobal('matchMedia', (query: string) => ({
        media: query,
        get matches() {
          return reduced
        },
        addEventListener: (_type: string, listener: () => void) => {
          listeners.push(listener)
        },
        removeEventListener: () => undefined,
      }))
      renderWithI18n(<KairyaTurntable asset={ASSET} />)
      expect(screen.getByTestId('kairya-turntable-toggle')).toBeInTheDocument()

      reduced = true
      act(() => {
        listeners.forEach((listener) => {
          listener()
        })
      })

      expect(screen.getByTestId('kairya-turntable-poster')).toBeInTheDocument()
      expect(screen.queryByTestId('kairya-turntable')).toBeNull()
      expect(screen.queryByTestId('kairya-turntable-toggle')).toBeNull()
    })

    it('depois de erro do video nao ha botao', () => {
      stubReducedMotion(false)
      renderWithI18n(<KairyaTurntable asset={ASSET} />)

      fireEvent.error(screen.getByTestId('kairya-turntable'))

      expect(screen.queryByTestId('kairya-turntable-toggle')).toBeNull()
    })

    it('em EN o rotulo vem do catalogo', () => {
      stubReducedMotion(false)
      renderWithI18n(<KairyaTurntable asset={ASSET} />, { locale: 'en' })
      fireEvent.play(screen.getByTestId('kairya-turntable'))

      expect(screen.getByRole('button', { name: 'Pause the animation' })).toBeInTheDocument()
    })
  })
})
