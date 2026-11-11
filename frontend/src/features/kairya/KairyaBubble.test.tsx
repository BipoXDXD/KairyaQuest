import { act, fireEvent, screen, within } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageSwitcher } from '../../shared/ui/LanguageSwitcher'
import { fakeAudio, memoryStorage, type FakeAudio } from '../../test/audioDoubles'
import { renderWithI18n } from '../../test/i18n'
import { readSource } from '../../test/readSource'
import type { KairyaEvent } from './events'
import { KairyaBubble } from './KairyaBubble'
import { useKairya } from './useKairya'

const MISSION_DONE: KairyaEvent = { type: 'celebrate', reason: 'missionDone', detail: null }

/** Expõe o `dispatch` e o humor da presença para o teste, sem tocar no provider. */
function Probe({ onReady }: { onReady: (dispatch: (event: KairyaEvent) => void) => void }) {
  const { state, dispatch } = useKairya()
  useEffect(() => {
    onReady(dispatch)
  }, [dispatch, onReady])
  return <output data-testid="mood">{state.mood}</output>
}

const SOUND_ON = {
  'kairyaquest.sound': '{"voice":true,"sfx":true}',
  'kairyaquest.soundInvite': '1',
}

function setup(locale: 'pt-BR' | 'en' = 'pt-BR', audio?: Parameters<typeof renderWithI18n>[1]) {
  const handle: { current: ((event: KairyaEvent) => void) | null } = { current: null }
  renderWithI18n(
    <>
      <LanguageSwitcher />
      <KairyaBubble />
      <Probe
        onReady={(d) => {
          handle.current = d
        }}
      />
    </>,
    { locale, ...audio },
  )
  return (event: KairyaEvent) => {
    expect(handle.current).not.toBeNull()
    act(() => {
      handle.current?.(event)
    })
  }
}

const liveRegion = () => screen.getByTestId('kairya-announcement')

describe('KairyaBubble', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sem fala, não renderiza a bolha e a região viva existe vazia', () => {
    setup()

    expect(screen.queryByRole('figure')).toBeNull()
    expect(liveRegion()).toBeEmptyDOMElement()
    expect(liveRegion()).toHaveClass('sr-only')
  })

  it('celebrar a missão mostra a fala, o falante e o tom de comemoração', () => {
    const send = setup()

    send(MISSION_DONE)

    const bubble = screen.getByRole('figure', { name: 'Kairya' })
    expect(bubble).toHaveAttribute('data-tone', 'celebrating')
    expect(bubble).toHaveTextContent('Feito. Isso é treino de verdade.')
    expect(bubble.querySelector('img')).toHaveAttribute('src', '/art/kairya/celebrating.webp')
  })

  it('a preocupação usa o tom de alerta e o rosto preocupado', () => {
    const send = setup()

    send({ type: 'concern', reason: 'evalNotMeets' })

    const bubble = screen.getByRole('figure', { name: 'Kairya' })
    expect(bubble).toHaveAttribute('data-tone', 'concerned')
    expect(bubble).toHaveTextContent('Ainda não atende. Vamos olhar juntos o que falta?')
  })

  it('a saudação usa o tom neutro', () => {
    const send = setup()

    send({ type: 'greet', period: 'morning' })

    expect(screen.getByRole('figure')).toHaveAttribute('data-tone', 'neutral')
  })

  it.each([
    [
      'a saudação da manhã',
      { type: 'greet', period: 'morning' },
      'Bom dia. Qual é o primeiro passo de hoje?',
    ],
    [
      'a saudação da noite',
      { type: 'greet', period: 'evening' },
      'Boa noite. Bom te ver. Qual é o passo de hoje?',
    ],
    [
      'o retorno depois da sequência zerada',
      { type: 'concern', reason: 'streakReset' },
      'A sequência zerou. O que você aprendeu, não. Vamos de novo hoje?',
    ],
  ] as const)('%s é anunciada na região viva', (_name, event, text) => {
    const send = setup()

    send(event)

    expect(liveRegion()).toHaveTextContent(text)
  })

  it.each([
    ['a celebração (o RewardAnnouncement já anuncia)', MISSION_DONE],
    ['a preocupação da avaliação', { type: 'concern', reason: 'evalNotMeets' }],
    ['a fala avulsa', { type: 'say', topic: 'evalMeets' }],
  ] as const)('%s aparece na bolha mas não na região viva', (_name, event) => {
    const send = setup()

    send(event)

    expect(screen.getByRole('figure')).toBeInTheDocument()
    expect(liveRegion()).toBeEmptyDOMElement()
  })

  it('trocar o idioma com a bolha aberta mostra a mesma fala no outro idioma, sem fechar', () => {
    const send = setup('pt-BR')
    send(MISSION_DONE)

    fireEvent.click(screen.getByRole('button', { name: 'EN, English' }))

    const bubble = screen.getByRole('figure')
    expect(bubble).toHaveTextContent("Done. That's real training.")
    expect(bubble).not.toHaveTextContent('Feito')
  })

  it.each([
    ['pt-BR', 'Fechar a fala da Kairya'],
    ['en', "Dismiss Kairya's message"],
  ] as const)(
    'em %s, fechar pelo botão some com a bolha e o humor volta a idle',
    (locale, name) => {
      const send = setup(locale)
      send(MISSION_DONE)
      expect(screen.getByTestId('mood')).toHaveTextContent('celebrating')

      fireEvent.click(screen.getByRole('button', { name }))

      expect(screen.queryByRole('figure')).toBeNull()
      expect(screen.getByTestId('mood')).toHaveTextContent('idle')
    },
  )

  it('a subida de nível mostra a legenda abaixo da fala', () => {
    const send = setup()

    send({ type: 'celebrate', reason: 'levelUp', detail: { kind: 'level', level: 5 } })

    const bubble = screen.getByRole('figure')
    expect(bubble).toHaveTextContent('Você construiu isso, dia após dia.')
    const caption = within(bubble).getByText('Subiu para o nível 5!')
    expect(caption.tagName).toBe('P')
  })

  it('todas as conquistas viram uma linha cada na legenda', () => {
    const send = setup()

    send({
      type: 'celebrate',
      reason: 'achievement',
      detail: {
        kind: 'achievements',
        items: [
          { code: 'first_steps', title: 'x', description: 'x' },
          { code: 'streak_7', title: 'x', description: 'x' },
        ],
      },
    })

    const bubble = screen.getByRole('figure')
    expect(within(bubble).getByText('Conquista: Primeiros passos')).toBeInTheDocument()
    expect(within(bubble).getByText('Conquista: Uma semana inteira')).toBeInTheDocument()
  })

  it('conquistas com o mesmo título viram uma linha cada', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const send = setup()
    const first = { code: 'first_steps', title: 'x', description: 'x' }

    send({
      type: 'celebrate',
      reason: 'achievement',
      detail: { kind: 'achievements', items: [first, first] },
    })

    expect(
      within(screen.getByRole('figure')).getAllByText('Conquista: Primeiros passos'),
    ).toHaveLength(2)
    // Chave repetida na lista faz o React avisar no console.
    expect(error).not.toHaveBeenCalled()
  })

  it('fechar leva o foco para um destino estável, e não para o body', () => {
    const send = setup()
    send(MISSION_DONE)
    const close = screen.getByRole('button', { name: 'Fechar a fala da Kairya' })
    close.focus()

    fireEvent.click(close)

    expect(screen.queryByRole('button', { name: 'Fechar a fala da Kairya' })).toBeNull()
    const anchor = screen.getByTestId('kairya-bubble-anchor')
    expect(anchor).toHaveAttribute('tabindex', '-1')
    expect(document.activeElement).toBe(anchor)
  })

  it('depois dos 3 s da celebração o humor e o tom saem, mas a fala fica na bolha', () => {
    vi.useFakeTimers()
    const send = setup()
    send(MISSION_DONE)

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.getByTestId('mood')).toHaveTextContent('idle')
    const bubble = screen.getByRole('figure')
    expect(bubble).toHaveAttribute('data-tone', 'neutral')
    expect(bubble).toHaveTextContent('Feito. Isso é treino de verdade.')
  })

  it('a entrada anima só sob motion-safe, com o token que o índice de CSS define', () => {
    const send = setup()
    send(MISSION_DONE)

    const wrapper = screen.getByRole('figure').parentElement
    const classes = (wrapper?.getAttribute('class') ?? '').split(/\s+/)
    expect(classes).toContain('motion-safe:animate-reward-in')
    expect(
      classes.filter((name) => /transition|animate/.test(name) && !name.startsWith('motion-safe:')),
    ).toEqual([])
    expect(readSource('src/index.css')).toContain('--animate-reward-in:')
  })

  describe('voz da fala', () => {
    function setupWithVoice() {
      const elements: FakeAudio[] = []
      const send = setup('pt-BR', {
        audio: {
          storage: memoryStorage(SOUND_ON),
          createElement: () => {
            const element = fakeAudio()
            elements.push(element)
            return element
          },
        },
      })
      return { send, voice: () => elements[0] }
    }

    it('a fala mostrada toca o mp3 dela', () => {
      const { send, voice } = setupWithVoice()

      send(MISSION_DONE)

      expect(voice()?.src).toBe('/audio/pt-BR/mission_done_1.mp3')
      expect(voice()?.play).toHaveBeenCalledTimes(1)
    })

    it('Fechar a fala corta a voz e a bolha fechada não toca de novo', async () => {
      const { send, voice } = setupWithVoice()
      send(MISSION_DONE)
      const pausesBefore = voice()?.pause.mock.calls.length ?? 0

      fireEvent.click(screen.getByRole('button', { name: 'Fechar a fala da Kairya' }))
      await act(async () => Promise.resolve())

      expect(voice()?.pause).toHaveBeenCalledTimes(pausesBefore + 1)
      expect(voice()?.play).toHaveBeenCalledTimes(1)
    })
  })
})
