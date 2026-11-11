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
  'shell.locale.ptBR.endonym': 'Português (Brasil)',
  'shell.locale.en.endonym': 'English',
  'shell.locale.saveFailed':
    "Couldn't save {language} as your language. The server didn't confirm the change. Please try again.",
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

  'shell.nav.label': 'Areas',
  'shell.nav.caption': 'Explore',
  'shell.brand.name': 'KairyaQuest',
  'shell.brand.tagline': 'Your study journey',
  'shell.area.headquarters': 'Headquarters',
  'shell.area.campaigns': 'Campaigns',

  'headquarters.header.eyebrow': "Adventurer's library",
  'headquarters.header.title': 'Headquarters — your study dashboard',
  'headquarters.header.subtitle': "What's open, with its deadline and reward.",

  'shared.apiError.network.message': "Couldn't reach the server. The connection failed.",
  'shared.apiError.network.recovery': 'Check your connection and try again.',
  'shared.apiError.timeout.message': "The server didn't respond. It took too long to answer.",
  'shared.apiError.timeout.recovery': 'Try again in a moment.',
  'shared.apiError.http.message': "The request didn't go through. The server returned an error.",
  'shared.apiError.http.recovery': 'Try again in a moment.',
  'shared.apiError.format.message':
    "The response couldn't be read. It arrived in an unexpected format.",
  'shared.apiError.format.recovery': 'Try again.',
  'shared.apiError.interrupted.message':
    "The response didn't arrive in full. The connection dropped midway.",
  'shared.apiError.interrupted.recovery': 'Try again.',

  'missions.state.pending': 'Pending',
  'missions.state.inProgress': 'In progress',
  'missions.state.completed': 'Completed',
  'missions.rescheduleReason.difficulty': 'Difficulty',
  'missions.rescheduleReason.lackOfTime': 'Lack of time',
  'missions.rescheduleReason.priorityChange': 'Change of priority',

  'missions.failure.refresh': 'Refresh to see the current state.',
  'missions.failure.tryAgain': 'Try again.',
  'missions.failure.notAvailable':
    "This mission isn't available anymore. It may have been removed.",
  'missions.failure.reusedOperation':
    "Couldn't record this attempt. Its request ID was already used.",

  'missions.completionFailure.notFound.message':
    "This mission isn't on the board anymore. It may have been removed.",
  'missions.completionFailure.notFound.recovery': 'Refresh to see the current missions.',
  'missions.completionFailure.alreadyCompleted.message':
    "Couldn't complete this mission. It was already completed.",
  'missions.completionFailure.alreadyCompleted.recovery':
    'Refresh the board to see the current state.',
  'missions.completionFailure.expired.message':
    "Couldn't complete this mission. Its deadline has already passed.",
  'missions.completionFailure.unconfirmed.message':
    "Couldn't confirm the completion. The server's answer was lost.",
  'missions.completionFailure.unconfirmed.recovery':
    "Retrying is safe: the mission won't be completed twice.",
  'missions.completionFailure.unconfirmed.timeout':
    "Couldn't confirm the completion: the server timed out.",
  'missions.completionFailure.unconfirmed.network':
    "Couldn't confirm the completion: the server is unreachable.",
  'missions.completionFailure.evidenceRejected.message':
    "The evidence wasn't accepted. The text or link is invalid.",
  'missions.completionFailure.evidenceRejected.recovery': 'Check both and send again.',

  'missions.startFailure.alreadyStarted.message':
    "Couldn't start this mission. It was already started or completed.",
  'missions.startFailure.expired.message':
    "Couldn't start this mission. Its deadline has already passed.",
  'missions.startFailure.unconfirmed.message':
    "Couldn't confirm the start. The server's answer was lost.",
  'missions.startFailure.unconfirmed.recovery': "Retrying is safe: the mission won't start twice.",
  'missions.startFailure.unconfirmed.timeout': "Couldn't confirm the start: the server timed out.",
  'missions.startFailure.unconfirmed.network':
    "Couldn't confirm the start: the server is unreachable.",

  'missions.rescheduleFailure.deadlinePassed.message':
    "Couldn't reschedule. The new deadline is in the past.",
  'missions.rescheduleFailure.deadlinePassed.recovery': 'Pick a future date and time.',
  'missions.rescheduleFailure.tooFar.message':
    "Couldn't reschedule. The new deadline is more than 365 days away.",
  'missions.rescheduleFailure.tooFar.recovery': 'Pick an earlier date.',
  'missions.rescheduleFailure.unchanged.message':
    "Couldn't reschedule. The new deadline matches the current one.",
  'missions.rescheduleFailure.unchanged.recovery': 'Pick a different time.',
  'missions.rescheduleFailure.alreadyCompleted.message':
    "Couldn't reschedule this mission. It's already completed.",
  'missions.rescheduleFailure.derivedDeadline.message':
    "Couldn't reschedule this mission. Its deadline comes from the weekly plan.",
  'missions.rescheduleFailure.unconfirmed.message':
    "Couldn't confirm the new deadline. The server's answer was lost.",
  'missions.rescheduleFailure.unconfirmed.recovery':
    "Retrying is safe: the deadline won't change twice.",
  'missions.rescheduleFailure.unconfirmed.timeout':
    "Couldn't confirm the new deadline: the server timed out.",
  'missions.rescheduleFailure.unconfirmed.network':
    "Couldn't confirm the new deadline: the server is unreachable.",
  'missions.rescheduleFailure.notAccepted.message':
    "The new deadline wasn't accepted. The date or reason is invalid.",
  'missions.rescheduleFailure.notAccepted.recovery': 'Check both and try again.',

  'missions.evaluationFailure.noEvidence.message':
    "Kairya couldn't evaluate this mission. It has no evidence to review.",
  'missions.evaluationFailure.inProgress.message':
    "Couldn't request a new evaluation. Kairya is already reviewing this submission.",
  'missions.evaluationFailure.inProgress.recovery': 'Try again in a moment.',
  'missions.evaluationFailure.providerNotConfigured.message':
    "Kairya is offline. The AI provider isn't configured.",
  'missions.evaluationFailure.providerNotConfigured.recovery':
    'Configure the provider and try again.',
  'missions.evaluationFailure.providerUnavailable.message':
    "Kairya couldn't evaluate this right now. The AI provider didn't respond.",
  'missions.evaluationFailure.timeout.message':
    "The evaluation didn't finish. It took too long to complete.",
  'missions.evaluationFailure.invalidEvaluation.message':
    "The evaluation couldn't be used. Kairya answered outside the rubric.",
  'missions.evaluationFailure.generic.message':
    "Couldn't request the evaluation. The server's answer was lost.",
  'missions.evaluationFailure.generic.recovery':
    'Retrying is safe: the bonus is never granted twice.',
  'missions.evaluationFailure.generic.timeout':
    "Couldn't request the evaluation: the server timed out.",
  'missions.evaluationFailure.generic.network':
    "Couldn't request the evaluation: the server is unreachable.",

  'tutoring.messageFailure.safeRetry': "Retrying is safe: your question won't repeat.",
  'tutoring.messageFailure.tryAgain': 'Try again.',
  'tutoring.messageFailure.unknownResult.message':
    "Couldn't tell whether Kairya's answer arrived. The reply was cut off.",
  'tutoring.messageFailure.providerNotConfigured.message':
    "Kairya is offline. The AI provider isn't configured.",
  'tutoring.messageFailure.providerNotConfigured.recovery': 'Configure the provider and try again.',
  'tutoring.messageFailure.inProgress.message':
    "Couldn't send this question. Kairya is still answering the previous one.",
  'tutoring.messageFailure.inProgress.recovery': 'Wait a moment and try again.',
  'tutoring.messageFailure.reusedOperation.message':
    "Couldn't record this question. Its request ID was already used.",
  'tutoring.messageFailure.dailyLimit.message':
    "Kairya can't answer now. You've reached today's conversation limit.",
  'tutoring.messageFailure.dailyLimit.backAtMidnight':
    'Kairya is back at midnight (Brasília time).',
  'tutoring.messageFailure.dailyLimit.backTomorrow': 'Try again tomorrow.',
  'tutoring.messageFailure.providerUnavailable.message':
    "Kairya couldn't answer right now. The AI provider didn't respond.",
  'tutoring.messageFailure.timeout.message': "Kairya's answer didn't arrive. It took too long.",
  'tutoring.messageFailure.invalidProposal.message':
    "Kairya's mission proposal couldn't be used. It failed validation.",
  'tutoring.messageFailure.invalidProposal.recovery': 'Try again or ask a different way.',
  'tutoring.messageFailure.refused.message':
    "Kairya couldn't answer this question. Its content was declined.",
  'tutoring.messageFailure.refused.recovery': 'Ask it a different way.',
  'tutoring.messageFailure.rejectedBody.message':
    "Your question wasn't accepted. The text is invalid.",
  'tutoring.messageFailure.rejectedBody.recovery': 'Check the text and send it again.',

  'tutoring.actionFailure.askNewProposal': 'Ask Kairya for a new proposal.',
  'tutoring.actionFailure.refreshConversation':
    'Refresh the conversation to see the current state.',
  'tutoring.actionFailure.reusedOperation.message':
    "Couldn't record this attempt. Its request ID was already used.",
  'tutoring.actionFailure.reusedOperation.recovery': 'Try again.',
  'tutoring.actionFailure.alreadyDecided.message':
    "Couldn't decide this proposal. It was already decided.",
  'tutoring.actionFailure.notFound.message': "Couldn't decide this proposal. It no longer exists.",
  'tutoring.actionFailure.expired.message':
    "Couldn't confirm this proposal. Its deadline has already passed.",
  'tutoring.actionFailure.rescheduleInvalid.message':
    "Couldn't reschedule the mission. It changed after the proposal.",
  'tutoring.actionFailure.estimateOutOfBounds.message':
    "Couldn't confirm this proposal. Its estimate must be 1 to 1440 minutes.",
  'tutoring.actionFailure.deadlineOutOfBounds.message':
    "Couldn't confirm this proposal. Its deadline is over 365 days away.",
  'tutoring.actionFailure.unconfirmedCreate.message':
    "Couldn't confirm the mission. The server's answer was lost.",
  'tutoring.actionFailure.unconfirmedCreate.recovery':
    "Retrying is safe: the mission won't be created twice.",
  'tutoring.actionFailure.unconfirmedCreate.timeout':
    "Couldn't confirm the mission: the server timed out.",
  'tutoring.actionFailure.unconfirmedCreate.network':
    "Couldn't confirm the mission: the server is unreachable.",
  'tutoring.actionFailure.unconfirmedReschedule.message':
    "Couldn't confirm the new deadline. The server's answer was lost.",
  'tutoring.actionFailure.unconfirmedReschedule.recovery':
    "Retrying is safe: the deadline won't change twice.",
  'tutoring.actionFailure.unconfirmedReschedule.timeout':
    "Couldn't confirm the new deadline: the server timed out.",
  'tutoring.actionFailure.unconfirmedReschedule.network':
    "Couldn't confirm the new deadline: the server is unreachable.",
  'tutoring.actionFailure.unconfirmedReject.message':
    "Couldn't decline the proposal. The server's answer was lost.",
  'tutoring.actionFailure.unconfirmedReject.recovery': 'Retrying is safe: nothing changes twice.',
  'tutoring.actionFailure.unconfirmedReject.timeout':
    "Couldn't decline the proposal: the server timed out.",
  'tutoring.actionFailure.unconfirmedReject.network':
    "Couldn't decline the proposal: the server is unreachable.",
  'tutoring.actionFailure.failed.message':
    "This proposal couldn't be carried out. Something changed since it was made.",
  'ui.dialog.cancel': 'Cancel',
  'ui.language.short.ptBR': 'PT',
  'ui.language.short.en': 'EN',
  'ui.loading': 'Loading…',
  'ui.sound.voice': "Kairya's voice",
  'ui.sound.sfx': 'Sound effects',
} as const satisfies Messages
