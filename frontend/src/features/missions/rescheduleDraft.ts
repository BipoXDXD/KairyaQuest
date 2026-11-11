import { isoToSaoPauloCivil, saoPauloCivilToIso } from '../../shared/lib/deadline'
import type { RescheduleDraft } from './types'

/** O campo mostra minutos; sem edicao, o POST conserva o instante original. */
export function deadlineForDraft(draft: RescheduleDraft): string | null {
  if (
    draft.originalDeadline !== undefined &&
    draft.civil === isoToSaoPauloCivil(draft.originalDeadline)
  ) {
    return draft.originalDeadline
  }
  return saoPauloCivilToIso(draft.civil)
}

/**
 * Se os dois rascunhos pedem o MESMO reagendamento: a mesma hora civil, o
 * mesmo motivo e o mesmo prazo efetivo. E a comparacao que decide se um reenvio
 * depois de uma falha `retry` pode usar a chave retida (F13: mesma chave com
 * outro conteudo e `409 operacao_reutilizada`). Mora aqui, e nao no formulario,
 * porque o formulario (o rotulo do botao) e o registro (`rescheduleKeyFor`, que
 * reaproveita a chave retida ou a troca antes do envio) decidem pela mesma
 * regra. Dois prazos com segundos distintos podem mostrar a mesma hora civil,
 * mas exigem chaves diferentes.
 */
export function sameDraft(a: RescheduleDraft, b: RescheduleDraft): boolean {
  return a.civil === b.civil && a.reason === b.reason && deadlineForDraft(a) === deadlineForDraft(b)
}
