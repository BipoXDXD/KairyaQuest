import { parseLocale, type Locale } from '../i18n/locale'
import { ApiError, MUTATION_TIMEOUT_MS, patchJson, requestJson } from './client'

/**
 * O idioma gravado no servidor, ja lido. Uniao discriminada porque os tres
 * casos pedem acoes diferentes no boot:
 *
 * - `chosen`: o usuario escolheu, e a escolha vence o cache local;
 * - `unset`: o `null` do JSON, nunca escolheu; o front grava o idioma local;
 * - `unknown`: um valor que este front nao conhece (um idioma de uma versao
 *   mais nova do back, por exemplo); o front nao aplica nem grava nada.
 */
export type ServerLocale =
  { kind: 'chosen'; locale: Locale } | { kind: 'unset' } | { kind: 'unknown' }

export interface Me {
  displayName: string
  locale: ServerLocale
}

/** O 200 do `GET /api/me` com corpo fora do contrato. */
const FORMAT_ERROR_STATUS = 200

function parseServerLocale(value: unknown): ServerLocale {
  if (value === null) {
    return { kind: 'unset' }
  }
  const locale = parseLocale(value)
  return locale === null ? { kind: 'unknown' } : { kind: 'chosen', locale }
}

/**
 * Le `GET /api/me` e converte o corpo `unknown` no tipo do front, uma vez, na
 * fronteira. Sem `display_name` texto o corpo nao e o do contrato, e a falha
 * sai como `ApiError` de formato; um `locale` estranho nao derruba a leitura,
 * so vira `unknown`.
 */
export async function fetchMe(signal?: AbortSignal): Promise<Me> {
  const body = await requestJson<unknown>('/me', signal)
  if (typeof body !== 'object' || body === null || !('display_name' in body)) {
    throw formatError()
  }
  const displayName = body.display_name
  if (typeof displayName !== 'string') {
    throw formatError()
  }
  const locale = 'locale' in body ? body.locale : undefined
  return { displayName, locale: parseServerLocale(locale) }
}

function formatError(): ApiError {
  return new ApiError('A resposta chegou num formato inesperado.', FORMAT_ERROR_STATUS, null)
}

/**
 * Grava o idioma escolhido (`PATCH /api/me`). O corpo de resposta e o mesmo do
 * `GET` e nao e lido: quem chama ja sabe o idioma que mandou.
 */
export async function saveLocale(locale: Locale): Promise<void> {
  await patchJson<unknown>('/me', { locale }, { timeoutMs: MUTATION_TIMEOUT_MS })
}
