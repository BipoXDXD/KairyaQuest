import { useState, type ReactElement } from 'react'
import { useT } from '../../shared/i18n/useT'
import { ART } from '../../shared/ui/art'
import type { Mood } from './events'
import { faceFor } from './faceArt'

const FALLBACK_FACE = {
  src: ART.kairya.avatar,
  width: 128,
  height: 160,
  altKey: 'kairya.speaker',
} as const

/**
 * O rosto da Kairya com a expressao do momento. A troca e instantanea, sem
 * `transition` nem animacao: vale igual com `prefers-reduced-motion`. Na
 * miniatura o rosto e decorativo (`alt` vazio); na cena descreve a pose.
 */
export function KairyaFace({ mood, size }: { mood: Mood; size: 'scene' | 'thumb' }): ReactElement {
  const t = useT()
  const face = faceFor(mood)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const isFallback = failedSource === face.src
  const image = isFallback ? FALLBACK_FACE : face
  return (
    <img
      key={face.src}
      src={image.src}
      alt={size === 'scene' ? t(image.altKey) : ''}
      width={image.width}
      height={image.height}
      decoding="async"
      onError={
        isFallback
          ? undefined
          : () => {
              setFailedSource(face.src)
            }
      }
    />
  )
}
