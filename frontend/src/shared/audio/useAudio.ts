import { useContext } from 'react'
import { AudioContext, type AudioControls } from './audioContext'

/** Preferências, convite e player do som; lança fora do `AudioProvider`. */
export function useAudio(): AudioControls {
  const audio = useContext(AudioContext)
  if (audio === null) {
    throw new Error('useAudio precisa de um AudioProvider acima na árvore')
  }
  return audio
}
