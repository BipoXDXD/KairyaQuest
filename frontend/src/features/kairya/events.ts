import type { UnlockedAchievement } from '../../shared/types/reward'

/** O estado visível da Kairya. */
export type Mood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'celebrating' | 'concerned'

/** O período do dia que escolhe a saudação. */
export type GreetingPeriod = 'morning' | 'afternoon' | 'evening'

/** O que a Kairya celebra. `dailyDone` é o treino do dia que mantém a sequência. */
export type CelebrationReason =
  'missionDone' | 'dailyDone' | 'weeklyTrialDone' | 'levelUp' | 'achievement'

/** Falas avulsas, sem humor próprio. */
export type SayTopic =
  'evalMeets' | 'evalPartial' | 'proposalAccepted' | 'weekPlanCreated' | 'farewell'

/**
 * O detalhe que só a legenda mostra. Números e nomes ficam fora da fala
 * gravada: a voz diz a frase genérica e a legenda acrescenta o específico.
 */
export type CaptionDetail =
  { kind: 'level'; level: number } | { kind: 'achievements'; items: readonly UnlockedAchievement[] }

/** Tudo o que move a Kairya: digitação, tutoria, celebração, preocupação, saudação e fala. */
export type KairyaEvent =
  | { type: 'userTyped' }
  | { type: 'draftCleared' }
  | { type: 'questionSent' }
  | { type: 'firstToken' }
  | { type: 'answerFinished' }
  | { type: 'tutorFailed'; offline: boolean }
  | { type: 'celebrate'; reason: CelebrationReason; detail: CaptionDetail | null }
  | { type: 'celebrationEnded' }
  | { type: 'dismissed' }
  | { type: 'concern'; reason: 'streakReset' | 'evalNotMeets' }
  | { type: 'greet'; period: GreetingPeriod }
  | { type: 'say'; topic: SayTopic }

/** Os eventos que sempre têm fala. A falha do tutor só fala quando está offline. */
export type SpokenEvent =
  | Extract<KairyaEvent, { type: 'celebrate' | 'concern' | 'greet' | 'say' }>
  | { type: 'tutorFailed'; offline: true }
