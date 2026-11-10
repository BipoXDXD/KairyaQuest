/// <reference types="node" />
import { expect, test } from 'vitest'
import { listSources, sourceExists, sourceSize } from '../../test/readSource'
import { lineSrc } from './lineAudio'
import { LINE_IDS } from './lines'

// Só o EN: as falas PT esperam a escolha da voz PT (docs/AUDIO.md §1).
const LOCALE = 'en'
/** 64 kbps × 8 s: uma fala curta codificada pelo encode-audio.sh fica bem abaixo. */
const LINE_MAX_BYTES = 64 * 1024
const inPublic = (p: string) => `public${p}`
const expected = LINE_IDS.map((id) => inPublic(lineSrc(LOCALE, id)))

test('toda fala EN tem o seu mp3 em public/', () => {
  expect(expected).toHaveLength(36)
  expect(expected.filter((p) => !sourceExists(p))).toEqual([])
})

test('não há mp3 de fala EN fora do catálogo', () => {
  expect(listSources(`public/audio/${LOCALE}/*`)).toEqual([...expected].sort())
})

test('cada fala EN tem no máximo 64 KB', () => {
  expect(expected.filter((p) => sourceSize(p) > LINE_MAX_BYTES)).toEqual([])
})
