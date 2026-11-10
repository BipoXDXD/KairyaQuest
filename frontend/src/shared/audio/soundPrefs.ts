import type { SoundChannel } from '../ui/SoundToggle'

export const SOUND_STORAGE_KEY = 'kairyaquest.sound'
export const SOUND_INVITE_STORAGE_KEY = 'kairyaquest.soundInvite'

/** Valor gravado em `kairyaquest.soundInvite` quando o convite foi respondido. */
const INVITE_DISMISSED = '1'

/** `true` = canal ligado. Preferência deste dispositivo, não da conta. */
export interface SoundPrefs {
  readonly voice: boolean
  readonly sfx: boolean
}

export const SOUND_OFF: SoundPrefs = { voice: false, sfx: false }

/** As preferências, se `raw` for um objeto JSON com exatamente `voice` e `sfx` booleanos; senão `null`. */
export function parseSoundPrefs(raw: string | null): SoundPrefs | null {
  if (raw === null) {
    return null
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    // Texto que não é JSON é lixo de outra versão ou edição à mão: vale como
    // "sem preferência", e o som começa desligado.
    return null
  }
  return isSoundPrefs(value) ? { voice: value.voice, sfx: value.sfx } : null
}

function isSoundPrefs(value: unknown): value is SoundPrefs {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  // Duas chaves, e as duas são `voice` e `sfx`: nenhuma chave a mais passa.
  return (
    Object.keys(value).length === 2 &&
    'voice' in value &&
    'sfx' in value &&
    typeof value.voice === 'boolean' &&
    typeof value.sfx === 'boolean'
  )
}

export function readSoundPrefs(storage: Storage | null): SoundPrefs | null {
  if (storage === null) {
    return null
  }
  try {
    return parseSoundPrefs(storage.getItem(SOUND_STORAGE_KEY))
  } catch {
    // Modo privado ou storage bloqueado: a preferência só lembra a escolha do
    // dispositivo; sem ela o som fica desligado, que é o padrão seguro.
    return null
  }
}

export function writeSoundPrefs(storage: Storage | null, prefs: SoundPrefs): void {
  if (storage === null) {
    return
  }
  try {
    storage.setItem(SOUND_STORAGE_KEY, JSON.stringify({ voice: prefs.voice, sfx: prefs.sfx }))
  } catch {
    // Cota cheia ou storage bloqueado: a escolha vale nesta sessão e, perdida,
    // o próximo boot começa desligado, que é o padrão seguro.
  }
}

/** `true` só se o convite já foi respondido neste dispositivo (valor `"1"`). */
export function readInviteDismissed(storage: Storage | null): boolean {
  if (storage === null) {
    return false
  }
  try {
    return storage.getItem(SOUND_INVITE_STORAGE_KEY) === INVITE_DISMISSED
  } catch {
    // Storage bloqueado: o convite reaparece no próximo boot, o que só custa
    // um clique; o som continua desligado até a escolha.
    return false
  }
}

export function writeInviteDismissed(storage: Storage | null): void {
  if (storage === null) {
    return
  }
  try {
    storage.setItem(SOUND_INVITE_STORAGE_KEY, INVITE_DISMISSED)
  } catch {
    // Cota cheia ou storage bloqueado: o convite some nesta sessão pelo estado
    // do provider; perder a memória só o mostra de novo no próximo boot.
  }
}

export function withChannel(prefs: SoundPrefs, channel: SoundChannel, on: boolean): SoundPrefs {
  return { ...prefs, [channel]: on }
}
