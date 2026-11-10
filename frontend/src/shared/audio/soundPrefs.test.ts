import { afterEach, expect, test } from 'vitest'
import {
  SOUND_INVITE_STORAGE_KEY,
  SOUND_OFF,
  SOUND_STORAGE_KEY,
  parseSoundPrefs,
  readInviteDismissed,
  readSoundPrefs,
  withChannel,
  writeInviteDismissed,
  writeSoundPrefs,
} from './soundPrefs'

afterEach(() => {
  localStorage.clear()
})

test('as chaves têm o prefixo kairyaquest.', () => {
  expect(SOUND_STORAGE_KEY).toBe('kairyaquest.sound')
  expect(SOUND_INVITE_STORAGE_KEY).toBe('kairyaquest.soundInvite')
})

test('o padrão é tudo desligado', () => expect(SOUND_OFF).toEqual({ voice: false, sfx: false }))

test.each([
  ['{"voice":true,"sfx":false}', { voice: true, sfx: false }],
  ['{"voice":false,"sfx":true}', { voice: false, sfx: true }],
  [null, null],
  ['', null],
  ['{', null],
  ['[]', null],
  ['null', null],
  ['{"voice":"sim","sfx":true}', null],
  ['{"voice":true,"sfx":1}', null],
  ['{"voice":true}', null],
  ['{"voice":true,"sfx":true,"x":1}', null],
  ['true', null],
])('parseSoundPrefs(%j) → %j', (raw, expected) => expect(parseSoundPrefs(raw)).toEqual(expected))

test('grava e relê pela chave kairyaquest.sound', () => {
  writeSoundPrefs(localStorage, { voice: true, sfx: false })
  expect(localStorage.getItem('kairyaquest.sound')).toBe('{"voice":true,"sfx":false}')
  expect(readSoundPrefs(localStorage)).toEqual({ voice: true, sfx: false })
})

test('sem nada gravado, a leitura é null', () => expect(readSoundPrefs(localStorage)).toBeNull())

test('lixo gravado é lido como null (Review Focus 4)', () => {
  localStorage.setItem('kairyaquest.sound', '{"voice":"sim"}')
  expect(readSoundPrefs(localStorage)).toBeNull()
})

test('storage que lança: leitura null, escrita sem propagar (Review Focus 4)', () => {
  // Dublê parcial: as funções só usam getItem e setItem, e ambos lançam como
  // um navegador em modo privado ou com a cota cheia.
  const broken = {
    getItem: () => {
      throw new DOMException('', 'SecurityError')
    },
    setItem: () => {
      throw new DOMException('', 'QuotaExceededError')
    },
  } as unknown as Storage
  expect(readSoundPrefs(broken)).toBeNull()
  expect(() => {
    writeSoundPrefs(broken, SOUND_OFF)
  }).not.toThrow()
  expect(readInviteDismissed(broken)).toBe(false)
  expect(() => {
    writeInviteDismissed(broken)
  }).not.toThrow()
})

test('storage null: tudo desligado e nada lança', () => {
  expect(readSoundPrefs(null)).toBeNull()
  expect(readInviteDismissed(null)).toBe(false)
  expect(() => {
    writeSoundPrefs(null, { voice: true, sfx: true })
  }).not.toThrow()
  expect(() => {
    writeInviteDismissed(null)
  }).not.toThrow()
})

test.each([
  ['1', true],
  ['0', false],
  ['true', false],
  [null, false],
])('readInviteDismissed com %j → %s', (raw, expected) => {
  if (raw === null) localStorage.removeItem('kairyaquest.soundInvite')
  else localStorage.setItem('kairyaquest.soundInvite', raw)
  expect(readInviteDismissed(localStorage)).toBe(expected)
})

test('writeInviteDismissed grava "1" em kairyaquest.soundInvite', () => {
  writeInviteDismissed(localStorage)
  expect(localStorage.getItem('kairyaquest.soundInvite')).toBe('1')
})

test('withChannel troca só o canal pedido', () =>
  expect(withChannel(SOUND_OFF, 'sfx', true)).toEqual({ voice: false, sfx: true }))

test('withChannel desliga a voz sem mexer nos efeitos', () =>
  expect(withChannel({ voice: true, sfx: true }, 'voice', false)).toEqual({
    voice: false,
    sfx: true,
  }))
