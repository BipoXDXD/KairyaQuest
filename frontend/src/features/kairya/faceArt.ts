import type { MessageKey } from '../../shared/i18n/catalog'
import { ART } from '../../shared/ui/art'
import type { Mood } from './events'

interface FaceArt {
  src: string
  width: number
  height: number
  altKey: MessageKey
}

const LARGE = { width: 864, height: 1184 } as const

const NEUTRAL: FaceArt = { src: ART.kairya.neutral, ...LARGE, altKey: 'kairya.face.neutral' }

/**
 * Humor -> imagem. `idle` e `speaking` ficam na expressao neutra; as demais
 * tem arte propria. As dimensoes sao as do arquivo (`docs/ART.md`), para o
 * navegador reservar o espaco antes de carregar.
 */
const FACES: Record<Mood, FaceArt> = {
  idle: NEUTRAL,
  speaking: NEUTRAL,
  listening: { src: ART.kairya.listening, ...LARGE, altKey: 'kairya.face.listening' },
  thinking: { src: ART.kairya.thinking, ...LARGE, altKey: 'kairya.face.thinking' },
  celebrating: {
    src: ART.kairya.celebrating,
    width: 864,
    height: 1152,
    altKey: 'kairya.face.celebrating',
  },
  concerned: { src: ART.kairya.concerned, ...LARGE, altKey: 'kairya.face.concerned' },
}

/** A imagem e o texto alternativo da Kairya para o humor do momento. */
export function faceFor(mood: Mood): FaceArt {
  return FACES[mood]
}
