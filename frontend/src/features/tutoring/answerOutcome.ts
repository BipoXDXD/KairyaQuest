import type { MessageKey } from '../../shared/i18n/catalog'
import type { MessageRead } from './types'

/**
 * O `error_code` de uma resposta `interrompida` porque um limite de tamanho a
 * cortou (o teto de tokens ou a janela de contexto). Espelha `RESPOSTA_LONGA`
 * de `src/focusquest/modules/tutoring/domain.py`, a mao (pendencia 32). Nao e
 * code do evento `error`: a cortada chega no `done`.
 */
export const LONG_ANSWER = 'resposta_longa'

/** O code da resposta recusada (`CodigoDoStream.RESPOSTA_RECUSADA`, pendencia 120). */
export const REFUSED_ANSWER = 'resposta_recusada'

/**
 * A chave do que a regiao viva anuncia quando o `done` chega (pendencia 121). A cortada
 * nao pode soar como "terminou": quem usa leitor de tela so descobriria o corte
 * ao ler a mensagem. O `done` so traz `completa` ou a cortada por tamanho; o
 * texto neutro cobre qualquer outra resposta incompleta sem inventar motivo.
 */
export function announceAnswer(answer: MessageRead): MessageKey {
  if (answer.status === 'completa') {
    return 'tutoring.answer.announce.complete'
  }
  return answer.error_code === LONG_ANSWER
    ? 'tutoring.answer.announce.cut'
    : 'tutoring.answer.announce.incomplete'
}

const NOTES: Record<string, MessageKey> = {
  [LONG_ANSWER]: 'tutoring.answer.note.long',
  [REFUSED_ANSWER]: 'tutoring.answer.note.refused',
}

/**
 * A chave da nota ao lado do "Tentar de novo" da ultima pergunta sem resposta
 * completa, pelo motivo da ultima tentativa (pendencia 122). Repetir uma
 * cortada tende a cortar de novo, e repetir uma recusada tende a ser recusada:
 * nos dois casos a nota orienta a pedir de outro jeito. Sem motivo conhecido,
 * a nota geral: o resultado e desconhecido e repetir e seguro.
 *
 * `Object.hasOwn`, e nao indexar direto: um `error_code` como `toString` leria
 * o prototipo (mesma razao de `messageFailure.ts`).
 */
export function unansweredNote(answer: MessageRead | undefined): MessageKey {
  const code = answer?.error_code
  return code != null && Object.hasOwn(NOTES, code) ? NOTES[code]! : 'tutoring.answer.note.general'
}
