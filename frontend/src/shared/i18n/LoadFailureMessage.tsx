import type { MessageKey } from './catalog'
import { FailureMessage } from './FailureMessage'
import type { LoadFailure } from './failureText'
import { useT } from './useT'

/**
 * O texto de uma falha de carga: o do catalogo, para a falha de API, ou a
 * chave fixa da area (`unexpected`), para o defeito. Sem elemento proprio,
 * como o `FailureMessage`.
 */
export function LoadFailureMessage({
  failure,
  unexpected,
}: {
  failure: LoadFailure
  unexpected: MessageKey
}) {
  const t = useT()
  return failure.kind === 'api' ? <FailureMessage failure={failure.text} /> : <>{t(unexpected)}</>
}
