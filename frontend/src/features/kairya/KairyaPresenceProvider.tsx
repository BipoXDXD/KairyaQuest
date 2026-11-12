import { useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useDailyOpening, type DailyOpeningOptions } from './dailyOpening'
import type { KairyaEvent } from './events'
import { KairyaContext, type KairyaContextValue } from './presenceContext'
import { useKairyaMood, type PresenceOptions } from './useKairyaMood'

export interface KairyaPresenceProviderProps extends PresenceOptions, DailyOpeningOptions {
  children: ReactNode
  /** `false` desliga a saudação do dia: `reportStreak` vira no-op e nada é gravado. Padrão: ligada. */
  greeting?: boolean
}

/** Identidade estável para o `reportStreak` desligado (`greeting === false`). */
function ignoreStreak(): void {
  // Saudação desligada: nada a decidir nem a gravar.
}

/**
 * Guarda a presença da Kairya (humor, fala, celebração) e a abertura do dia,
 * para que missões e tutoria despachem eventos sem repassar callbacks pela
 * árvore.
 */
export function KairyaPresenceProvider({
  children,
  scheduler,
  random,
  clock,
  storage,
  greeting = true,
}: KairyaPresenceProviderProps) {
  const presence = useKairyaMood({ scheduler, random })
  const onCycleRead = useDailyOpening(presence, { clock, storage })
  const { state, dispatch } = presence
  // A sequência lida mora em ref: a `cue` da saudação não a carrega, e ler
  // por getter não re-renderiza os consumidores da presença (D18).
  const lastStreak = useRef<number | null>(null)
  const reportOpening = useCallback(
    (streak: number) => {
      lastStreak.current = streak
      onCycleRead(streak)
    },
    [onCycleRead],
  )
  const reportStreak = greeting ? reportOpening : ignoreStreak
  const readStreak = useCallback(() => lastStreak.current, [])
  const dispatchAll = useCallback(
    (events: readonly KairyaEvent[]) => {
      for (const event of events) dispatch(event)
    },
    [dispatch],
  )
  const value = useMemo<KairyaContextValue>(
    () => ({ state, dispatch, dispatchAll, reportStreak, readStreak }),
    [state, dispatch, dispatchAll, reportStreak, readStreak],
  )
  return <KairyaContext value={value}>{children}</KairyaContext>
}
