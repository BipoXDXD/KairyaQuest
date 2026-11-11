import { describe, expect, it } from 'vitest'
import type { Mood } from './events'
import { faceFor } from './faceArt'

type Face = ReturnType<typeof faceFor>

const NEUTRAL: Face = {
  src: '/art/kairya/neutral.webp',
  width: 864,
  height: 1184,
  altKey: 'kairya.face.neutral',
}

describe('faceFor', () => {
  it.each<[Mood, Face]>([
    ['idle', NEUTRAL],
    ['speaking', NEUTRAL],
    [
      'listening',
      {
        src: '/art/kairya/listening.webp',
        width: 864,
        height: 1184,
        altKey: 'kairya.face.listening',
      },
    ],
    [
      'thinking',
      {
        src: '/art/kairya/thinking.webp',
        width: 864,
        height: 1184,
        altKey: 'kairya.face.thinking',
      },
    ],
    [
      'celebrating',
      {
        src: '/art/kairya/celebrating.webp',
        width: 864,
        height: 1152,
        altKey: 'kairya.face.celebrating',
      },
    ],
    [
      'concerned',
      {
        src: '/art/kairya/concerned.webp',
        width: 864,
        height: 1184,
        altKey: 'kairya.face.concerned',
      },
    ],
  ])('o humor %s mostra a imagem e o texto esperados', (mood, expected) => {
    expect(faceFor(mood)).toEqual(expected)
  })
})
