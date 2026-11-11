import { audioSrc, type AudioSrc } from './audioSrc'

/** Os 12 efeitos curtos, na ordem da spec §9. */
export const SFX_NAMES = [
  'mission_done',
  'xp_tick',
  'level_up',
  'achievement',
  'weekly_trial_unlocked',
  'lantern_lit',
  'proposal_arrived',
  'message_sent',
  'soft_error',
  'streak_kept',
  'trail_step',
  'panel_open',
] as const

export type SfxName = (typeof SFX_NAMES)[number]

export function sfxSrc(name: SfxName): AudioSrc {
  return audioSrc(`/audio/sfx/${name}.mp3`)
}
