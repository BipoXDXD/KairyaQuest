import { useEffect, useRef } from 'react'
import { useKairya } from '../kairya'
import { presenceEvents, type PresenceInput } from './tutorPresence'

/**
 * Traduz as mudancas da conversa em eventos da presenca. A entrada anterior
 * fica num `ref`, atualizado so depois do despacho; na montagem ela e a atual,
 * entao nada espurio sai (nem sob StrictMode, que repete o efeito).
 */
export function useTutorPresence(input: PresenceInput): void {
  const { dispatchAll } = useKairya()
  const previous = useRef(input)
  useEffect(() => {
    dispatchAll(presenceEvents(previous.current, input))
    previous.current = input
  })
}
