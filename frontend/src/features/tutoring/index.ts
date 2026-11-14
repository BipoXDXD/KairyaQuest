// Superfície pública da feature: as outras áreas importam só daqui.
export { TutorPanel } from './TutorPanel'
export type { ActionRead, MessageRead } from './types'
// A galeria de estados (`src/test/gallery`) passa o cartão por axe e pelos
// alvos de 44px em cada estado; como o resto de `src`, ela só enxerga o index.
export { RescheduleProposalCard } from './RescheduleProposalCard'
export { useActionKeys } from './useActionKeys'
export type { ActionState, RescheduleMissionAction } from './types'
// Tabelas e descritores de falha: o teste de comprimento dos textos de erro
// (`shared/i18n`) audita as mensagens de todas as features de uma vez.
export { ACTION_FAILURE_BY_CODE, describeActionFailure, failedActionText } from './actionFailure'
export {
  PRE_STREAM_FAILURE_BY_CODE,
  STREAM_FAILURE_BY_CODE,
  UNKNOWN_RESULT,
  describePreStreamFailure,
  describeStreamFailure,
} from './messageFailure'
