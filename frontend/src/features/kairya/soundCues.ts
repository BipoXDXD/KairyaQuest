import type { SfxName } from '../../shared/audio/sfx'
import type { MissionType, Verdict } from '../../shared/types/mission'
import type { Reward } from '../../shared/types/reward'
import type { KairyaEvent } from './events'
import { LINE_GROUPS } from './lines'
import type { SpeechCue } from './useKairyaMood'

/** Tipo de missão → o efeito de conclusão quando a recompensa não acrescenta nada. */
const COMPLETION_SFX: Readonly<Record<MissionType, SfxName>> = {
  diaria: 'lantern_lit',
  especial: 'mission_done',
  avulsa: 'mission_done',
}

const STREAK_GREETINGS: ReadonlySet<string> = new Set([
  ...LINE_GROUPS.greetMorning,
  ...LINE_GROUPS.greetAfternoon,
  ...LINE_GROUPS.greetEvening,
])

/** O efeito que a recompensa acrescenta: nível novo vence conquista; `null` se não há nenhum. */
function rewardSfx(reward: Reward): 'level_up' | 'achievement' | null {
  if (reward.level_after > reward.level_before) return 'level_up'
  if (reward.achievements_unlocked.length > 0) return 'achievement'
  return null
}

/** Um único efeito por conclusão: nível > conquista > o do tipo da missão. */
export function sfxForCompletion(done: {
  type: MissionType
  reward: Reward | null | undefined
}): SfxName {
  const reward = done.reward == null ? null : rewardSfx(done.reward)
  return reward ?? COMPLETION_SFX[done.type]
}

/** Só o veredito `atende` com recompensa soa: nível > conquista > XP. */
export function sfxForEvaluation(done: {
  verdict: Verdict | null
  reward: Reward | null | undefined
}): SfxName | null {
  if (done.verdict !== 'atende' || done.reward == null) return null
  return rewardSfx(done.reward) ?? 'xp_tick'
}

/** Pergunta enviada e falha da tutora soam; o resto da tutoria é silencioso. */
export function sfxForTutorEvent(event: KairyaEvent): SfxName | null {
  switch (event.type) {
    case 'questionSent':
      return 'message_sent'
    case 'tutorFailed':
      return 'soft_error'
    default:
      return null
  }
}

/** A saudação com sequência viva soa; o retorno (`comeback`) e as outras falas, não. */
export function sfxForOpening(cue: SpeechCue, lastStreak: number | null): SfxName | null {
  if (lastStreak === null || lastStreak <= 0) return null
  return STREAK_GREETINGS.has(cue.line) ? 'streak_kept' : null
}
