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
    const { container } = renderWithI18n(
      <LoadFailureMessage failure={HTTP} unexpected="progression.panel.unexpectedFailure" />,
    )

    expect(container).toHaveTextContent(
      /^O servidor não conseguiu atender o pedido\. Tente de novo em instantes\.$/,
    )
  })

  it('a falha de API sai do catalogo em ingles', () => {
    const { container } = renderWithI18n(
      <LoadFailureMessage failure={HTTP} unexpected="progression.panel.unexpectedFailure" />,
      { locale: 'en' },
    )

    expect(container).toHaveTextContent(
      /^The request didn't go through\. The server returned an error\. Try again in a moment\.$/,
    )
  })

  it.each([
    ['pt-BR', /^Falha inesperada ao carregar o progresso\.$/],
    ['en', /^Couldn't load your progress\. Something unexpected went wrong\. Try again\.$/],
  ] as const)('a falha inesperada mostra a chave da area, em %s', (locale, texto) => {
    const { container } = renderWithI18n(
      <LoadFailureMessage
        failure={{ kind: 'unexpected' }}
        unexpected="progression.panel.unexpectedFailure"
      />,
      { locale },
    )

    expect(container).toHaveTextContent(texto)
  })
})
