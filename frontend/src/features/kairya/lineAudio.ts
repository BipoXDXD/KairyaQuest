import { audioSrc, type AudioSrc } from '../../shared/audio/audioSrc'
import type { Locale } from '../../shared/i18n/locale'
import type { LineId } from './lines'

/** O mp3 gravado de uma fala, separado por idioma. */
export function lineSrc(locale: Locale, id: LineId): AudioSrc {
  return audioSrc(`/audio/${locale}/${id}.mp3`)
}
