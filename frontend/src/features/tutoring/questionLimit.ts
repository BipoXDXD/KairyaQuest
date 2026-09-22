/**
 * O tamanho maximo da pergunta, em pontos de codigo.
 *
 * Espelha `TAMANHO_MAXIMO_DA_PERGUNTA`, em
 * src/focusquest/modules/tutoring/schemas.py, e nada amarra os dois (pendencia
 * 32). O numero e PROVISORIO: e teto tecnico de custo, e a decisao de produto
 * e do dono (pendencia 41). Quem mudar la muda aqui.
 */
export const MAX_QUESTION_LENGTH = 4000

/** A partir de quantos caracteres o contador aparece: 90% do limite. */
export const COUNTER_VISIBLE_FROM = (MAX_QUESTION_LENGTH * 9) / 10

export interface QuestionLength {
  /** Pontos de codigo do texto sem espacos nas pontas. */
  length: number
  /** Quanto falta para o limite; negativo quando passou. */
  remaining: number
  /** Nao vazio e dentro do limite. */
  sendable: boolean
  /** O texto do contador, ou `null` longe do limite. */
  counter: string | null
}

/**
 * O tamanho que o SERVIDOR vai medir.
 *
 * `Array.from(...).length` conta pontos de codigo, como o `len()` do Python; o
 * `.length` de uma string conta unidades UTF-16, e um emoji valeria 2 aqui e 1
 * la. O `trim()` reproduz o `strip_whitespace` do `MessageCreate`.
 */
export function describeQuestionLength(text: string): QuestionLength {
  const length = Array.from(text.trim()).length
  const remaining = MAX_QUESTION_LENGTH - length
  return {
    length,
    remaining,
    sendable: length > 0 && remaining >= 0,
    counter: length < COUNTER_VISIBLE_FROM ? null : counterText(remaining),
  }
}

function counterText(remaining: number): string {
  if (remaining < 0) {
    const over = -remaining
    return `Passou ${String(over)} ${over === 1 ? 'caractere' : 'caracteres'} do limite de ${String(MAX_QUESTION_LENGTH)}.`
  }
  return remaining === 1 ? 'Resta 1 caractere.' : `Restam ${String(remaining)} caracteres.`
}
