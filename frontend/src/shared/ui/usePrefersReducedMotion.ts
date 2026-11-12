import { useSyncExternalStore } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(REDUCED_MOTION_QUERY)
  media.addEventListener('change', onChange)
  return () => {
    media.removeEventListener('change', onChange)
  }
}

function getSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/**
 * Se a pessoa pediu movimento reduzido, acompanhando a preferencia ao vivo.
 * Serve para o que o CSS (`motion-safe:`) nao alcanca: um `<video>` em loop
 * nao e animacao de CSS, entao quem decide trocar por imagem parada e o
 * componente.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
