import type { EvidenceDraft } from './types'

/**
 * O tamanho maximo do texto da evidencia, em pontos de codigo.
 *
 * Espelha `TAMANHO_MAXIMO_DA_EVIDENCIA`, em
 * src/focusquest/modules/missions/schemas.py, e nada amarra os dois (pendencia
 * 32). Quem mudar la muda aqui.
 */
export const MAX_EVIDENCE_LENGTH = 4000

/**
 * O tamanho maximo do link, em pontos de codigo.
 *
 * Espelha `TAMANHO_MAXIMO_DO_LINK`, no mesmo arquivo, a mao (pendencia 32).
 */
export const MAX_LINK_LENGTH = 2000

/** A partir de quantos caracteres o contador aparece: 90% do limite. */
export const COUNTER_VISIBLE_FROM = (MAX_EVIDENCE_LENGTH * 9) / 10

/**
 * O formato aceito do link: `(?i)^https?://\S+$` no backend. A flag `i` faz
 * `HTTPS://x.com` valer, como la.
 */
const LINK_PATTERN = /^https?:\/\/\S+$/i

const LINK_FORMAT_ERROR = 'O link precisa começar com http:// ou https:// e não ter espaços.'
const LINK_LENGTH_ERROR = `O link passa de ${String(MAX_LINK_LENGTH)} caracteres.`

export interface EvidenceDescription {
  /** Texto nao vazio e dentro do limite, e link (se houver) valido. */
  sendable: boolean
  /** O texto do contador, ou `null` longe do limite. */
  counter: string | null
  /** O motivo de o link nao valer, ou `null` (link vazio tambem e `null`). */
  linkError: string | null
  /** O que vai no POST (sem espacos nas pontas; sem `link` se vazio), ou `null`. */
  body: { text: string; link?: string } | null
}

/**
 * O que o SERVIDOR vai medir e aceitar.
 *
 * `Array.from(...).length` conta pontos de codigo; o `.length` de uma string
 * conta unidades UTF-16, e um emoji valeria 2 aqui e 1 la. O `trim()`
 * reproduz o `strip_whitespace` do schema.
 */
export function describeEvidence(draft: Readonly<EvidenceDraft>): EvidenceDescription {
  const text = draft.text.trim()
  const link = draft.link.trim()
  const length = Array.from(text).length
  const remaining = MAX_EVIDENCE_LENGTH - length
  const linkError = describeLinkError(link)
  const sendable = length > 0 && remaining >= 0 && linkError === null
  return {
    sendable,
    counter: length < COUNTER_VISIBLE_FROM ? null : counterText(remaining),
    linkError,
    body: sendable ? (link === '' ? { text } : { text, link }) : null,
  }
}

function describeLinkError(link: string): string | null {
  if (link === '') {
    return null
  }
  if (Array.from(link).length > MAX_LINK_LENGTH) {
    return LINK_LENGTH_ERROR
  }
  return LINK_PATTERN.test(link) ? null : LINK_FORMAT_ERROR
}

function counterText(remaining: number): string {
  if (remaining < 0) {
    const over = -remaining
    return `Passou ${String(over)} ${over === 1 ? 'caractere' : 'caracteres'} do limite de ${String(MAX_EVIDENCE_LENGTH)}.`
  }
  return remaining === 1 ? 'Resta 1 caractere.' : `Restam ${String(remaining)} caracteres.`
}
