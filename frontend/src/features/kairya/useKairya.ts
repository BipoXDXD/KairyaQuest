import { useContext } from 'react'
import { KairyaContext, type KairyaContextValue } from './presenceContext'

/** A presença da Kairya e os despachos de evento; lança fora do `KairyaPresenceProvider`. */
export function useKairya(): KairyaContextValue {
  const kairya = useContext(KairyaContext)
  if (kairya === null) {
    throw new Error('useKairya precisa de um KairyaPresenceProvider acima na árvore')
  }
  return kairya
}
