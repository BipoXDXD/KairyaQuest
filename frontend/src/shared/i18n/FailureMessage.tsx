import type { FailureText } from './failureText'
import { useT } from './useT'

/**
 * O texto de uma falha no idioma corrente: o que falhou e por que, seguido do
 * que fazer. Sem elemento proprio: quem chama decide o `<p>`, o `role` e o
 * `data-testid`.
 *
 * Arquivo so com o componente, por causa do `react-refresh/only-export-components`.
 */
export function FailureMessage({ failure }: { failure: FailureText }) {
  const t = useT()
  return <>{`${t(failure.message)} ${t(failure.recovery)}`}</>
}
