import type { ReactElement } from 'react'
import { useT } from '../../shared/i18n/useT'
import type { Mood } from './events'
import { faceFor } from './faceArt'

/**
 * O rosto da Kairya com a expressao do momento. A troca e instantanea, sem
 * `transition` nem animacao: vale igual com `prefers-reduced-motion`. Na
 * miniatura o rosto e decorativo (`alt` vazio); na cena descreve a pose.
 */
export function KairyaFace({ mood, size }: { mood: Mood; size: 'scene' | 'thumb' }): ReactElement {
  const t = useT()
  const face = faceFor(mood)
  return (
    <img
      src={face.src}
      alt={size === 'scene' ? t(face.altKey) : ''}
      width={face.width}
      height={face.height}
      decoding="async"
    />
  )
}
