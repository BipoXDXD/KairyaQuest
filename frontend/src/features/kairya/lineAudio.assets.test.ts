/// <reference types="node" />
import { describe, expect, test } from 'vitest'
import { listSources, sourceExists, sourceSize } from '../../test/readSource'
import type { Locale } from '../../shared/i18n/locale'
import { lineSrc } from './lineAudio'
import { LINE_IDS } from './lines'

const LOCALES: readonly Locale[] = ['en', 'pt-BR']
/** 64 kbps × 8 s: uma fala curta codificada pelo encode-audio.sh fica bem abaixo. */
const LINE_MAX_BYTES = 64 * 1024
const inPublic = (p: string) => `public${p}`

describe.each(LOCALES)('falas gravadas em %s', (locale) => {
  const expected = LINE_IDS.map((id) => inPublic(lineSrc(locale, id)))

  test('toda fala tem o seu mp3 em public/', () => {
    expect(expected).toHaveLength(36)
    expect(expected.filter((p) => !sourceExists(p))).toEqual([])
  })

  test('não há mp3 de fala fora do catálogo', () => {
    expect(listSources(`public/audio/${locale}/*`)).toEqual([...expected].sort())
  })

  test('cada fala tem no máximo 64 KB', () => {
    expect(expected.filter((p) => sourceSize(p) > LINE_MAX_BYTES)).toEqual([])
  })
})
