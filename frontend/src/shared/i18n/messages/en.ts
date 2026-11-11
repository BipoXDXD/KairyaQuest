import type { Messages } from '../catalog'

/**
 * As mesmas chaves de `ptBR`; o `satisfies` reprova chave faltando ou sobrando.
 * Os nomes dos idiomas sao a sigla visivel seguida do endonimo, iguais nos
 * dois catalogos: o nome acessivel comeca pelo texto visivel (WCAG 2.5.3).
 */
export const en = {
  'shell.brand.name': 'KairyaQuest',
  'shell.brand.note': 'Your study journey',
  'shell.nav.label': 'Areas',
  'shell.nav.headquarters': 'Headquarters',
  'shell.nav.campaigns': 'Campaigns',
  'headquarters.hero.title': 'Headquarters — your study dashboard',
  'headquarters.hero.note': "What's open, with due dates and rewards.",
  'campaigns.hero.title': 'Campaigns — study plans',
  'campaigns.hero.note': 'The whole week, day by day, and the special mission.',
  'shell.locale.label': 'Language',
  'shell.locale.ptBR': 'PT, Português (Brasil)',
  'shell.locale.en': 'EN, English',
  'shell.locale.saveFailed':
    "Couldn't save {language} as your language. The connection to the server failed. Try again.",
  'ui.dialog.cancel': 'Cancel',
  'ui.language.short.ptBR': 'PT',
  'ui.language.short.en': 'EN',
  'ui.loading': 'Loading…',
  'ui.sound.voice': "Kairya's voice",
  'ui.sound.sfx': 'Sound effects',

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

  'missions.rescheduleFailure.deadlinePassed.message':
    "Couldn't reschedule. The new deadline is in the past.",
  'missions.rescheduleFailure.deadlinePassed.recovery': 'Pick a future date and time.',
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

  'tutoring.name': 'Kairya',
  'tutoring.panel.subtitle': 'your tutor',
  'tutoring.panel.collapse': "Collapse Kairya's panel",
  'tutoring.panel.expand': "Open Kairya's panel",
  'tutoring.panel.openSheet': 'Talk to Kairya',
  'tutoring.panel.closeSheet': 'Close the conversation',

  'tutoring.conversation.region': 'Conversation with Kairya',
  'tutoring.conversation.greeting':
    'This is where you talk with Kairya, your tutor. Ask for a study mission or bring a question.',
  'tutoring.history.loading': 'Loading the conversation…',
  'tutoring.history.loadFailed':
    "Couldn't load your conversation with Kairya. The request failed. Use the button to try again.",
  'tutoring.status.loadFailed':
    "Couldn't check whether Kairya is available. The request failed. Use the button to try again.",
  'tutoring.retryLoad': 'Try again',
  'tutoring.retry': 'Try again',
  'tutoring.writing': 'Kairya is writing…',
  'tutoring.message.author.user': 'You',
  'tutoring.message.mark.generating': 'Answer in progress',
  'tutoring.message.mark.interrupted': 'Answer interrupted',
  'tutoring.message.mark.failed': 'Answer failed',
  'tutoring.message.fallback':
    "Answered by a substitute model ({model}) because the main model couldn't answer this question.",
  'tutoring.input.label': 'Your message to Kairya',
  'tutoring.send.idle': 'Send',
  'tutoring.send.busy': 'Sending…',
  'tutoring.counter.remaining.zero': '0 characters left.',
  'tutoring.counter.remaining.one': '1 character left.',
  'tutoring.counter.remaining.other': '{count} characters left.',
  'tutoring.counter.over.one': '1 character over the {max} limit.',
  'tutoring.counter.over.other': '{count} characters over the {max} limit.',

  'tutoring.answer.announce.complete': 'Kairya finished answering.',
  'tutoring.answer.announce.cut':
    "Kairya's answer ran too long and was cut off. Try asking in parts.",
  'tutoring.answer.announce.incomplete': "Kairya's answer arrived incomplete.",
  'tutoring.answer.note.long':
    "Kairya's last answer was cut off for being too long. Ask in parts; retrying may cut again.",
  'tutoring.answer.note.refused':
    "Kairya couldn't answer your last question. Retrying will likely give the same result. Ask a different way.",
  'tutoring.answer.note.general':
    "Your last question has no complete answer. The result is unknown. Retrying is safe: your question won't repeat.",

  'tutoring.decision.confirm': 'Confirm',
  'tutoring.decision.confirming': 'Confirming…',
  'tutoring.decision.reject': 'Decline',
  'tutoring.decision.rejecting': 'Declining…',
  'tutoring.decision.refresh': 'Refresh the conversation',

  'tutoring.proposal.title': 'Mission proposal',
  'tutoring.proposal.target': 'the proposal: {instructions}',
  'tutoring.proposal.criterion': 'Completion criterion:',
  'tutoring.proposal.difficulty': 'Difficulty',
  'tutoring.proposal.difficultyValue': '{value} of {max}',
  'tutoring.proposal.estimate': 'Estimate',
  'tutoring.proposal.minutes': '{minutes} min',
  'tutoring.proposal.deadline': 'Deadline',
  'tutoring.proposal.created': 'Mission created',
  'tutoring.proposal.rejected': 'Proposal declined',
  'tutoring.proposal.boardLink': 'See it at Headquarters',
  'tutoring.proposal.unknown': "This version can't display this proposal.",

  'tutoring.reschedule.title': 'Rescheduling proposal',
  'tutoring.reschedule.target': 'the rescheduling: {instructions}',
  'tutoring.reschedule.previousDeadline': 'Current deadline',
  'tutoring.reschedule.newDeadline': 'Proposed deadline',
  'tutoring.reschedule.reason': 'Reason:',
  'tutoring.reschedule.done': 'Deadline rescheduled',
  'missions.action.retry': 'Try again',
  'missions.action.retryLoad': 'Try again',
  'missions.reload.board': 'Refresh the board',
  'missions.reload.today': "Refresh today's mission",
  'missions.reload.lateDaily': "Refresh yesterday's daily",
  'missions.reload.special': 'Refresh the special mission',
  'missions.reload.waiting': 'Waiting for the current request…',

  'missions.card.whichMission': '(mission: {instructions})',
  'missions.card.completionCriterion': 'Completion criterion:',
  'missions.card.deadline': 'Deadline',
  'missions.card.difficulty': 'Difficulty',
  'missions.card.difficultyValue': '{difficulty} of {max}',
  'missions.card.estimate': 'Estimate',
  'missions.card.minutes': '{minutes} min',
  'missions.card.reward': 'Reward',
  'missions.card.xp': '{xp} XP',
  'missions.card.actualDuration': 'Actual time',
  'missions.card.startedAt': 'Started on',
  'missions.card.complete': 'Complete',
  'missions.card.completing': 'Completing…',
  'missions.card.completingStatus': 'Completing the mission…',
  'missions.card.completedStatus': 'Mission completed.',
  'missions.card.blocked.fixLink': 'Fix the evidence link to complete. {reason}',
  'missions.card.blocked.textMissing': 'Describe what you did to complete with the link.',
  'missions.card.blocked.textTooLong':
    'Shorten the evidence text to complete: the limit is {max} characters.',
  'missions.card.start': 'Start',
  'missions.card.starting': 'Starting…',
  'missions.card.startingStatus': 'Starting the mission…',
  'missions.card.startedStatus': 'Mission started.',
  'missions.card.reschedulingStatus': 'Saving the new deadline…',
  'missions.card.rescheduledStatus': 'Deadline rescheduled.',

  'missions.evidence.toggle': 'Submit with evidence (optional)',
  'missions.evidence.retryNotice':
    'Your previous submission may have arrived. Try again before editing the evidence.',
  'missions.evidence.textLabel': 'What you did',
  'missions.evidence.textMissing': 'To submit the link, also describe what you did.',
  'missions.evidence.linkLabel': 'Link (optional)',
  'missions.evidence.linkError.format':
    "The link can't be used. It must start with http:// or https:// and have no spaces.",
  'missions.evidence.linkError.tooLong':
    "The link can't be used. It's longer than {max} characters.",
  'missions.evidence.counter.remaining.zero': 'No characters left.',
  'missions.evidence.counter.remaining.one': '1 character left.',
  'missions.evidence.counter.remaining.other': '{count} characters left.',
  'missions.evidence.counter.over.one': '1 character over the {max} limit.',
  'missions.evidence.counter.over.other': '{count} characters over the {max} limit.',

  'missions.reward.xp': '+{xp} XP',
  'missions.reward.bonusXp': '+{xp} bonus XP',
  'missions.reward.levelUp': 'You reached level {level}!',
  'missions.reward.achievement': 'Achievement: {title}',

  'missions.history.count.one': 'Rescheduled once',
  'missions.history.count.other': 'Rescheduled {count} times',
  'missions.history.title': 'Deadline history',
  'missions.history.origin.user': 'by you',
  'missions.history.origin.kairya': 'proposed by Kairya',

  'missions.reschedule.toggle': 'Reschedule deadline',
  'missions.reschedule.deadlineLabel': 'New deadline (Brasília time)',
  'missions.reschedule.reasonLegend': 'Why reschedule?',
  'missions.reschedule.submit': 'Save new deadline',
  'missions.reschedule.retryNotice':
    'Your previous request may have arrived. Without changes, “Try again” resends it safely.',
  'missions.reschedule.blocked.missingDeadline': 'Enter the date and time of the new deadline.',
  'missions.reschedule.blocked.nonexistentTime':
    "That time doesn't exist in Brasília time. Pick another.",
  'missions.reschedule.blocked.missingReason': 'Pick a reason to save the new deadline.',

  'missions.evaluation.modelLabel':
    "Kairya's evaluation — the model's interpretation, not an automatic check",
  'missions.evaluation.verification.selfDeclared': 'Self-declared',
  'missions.evaluation.verification.withEvidence': 'With evidence',
  'missions.evaluation.verdict.meets': 'Criterion met',
  'missions.evaluation.verdict.partial': 'Partly met',
  'missions.evaluation.verdict.notMet': 'Criterion not met',
  'missions.evaluation.requesting': 'Kairya is evaluating…',
  'missions.evaluation.concluded': 'Evaluation complete: {verdict}.',
  'missions.evaluation.link': 'Link:',
  'missions.evaluation.opensInNewTab': '(opens in a new tab)',
  'missions.evaluation.bonusCredited': 'Bonus XP added to your balance.',
  'missions.evaluation.inProgress': 'Evaluation in progress',
  'missions.evaluation.request': 'Ask Kairya for an evaluation',

  'missions.list.title': 'Other missions — tasks with a deadline',
  'missions.list.loading': 'Summoning your missions…',
  'missions.list.empty':
    'No missions on the board yet. Ask Kairya for a new campaign to get started.',
  'missions.list.loadFailed': "Couldn't load your missions.",
  'missions.list.unexpectedFailure': 'Something unexpected went wrong while loading. Try again.',
  'missions.list.reloadWaiting': 'Waiting for the current request to refresh the board.',

  'missions.cycle.title': "Today's mission — your daily",
  'missions.cycle.loading': 'Checking your cycle…',
  'missions.cycle.loadFailed': "Couldn't load your cycle.",
  'missions.cycle.unexpectedFailure': 'Something unexpected went wrong while loading. Try again.',
  'missions.cycle.today': 'Today is {date}.',
  'missions.cycle.noPlan':
    "No plan this week: there's no daily for today. A day without a plan doesn't break your streak.",
  'missions.cycle.lateDaily.title': "Yesterday's daily — started in time",
  'missions.cycle.lateDaily.pending':
    'You started this daily on its day: you can still complete it by the end of today, and it counts toward your streak.',
  'missions.cycle.lateDaily.completed':
    'Completed late — you started it on its day, and it counted toward your streak.',
  'missions.cycle.lateSpecial.pending':
    'You started this mission within its window: you can still complete it by the end of today.',
  'missions.cycle.lateSpecial.completed':
    'Completed after its window closed — you started in time.',
  'missions.cycle.streak': 'Streak: {days}',
  'missions.cycle.streakDays.one': '1 day in a row',
  'missions.cycle.streakDays.other': '{count} days in a row',
  'missions.cycle.progress': 'Special mission: {progress} of {total} — {remaining}.',
  'missions.cycle.remainingDays.one': '1 day left',
  'missions.cycle.remainingDays.other': '{count} days left',
  'missions.cycle.special.title': 'Special mission — streak bonus',
  'missions.cycle.refreshFailed': "Couldn't update your streak. It may be out of date.",
  'missions.cycle.refresh': 'Refresh',

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
  'tutoring.actionFailure.unconfirmedCreate.message':
    "Couldn't confirm the mission. The server's answer was lost.",
  'tutoring.actionFailure.unconfirmedCreate.recovery':
    "Retrying is safe: the mission won't be created twice.",
  'tutoring.actionFailure.unconfirmedReschedule.message':
    "Couldn't confirm the new deadline. The server's answer was lost.",
  'tutoring.actionFailure.unconfirmedReschedule.recovery':
    "Retrying is safe: the deadline won't change twice.",
  'tutoring.actionFailure.unconfirmedReject.message':
    "Couldn't decline the proposal. The server's answer was lost.",
  'tutoring.actionFailure.unconfirmedReject.recovery': 'Retrying is safe: nothing changes twice.',
  'tutoring.actionFailure.failed.message':
    "This proposal couldn't be carried out. Something changed since it was made.",
} as const satisfies Messages
