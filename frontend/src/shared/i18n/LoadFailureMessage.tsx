import { FailureMessage } from './FailureMessage'
import type { LoadFailure } from './failureText'

/**
 * O texto de uma falha de carga: o do catalogo, para a falha de API, ou a
 * mensagem fixa da area, para o defeito. Sem elemento proprio, como o
 * `FailureMessage`.
 */
export function LoadFailureMessage({ failure }: { failure: LoadFailure }) {
  return failure.kind === 'api' ? <FailureMessage failure={failure.text} /> : <>{failure.message}</>
}
