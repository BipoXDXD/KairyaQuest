import { useEffect, useRef } from 'react'
import { useAudio } from '../../shared/audio/useAudio'
import { sfxForTutorEvent, useKairya } from '../kairya'
import { arrivedProposal, presenceEvents, type PresenceInput } from './tutorPresence'

/**
 * Traduz as mudancas da conversa em eventos da presenca e em efeitos sonoros.
 * A entrada anterior fica num `ref`, atualizado so depois do despacho; na
 * montagem ela e a atual, entao nada espurio sai (nem sob StrictMode, que
 * repete o efeito).
 */
export function useTutorPresence(input: PresenceInput): void {
  const { dispatchAll } = useKairya()
  const { playSfx } = useAudio()
  const previous = useRef(input)
  useEffect(() => {
    const events = presenceEvents(previous.current, input)
    dispatchAll(events)
    // Um efeito por mudanca: o primeiro dos eventos que soa, ou a proposta.
    const sfx =
      events.map(sfxForTutorEvent).find((name) => name !== null) ??
      (arrivedProposal(previous.current, input) ? 'proposal_arrived' : null)
    if (sfx !== null) playSfx(sfx)
    previous.current = input
  })
}
