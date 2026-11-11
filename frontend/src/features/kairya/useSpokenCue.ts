import { useEffect, useRef, type RefObject } from 'react'
import { useAudio } from '../../shared/audio/useAudio'
import { useLocale } from '../../shared/i18n/useLocale'
import { lineSrc } from './lineAudio'
import { sfxForOpening } from './soundCues'
import { useKairya } from './useKairya'
import type { SpeechCue } from './useKairyaMood'

/**
 * Fala a legenda que a bolha mostra: toca o mp3 da `cue` uma vez por
 * identidade, só se a legenda estiver visível (a troca de idioma ou de preferência não repete nem "reativa"
 * uma fala velha) e corta a voz quando a `cue` some ou o componente desmonta.
 *
 * Fala sem legenda visível não toca voz: se o `anchor` (a região da legenda)
 * está sob `inert` (folha da tutora aberta) ou `hidden` (área oculta), a fala
 * é marcada como dita e fica muda, e voltar à tela não a toca depois.
 *
 * O corte é agendado em microtask e cancelado por qualquer `cue` que apareça
 * depois: o StrictMode (efeito, cleanup, efeito) não corta a fala que acabou
 * de começar, e uma `cue` nova não é emudecida pelo corte da anterior, que o
 * `play` do canal já interrompeu.
 */
export function useSpokenCue(cue: SpeechCue | null, anchor: RefObject<Element | null>): void {
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
      if (!anchor.current?.closest('[inert],[hidden]')) {
        sound.playVoice(lineSrc(language, cue.line))
      }
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
  }, [cue, anchor])
}
