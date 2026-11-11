import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { SpeechBubble } from './SpeechBubble'

test('figure com o falante como figcaption e o texto no corpo', () => {
  render(<SpeechBubble speaker="Kairya">Feito. Isso é treino de verdade.</SpeechBubble>)
  const figure = screen.getByRole('figure', { name: 'Kairya' })
  expect(figure).toHaveTextContent('Feito. Isso é treino de verdade.')
  expect(figure.querySelector('figcaption')).toHaveTextContent('Kairya')
})

test.each([
  ['celebrating', true],
  ['concerned', false],
  ['neutral', false],
] as const)('tom %s: brilho de lanterna = %s', (tone, glow) => {
  render(
    <SpeechBubble speaker="Kairya" tone={tone}>
      x
    </SpeechBubble>,
  )
  const figure = screen.getByRole('figure', { name: 'Kairya' })
  expect(figure).toHaveAttribute('data-tone', tone)
  expect(figure.classList.contains('shadow-glow-lantern')).toBe(glow)
})

test('sem tom, é neutral', () => {
  render(<SpeechBubble speaker="Kairya">x</SpeechBubble>)
  expect(screen.getByRole('figure', { name: 'Kairya' })).toHaveAttribute('data-tone', 'neutral')
})
