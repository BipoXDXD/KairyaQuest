import type { Messages } from '../catalog'

/**
 * As mesmas chaves de `ptBR`; o `satisfies` reprova chave faltando ou sobrando.
 * Os nomes dos idiomas sao a sigla visivel seguida do endonimo, iguais nos
 * dois catalogos: o nome acessivel comeca pelo texto visivel (WCAG 2.5.3).
 */
export const en = {
  'shell.locale.label': 'Language',
  'shell.locale.ptBR': 'PT, Português (Brasil)',
  'shell.locale.en': 'EN, English',
  'shell.locale.saveFailed':
    "Couldn't save {language} as your language. The connection failed. Try again.",
  // Falas gravadas da Kairya (F6): fonte da legenda e do roteiro da F8.
  // Sem número, nome nem placeholder: o específico vai só na legenda.
  'kairya.lines.greet_morning_1': "Good morning. What's today's first step?",
  'kairya.lines.greet_morning_2': 'Good morning. Start with the easy part and warm up.',
  'kairya.lines.greet_afternoon_1': 'Good afternoon. Good to see you. What fits right now?',
  'kairya.lines.greet_afternoon_2': 'Good afternoon. A short block still counts as training.',
  'kairya.lines.greet_evening_1': "Good evening. Good to see you. What's today's step?",
  'kairya.lines.greet_evening_2': 'Good evening. Short on time? Pick just one thing.',
  'kairya.lines.mission_done_1': "Done. That's real training.",
  'kairya.lines.mission_done_2': 'One more step taken. Training well done.',
  'kairya.lines.mission_done_3': 'Finished. Take a breath and pick the next one.',
  'kairya.lines.mission_done_4': "That's it. This is how consistency is built.",
  'kairya.lines.weekly_trial_done_1': 'Weekly trial cleared. You trained for this.',
  'kairya.lines.weekly_trial_done_2': 'Bigger challenge done. That was a whole week of training.',
  'kairya.lines.level_up_1': 'You built this, day by day.',
  'kairya.lines.level_up_2': 'Level up. Your foundation got stronger.',
  'kairya.lines.level_up_3': 'New level. That was training, not luck.',
  'kairya.lines.achievement_1': "Another mark on the path. It's yours.",
  'kairya.lines.achievement_2': 'New achievement. It shows what you did.',
  'kairya.lines.achievement_3': "That's worth marking. You made it happen.",
  'kairya.lines.eval_meets_1': 'That meets it. On to the next step.',
  'kairya.lines.eval_meets_2': 'That meets it. Your evidence shows what you learned.',
  'kairya.lines.eval_partial_1': "Almost there. Check what's missing and adjust.",
  'kairya.lines.eval_partial_2': 'Good base here. One piece is missing; want to finish it?',
  'kairya.lines.eval_not_meets_1': "Not there yet. Want to look at what's missing together?",
  'kairya.lines.eval_not_meets_2': 'Not yet. Start with the point the review flagged.',
  'kairya.lines.streak_kept_1': "One more day of training. That's how it builds.",
  'kairya.lines.streak_kept_2': 'Daily drill done. Your rhythm is showing.',
  'kairya.lines.comeback_1': "Your streak reset. What you learned didn't. Go again today?",
  'kairya.lines.comeback_2': 'Good to see you back. One small step restarts it.',
  'kairya.lines.week_plan_created_1': "Plan set. Now it's one day at a time.",
  'kairya.lines.week_plan_created_2': "Week planned. Start with today's drill.",
  'kairya.lines.proposal_accepted_1': "Deal. It's on your list.",
  'kairya.lines.proposal_accepted_2': "Agreed. Start on it whenever you're ready.",
  'kairya.lines.tutor_offline_1': "I lost the connection. Let's try again in a moment.",
  'kairya.lines.tutor_offline_2': "I couldn't answer just now. Try again in a moment.",
  'kairya.lines.farewell_1': 'Good training today. Rest is part of it too.',
  'kairya.lines.farewell_2': "That's enough for today. We'll pick it up tomorrow.",
  'ui.dialog.cancel': 'Cancel',
  'ui.language.short.ptBR': 'PT',
  'ui.language.short.en': 'EN',
  'ui.loading': 'Loading…',
  'ui.sound.voice': "Kairya's voice",
  'ui.sound.sfx': 'Sound effects',
} as const satisfies Messages
