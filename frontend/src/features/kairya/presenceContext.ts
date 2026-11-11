import { createContext } from 'react'
import type { KairyaEvent } from './events'
import type { PresenceState } from './useKairyaMood'

export interface KairyaContextValue {
  state: PresenceState
  dispatch(event: KairyaEvent): void
  /** Despacha em ordem; o reducer resolve a prioridade das celebrações (D2). */
  dispatchAll(events: readonly KairyaEvent[]): void
  /** Informa a sequência lida no ciclo; no-op quando a saudação está desligada. */
  reportStreak(streak: number): void
  /** A sequência da última chamada de `reportStreak`; `null` sem leitura ou com a saudação desligada. */
  readStreak(): number | null
}

/**
 * Sem valor padrão (`null`): um default falso esconderia o esquecimento do
 * `KairyaPresenceProvider`, e a tela ficaria muda sem erro. `useKairya` lança
 * quando lê `null`.
 *
 * Fica num `.ts` separado porque o `react-refresh/only-export-components`
 * reprova `.tsx` que exporta algo além de componentes.
 */
export const KairyaContext = createContext<KairyaContextValue | null>(null)
