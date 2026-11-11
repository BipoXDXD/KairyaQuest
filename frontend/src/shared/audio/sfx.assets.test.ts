/// <reference types="node" />
import { describe, expect, test } from 'vitest'
import { listSources, readSource, sourceExists, sourceSize } from '../../test/readSource'
import { SFX_NAMES, sfxSrc } from './sfx'

/** 64 kbps × 2,5 s: um efeito curto codificado pelo encode-audio.sh cabe com folga. */
const SFX_MAX_BYTES = 20_000
/** Abaixo disso o arquivo é um mp3 vazio ou truncado, não um efeito. */
const SFX_MIN_BYTES = 1_000
/** Teto do áudio inteiro do app (falas nos dois idiomas + efeitos), para o bundle estático não inchar. */
const AUDIO_TOTAL_MAX_BYTES = 4_000_000
/** 36 falas × 2 idiomas: o total abaixo não pode passar por vácuo. */
const RECORDED_LINES = 72
const inPublic = (p: string) => `public${p}`
const isVisible = (p: string) => !p.split('/').at(-1)?.startsWith('.')

const expected = SFX_NAMES.map((name) => inPublic(sfxSrc(name)))

describe('efeitos sonoros', () => {
  test('há 12 efeitos esperados, sem repetição', () => {
    expect(new Set(expected).size).toBe(12)
  })

  test('todo efeito tem o seu mp3 em public/', () => {
    expect(expected.filter((p) => !sourceExists(p))).toEqual([])
  })

  test('não há mp3 fora dos 12 nem arquivo de outro tipo', () => {
    expect(listSources('public/audio/sfx/*').filter(isVisible)).toEqual([...expected].sort())
  })

  test.each(expected)('efeito %s tem entre 1 000 e 20 000 bytes', (path) => {
    const size = sourceSize(path)
    expect(size).toBeGreaterThanOrEqual(SFX_MIN_BYTES)
    expect(size).toBeLessThanOrEqual(SFX_MAX_BYTES)
  })
})

test('o total de public/audio/ cabe em 4 000 000 bytes', () => {
  const all = listSources('public/audio/**/*.mp3')
  expect(all.length).toBeGreaterThan(RECORDED_LINES)
  const total = all.reduce((sum, p) => sum + sourceSize(p), 0)
  expect(total).toBeLessThanOrEqual(AUDIO_TOTAL_MAX_BYTES)
})

describe('procedência', () => {
  const audioDoc = readSource('../docs/AUDIO.md').split('\n')

  test.each(SFX_NAMES)('AUDIO.md registra o efeito %s', (name) => {
    const row = audioDoc.find((line) => line.includes(`frontend/public/audio/sfx/${name}.mp3`))
    expect(row).toContain('eleven_text_to_sound_v2')
  })
})
