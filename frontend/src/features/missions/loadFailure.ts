import { ApiError } from '../../shared/api/client'
import { apiErrorText, type FailureText } from '../../shared/i18n/failureText'

/**
 * A falha de carga do quadro e do ciclo. Como o `LoadFailure` compartilhado,
 * mas o defeito vai SEM texto: quem traduz e a tela, pelo idioma corrente. Um
 * texto gravado no estado ficaria no idioma da hora da falha e nao mudaria
 * com a troca de idioma.
 */
export type MissionsLoadFailure = { kind: 'api'; text: FailureText } | { kind: 'unexpected' }

/** O `ApiError` vira o texto do catalogo pelo `kind`; o resto e defeito nosso. */
export function missionsLoadFailureFor(error: unknown): MissionsLoadFailure {
  return error instanceof ApiError
    ? { kind: 'api', text: apiErrorText(error) }
    : { kind: 'unexpected' }
}
