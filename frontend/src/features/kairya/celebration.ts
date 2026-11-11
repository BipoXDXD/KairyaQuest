import type { MissionType, Verdict } from '../../shared/types/mission'
import type { Reward } from '../../shared/types/reward'
import type { CelebrationReason, KairyaEvent } from './events'

/** Tipo de missão → o que ela celebra (R6). */
const COMPLETION_REASON: Record<MissionType, CelebrationReason> = {
  diaria: 'dailyDone',
  especial: 'weeklyTrialDone',
  avulsa: 'missionDone',
}

/**
 * Só o que a recompensa acrescenta: nível novo e conquistas. Sem `reward`
 * (deploy defasado ou contrato violado: ausente ou `null`) não há nada a somar.
 */
function rewardEvents(reward: Reward | null | undefined): KairyaEvent[] {
  if (reward == null) {
    return []
  }
  const events: KairyaEvent[] = []
  if (reward.level_after > reward.level_before) {
    events.push({
      type: 'celebrate',
      reason: 'levelUp',
      detail: { kind: 'level', level: reward.level_after },
    })
  }
  if (reward.achievements_unlocked.length > 0) {
    events.push({
      type: 'celebrate',
      reason: 'achievement',
      detail: { kind: 'achievements', items: reward.achievements_unlocked },
    })
  }
  return events
}

/**
 * Os eventos da conclusão de uma missão: a celebração do tipo e depois a
 * recompensa. O reducer resolve a prioridade; aqui só se lista, em ordem.
 */
export function completionEvents(done: {
  type: MissionType
  reward: Reward | null | undefined
}): KairyaEvent[] {
  return [
    { type: 'celebrate', reason: COMPLETION_REASON[done.type], detail: null },
    ...rewardEvents(done.reward),
  ]
}

/** O veredito → a reação da Kairya; `null` (avaliação sem veredito) não reage. */
function verdictEvent(verdict: Verdict | null): KairyaEvent[] {
  switch (verdict) {
    case 'atende':
      return [{ type: 'say', topic: 'evalMeets' }]
    case 'parcial':
      return [{ type: 'say', topic: 'evalPartial' }]
    case 'nao_atende':
      return [{ type: 'concern', reason: 'evalNotMeets' }]
    case null:
      return []
  }
}

/** Os eventos de uma avaliação concluída: o veredito e, se houve bônus, nível e conquistas. */
export function evaluationEvents(done: {
  verdict: Verdict | null
  reward: Reward | null | undefined
}): KairyaEvent[] {
  return [...verdictEvent(done.verdict), ...rewardEvents(done.reward)]
}
