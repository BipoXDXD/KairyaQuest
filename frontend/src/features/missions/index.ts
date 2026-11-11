// Superfície pública da feature: as outras áreas importam só daqui.
export { CycleSection, type CycleSectionHandle } from './CycleSection'
export { MissionList, type MissionListHandle } from './MissionList'
export type { Cycle } from './types'
// Tabelas e descritores de falha: o teste de comprimento dos textos de erro
// (`shared/i18n`) audita as mensagens de todas as features de uma vez.
export { COMPLETION_FAILURE_BY_CODE, describeCompletionFailure } from './completionFailure'
export { EVALUATION_FAILURE_BY_CODE, describeEvaluationFailure } from './evaluationFailure'
export { RESCHEDULE_FAILURE_BY_CODE, describeRescheduleFailure } from './rescheduleFailure'
export { START_FAILURE_BY_CODE, describeStartFailure } from './startFailure'
