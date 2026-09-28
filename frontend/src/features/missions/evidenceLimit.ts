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
 * O que o SERVIDOR chama de espaco (medido com pydantic 2, no schema de
 * `TextoDaEvidencia`): o `White_Space` do Unicode, que e o `trim()` e o `\s`
 * do Rust. Sao 25 pontos de codigo: U+0009..U+000D, U+0020, U+0085, U+00A0,
 * U+1680, U+2000..U+200A, U+2028, U+2029, U+202F, U+205F e U+3000.
 *
 * NAO e o `trim()` do JS nem o `str.strip()` do Python. Diferencas medidas:
 * U+0085 (NEL) o servidor remove e o JS nao; U+FEFF o JS remove e o servidor
 * nao; U+001C..U+001F o Python remove, mas nem o servidor nem o JS. Um texto
 * so de NEL e vazio para o servidor (422); a tela tem de concordar com ele, e
 * o servidor e a verdade.
 */
const SERVER_SPACE =
  '\\t-\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const SERVER_SPACE_CHAR = new RegExp(`[${SERVER_SPACE}]`)

/**
 * O formato aceito do link: `(?i)^https?://\S+$` no backend, e la o `\S` e o
 * complemento do conjunto acima. A flag `i` faz `HTTPS://x.com` valer, como la.
 * Por isso o `\S` do JS (que trata U+FEFF como espaco e U+0085 como nao) nao
 * serve.
 */
const LINK_PATTERN = new RegExp(`^https?://[^${SERVER_SPACE}]+$`, 'i')

/**
 * O texto sem os espacos das pontas, pelo conjunto do servidor. Percorre por
 * indice, e nao por regex `[..]+$`: esta seria quadratica num texto com uma
 * corrida enorme de espacos no meio.
 */
export function stripEnds(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && SERVER_SPACE_CHAR.test(value.charAt(start))) {
    start += 1
  }
  while (end > start && SERVER_SPACE_CHAR.test(value.charAt(end - 1))) {
    end -= 1
  }
  return value.slice(start, end)
}

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
 * conta unidades UTF-16, e um emoji valeria 2 aqui e 1 la. O `stripEnds`
 * reproduz o `strip_whitespace` do schema, e o teto e medido DEPOIS dele.
 */
export function describeEvidence(draft: Readonly<EvidenceDraft>): EvidenceDescription {
  const text = stripEnds(draft.text)
  const link = stripEnds(draft.link)
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
