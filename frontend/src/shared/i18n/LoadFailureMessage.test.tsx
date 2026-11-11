import { describe, expect, it } from 'vitest'
import { renderWithI18n } from '../../test/i18n'
import { LoadFailureMessage } from './LoadFailureMessage'
import type { LoadFailure } from './failureText'

const HTTP: LoadFailure = {
  kind: 'api',
  text: { message: 'shared.apiError.http.message', recovery: 'shared.apiError.http.recovery' },
}

describe('LoadFailureMessage', () => {
  it('a falha de API sai do catalogo em pt-BR', () => {
    const { container } = renderWithI18n(<LoadFailureMessage failure={HTTP} />)

    expect(container).toHaveTextContent(
      /^O servidor não conseguiu atender o pedido\. Tente de novo em instantes\.$/,
    )
  })

  it('a falha de API sai do catalogo em ingles', () => {
    const { container } = renderWithI18n(<LoadFailureMessage failure={HTTP} />, { locale: 'en' })

    expect(container).toHaveTextContent(
      /^The request didn't go through\. The server returned an error\. Try again in a moment\.$/,
    )
  })

  it('a falha inesperada mostra a mensagem da area', () => {
    const { container } = renderWithI18n(
      <LoadFailureMessage
        failure={{ kind: 'unexpected', message: 'Falha inesperada ao carregar X.' }}
      />,
    )

    expect(container).toHaveTextContent(/^Falha inesperada ao carregar X\.$/)
  })
})
