import { expect, test } from 'vitest'
import { audioSrc } from './audioSrc'
import { SFX_NAMES, sfxSrc } from './sfx'

test('há os 12 efeitos da spec §9, na ordem dela', () =>
  expect(SFX_NAMES).toEqual([
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
  ]))

test('sfxSrc aponta para /audio/sfx', () =>
  expect(sfxSrc('lantern_lit')).toBe('/audio/sfx/lantern_lit.mp3'))

test('audioSrc não aceita texto fora de /audio/*.mp3', () => {
  // @ts-expect-error -- caminho fora do padrão não compila
  audioSrc('Bom dia.')
  expect(audioSrc('/audio/sfx/x.mp3')).toBe('/audio/sfx/x.mp3')
})
