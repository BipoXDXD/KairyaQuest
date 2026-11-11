import type { MessageKey } from '../../shared/i18n/catalog'
import type { Locale } from '../../shared/i18n/locale'
import { plural } from '../../shared/i18n/plural'
import type { Translate } from '../../shared/i18n/useT'
import type { Counter } from '../../shared/types/counter'
import { MAX_EVIDENCE_LENGTH, MAX_LINK_LENGTH, type LinkError } from './evidenceLimit'

const LINK_ERROR_KEYS: Readonly<Record<LinkError, MessageKey>> = {
  format: 'missions.evidence.linkError.format',
  tooLong: 'missions.evidence.linkError.tooLong',
}

/** O motivo de o link nao valer, no idioma corrente. */
export function linkErrorText(error: LinkError, t: Translate): string {
  return t(LINK_ERROR_KEYS[error], { max: MAX_LINK_LENGTH })
}

/**
 * O texto do contador. "Restam 0" tem forma propria (`zero`); "passou 0" nao
 * existe, porque passar do limite e ter pelo menos 1 a mais.
 */
export function counterText(counter: Counter, locale: Locale, t: Translate): string {
  const key =
    counter.kind === 'remaining'
      ? plural(locale, counter.n, {
          zero: 'missions.evidence.counter.remaining.zero',
          one: 'missions.evidence.counter.remaining.one',
          other: 'missions.evidence.counter.remaining.other',
        })
      : plural(locale, counter.n, {
          one: 'missions.evidence.counter.over.one',
          other: 'missions.evidence.counter.over.other',
        })
  return t(key, { count: counter.n, max: MAX_EVIDENCE_LENGTH })
}
