import { act, fireEvent, screen, within } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { translate } from '../../shared/i18n/catalog'
import { LanguageSwitcher } from '../../shared/ui/LanguageSwitcher'
import { renderWithI18n } from '../../test/i18n'
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

function setup(locale: 'pt-BR' | 'en' = 'pt-BR') {
  let dispatch: ((event: KairyaEvent) => void) | null = null
  renderWithI18n(
    <>
      <LanguageSwitcher />
      <KairyaBubble />
      <Probe
        onReady={(d) => {
          dispatch = d
        }}
      />
    </>,
    { locale },
  )
  return (event: KairyaEvent) => {
    act(() => {
      dispatch!(event)
    })
  }
}

const liveRegion = () => screen.getByTestId('kairya-announcement')

describe('KairyaBubble', () => {
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

  it('a abertura do dia é anunciada na região viva', () => {
    const send = setup()

    send({ type: 'greet', period: 'morning' })

    expect(liveRegion()).toHaveTextContent('Bom dia. Qual é o primeiro passo de hoje?')
  })

  it('a celebração aparece na bolha mas não na região viva (o RewardAnnouncement já anuncia)', () => {
    const send = setup()

    send(MISSION_DONE)

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

  it('o nome do falante e do botão vêm do catálogo', () => {
    expect(translate('pt-BR', 'kairya.speaker')).toBe('Kairya')
    expect(translate('en', 'kairya.speaker')).toBe('Kairya')
  })

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

  it('a entrada só anima sob motion-safe', () => {
    const send = setup()
    send(MISSION_DONE)

    const classes = (screen.getByRole('figure').parentElement?.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((name) => !name.startsWith('motion-safe:'))
    expect(classes.filter((name) => /transition|animate/.test(name))).toEqual([])
  })
})
