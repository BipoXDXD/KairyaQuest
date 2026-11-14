import { useEffect, useState } from 'react'

/** A chave do `localStorage` com o último dia cuja lanterna acesa foi vista. */
export const LANTERN_REVEAL_KEY = 'kairyaquest.lanternRevealSeen'

/**
 * Se a lanterna acesa de `day` ainda não foi vista. Sem storage, ou com o
 * storage lançando (modo privado, `SecurityError`), a resposta é `false`: sem
 * como lembrar, a animação repetiria a cada visita, então ela não sai.
 */
export function isRevealPending(day: string, storage: Storage | null): boolean {
  if (storage === null) return false
  try {
    return storage.getItem(LANTERN_REVEAL_KEY) !== day
  } catch {
    return false
  }
}

export function markRevealSeen(day: string, storage: Storage | null): void {
  try {
    storage?.setItem(LANTERN_REVEAL_KEY, day)
  } catch {
    // Sem onde gravar: a lanterna acesa só não fica lembrada como vista.
  }
}

interface Reveal {
  litDay: string | null
  pending: boolean
}

function decide(litDay: string | null, storage: Storage | null): Reveal {
  return { litDay, pending: litDay !== null && isRevealPending(litDay, storage) }
}

/**
 * Se a lanterna de hoje acende agora. `litDay` é o dia de hoje quando a
 * lanterna dele está acesa, e `null` nos outros casos.
 *
 * A decisão só lê o storage, durante o render, e vale até `litDay` mudar
 * (por exemplo, numa atualização em silêncio que acende a lanterna). A
 * gravação do "já vista" fica no efeito porque o render tem de ser puro: o
 * React pode descartar um render sem levá-lo à tela, e gravar ali marcaria
 * como vista uma lanterna que ninguém viu acender.
 */
export function useLanternReveal(litDay: string | null, storage = defaultStorage()): boolean {
  const [reveal, setReveal] = useState(() => decide(litDay, storage))
  let current = reveal
  if (reveal.litDay !== litDay) {
    current = decide(litDay, storage)
    setReveal(current)
  }
  const { pending } = current
  useEffect(() => {
    if (pending && litDay !== null) markRevealSeen(litDay, storage)
  }, [pending, litDay, storage])
  return pending
}

function defaultStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    // Ler a propriedade já lança em alguns navegadores com storage bloqueado.
    return null
  }
}
