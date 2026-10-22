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
 * O que a regiao viva anuncia quando o `done` chega (pendencia 121). A cortada
 * nao pode soar como "terminou": quem usa leitor de tela so descobriria o corte
 * ao ler a mensagem. O `done` so traz `completa` ou a cortada por tamanho; o
 * texto neutro cobre qualquer outra resposta incompleta sem inventar motivo.
 */
export function announceAnswer(answer: MessageRead): string {
  if (answer.status === 'completa') {
    return 'Kairya terminou de responder.'
  }
  return answer.error_code === LONG_ANSWER
    ? 'A resposta da Kairya ficou longa demais e foi cortada. Tente pedir por partes.'
    : 'A resposta da Kairya chegou incompleta.'
}

const NOTES: Record<string, string> = {
  [LONG_ANSWER]:
    'A última resposta ficou longa demais e foi cortada. Tente pedir por partes, um tópico de cada vez. Tentar de novo refaz a mesma pergunta e pode cortar outra vez.',
  [REFUSED_ANSWER]:
    'A Kairya não pôde responder à última pergunta. Tentar de novo tende a dar o mesmo resultado: pergunte de outro jeito.',
}

const GENERAL_NOTE =
  'A última pergunta ficou sem resposta completa. Tentar de novo é seguro: a pergunta não será duplicada.'

/**
 * A nota ao lado do "Tentar de novo" da ultima pergunta sem resposta
 * completa, pelo motivo da ultima tentativa (pendencia 122). Repetir uma
 * cortada tende a cortar de novo, e repetir uma recusada tende a ser recusada:
 * nos dois casos a nota orienta a pedir de outro jeito. Sem motivo conhecido,
 * a nota geral: o resultado e desconhecido e repetir e seguro.
 *
 * `Object.hasOwn`, e nao indexar direto: um `error_code` como `toString` leria
 * o prototipo (mesma razao de `messageFailure.ts`).
 */
export function unansweredNote(answer: MessageRead | undefined): string {
  const code = answer?.error_code
  return code != null && Object.hasOwn(NOTES, code) ? NOTES[code]! : GENERAL_NOTE
}
