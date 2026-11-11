import { useEffect, useRef } from 'react'
import { useAudio } from '../../shared/audio/useAudio'
import { useLocale } from '../../shared/i18n/useLocale'
import { lineSrc } from './lineAudio'
import { sfxForOpening } from './soundCues'
import { useKairya } from './useKairya'
import type { SpeechCue } from './useKairyaMood'

/**
 * Fala a legenda que a bolha mostra: toca o mp3 da `cue` uma vez por
 * identidade (a troca de idioma ou de preferência não repete nem "reativa"
 * uma fala velha) e corta a voz quando a `cue` some ou o componente desmonta.
 *
 * O corte é agendado em microtask e cancelado por qualquer `cue` que apareça
 * depois: o StrictMode (efeito, cleanup, efeito) não corta a fala que acabou
 * de começar, e uma `cue` nova não é emudecida pelo corte da anterior, que o
 * `play` do canal já interrompeu.
 */
export function useSpokenCue(cue: SpeechCue | null): void {
  const audio = useAudio()
  const { locale } = useLocale()
  const { readStreak } = useKairya()
  // Último valor em ref: mudar idioma ou preferência não reexecuta o efeito.
  const latest = useRef({ audio, locale, readStreak })
  useEffect(() => {
    latest.current = { audio, locale, readStreak }
  }, [audio, locale, readStreak])
  const spoken = useRef(new WeakSet<SpeechCue>())
  const cutToken = useRef(0)

  useEffect(() => {
    if (cue === null) return undefined
    cutToken.current += 1
    if (!spoken.current.has(cue)) {
      // Marcada mesmo com o som desligado: ligar depois não fala uma fala velha.
      spoken.current.add(cue)
      const { audio: sound, locale: language, readStreak: streak } = latest.current
      sound.playVoice(lineSrc(language, cue.line))
      const effect = sfxForOpening(cue, streak())
      if (effect !== null) sound.playSfx(effect)
    }
    return () => {
      cutToken.current += 1
      const mine = cutToken.current
      queueMicrotask(() => {
        if (cutToken.current === mine) latest.current.audio.stopVoice()
      })
    }
  }, [cue])
}
