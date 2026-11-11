import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { renderWithI18n } from '../../test/i18n'
import { LOCALES } from './locale'
import { FailureMessage } from './FailureMessage'
import { apiErrorText, dailyLimitText, type FailureText } from './failureText'

const KINDS = ['network', 'timeout', 'http', 'format', 'interrupted'] as const

const FAILURES: readonly FailureText[] = [
  ...KINDS.map((kind) => apiErrorText(new ApiError('x', 500, null, { kind }))),
  dailyLimitText(new ApiError('x', 429, 'limite_diario_da_tutoria', { retryAfterSeconds: 60 })),
  dailyLimitText(new ApiError('x', 429, 'limite_diario_da_tutoria', { retryAfterSeconds: null })),
]

describe('FailureMessage', () => {
  it('junta a mensagem e o que fazer, com um espaco', () => {
    const { container } = renderWithI18n(
      <p>
        <FailureMessage
          failure={dailyLimitText(
            new ApiError('x', 429, 'limite_diario_da_tutoria', { retryAfterSeconds: 60 }),
          )}
        />
      </p>,
    )

    expect(container).toHaveTextContent(
      /^Você chegou ao limite de conversas de hoje\. A Kairya volta à meia-noite\.$/,
    )
  })

  it('renderiza em ingles', () => {
    const { container } = renderWithI18n(
      <FailureMessage
        failure={dailyLimitText(
          new ApiError('x', 429, 'limite_diario_da_tutoria', { retryAfterSeconds: 60 }),
        )}
      />,
      { locale: 'en' },
    )

    expect(container).toHaveTextContent(
      "Kairya can't answer now. You've reached today's conversation limit. Kairya is back at midnight (Brasília time).",
    )
  })

  it('renderiza em ingles a variante sem Retry-After', () => {
    const { container } = renderWithI18n(
      <FailureMessage
        failure={dailyLimitText(
          new ApiError('x', 429, 'limite_diario_da_tutoria', { retryAfterSeconds: null }),
        )}
      />,
      { locale: 'en' },
    )

    expect(container).toHaveTextContent(
      /^Kairya can't answer now\. You've reached today's conversation limit\. Try again tomorrow\.$/,
    )
  })

  it.each(LOCALES)('em %s, nenhum texto traz NaN, Invalid Date nem chave crua', (locale) => {
    for (const failure of FAILURES) {
      const { container, unmount } = renderWithI18n(<FailureMessage failure={failure} />, {
        locale,
      })
      const text = container.textContent
      expect(text).not.toBe('')
      for (const proibido of ['NaN', 'Invalid Date', '{', '}', failure.message]) {
        expect(text).not.toContain(proibido)
      }
      unmount()
    }
  })
})
