import type { RescheduleDraft } from './types'

/**
 * Se os dois rascunhos pedem o MESMO reagendamento: a mesma hora civil e o
 * mesmo motivo. E a comparacao que decide se um reenvio depois de uma falha
 * `retry` pode usar a chave retida (F13: mesma chave com outro conteudo e
 * `409 operacao_reutilizada`). Mora aqui, e nao no formulario, porque o
 * formulario (o rotulo do botao) e o cartao (liberar a chave) decidem pela
 * mesma regra.
 */
export function sameDraft(a: RescheduleDraft, b: RescheduleDraft): boolean {
  return a.civil === b.civil && a.reason === b.reason
}
