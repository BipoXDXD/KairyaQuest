/**
 * O contrato da tutoria como a API o publica (`tutoring/schemas.py`).
 *
 * Chaves em `snake_case` e em ingles porque sao payload -- contrato que
 * atravessa a rede --, como em `features/missions/types.ts`. Os VALORES de
 * `status` e `state` estao em portugues porque o backend os grava assim; sao
 * dado, e nunca vao crus para a tela.
 *
 * Esta feature nao importa nada de `features/missions/` (`docs/ARCHITECTURE.md`
 * §5, regra 1): a missao criada (ou reagendada) pela confirmacao e descrita
 * aqui so pelo que o cartao mostra.
 */

import type { RescheduleReason } from '../../shared/types/mission'
import type { ActionKeys } from './useActionKeys'

export type MessageRole = 'user' | 'tutor'

export type MessageStatus = 'gerando' | 'completa' | 'interrompida' | 'falhou'

export type ActionState = 'proposta' | 'executada' | 'recusada' | 'falhou'

/**
 * A entrada da ferramenta `create_mission`, JA validada pelo `MissionCreate`
 * antes de virar linha (spec do 1b, `tutor_actions.payload`). O `deadline` e
 * ISO 8601 com fuso.
 */
export interface MissionProposal {
  instructions: string
  completion_criterion: string
  difficulty: number
  estimated_minutes: number
  deadline: string
}

/**
 * A proposta de `reschedule_mission` (spec do F, "A ferramenta
 * `reschedule_mission` e a acao"). `mission_id`, `new_deadline` e `reason` sao
 * a entrada do modelo; `instructions` e `previous_deadline` sao o RETRATO que o
 * backend escreveu ao gravar a proposta (F16) -- o que a pessoa viu quando
 * decidiu. O cartao nao busca a missao: isso seria importar `missions`.
 */
export interface RescheduleProposal {
  mission_id: number
  new_deadline: string
  reason: RescheduleReason
  instructions: string
  previous_deadline: string
}

/** O que toda acao tem, qualquer que seja o `kind`. */
interface ActionBase {
  id: number
  state: ActionState
  /** A missao afetada, so depois de `executada`. */
  mission_id: number | null
  error_code: string | null
}

export interface CreateMissionAction extends ActionBase {
  kind: 'create_mission'
  payload: MissionProposal
}

export interface RescheduleMissionAction extends ActionBase {
  kind: 'reschedule_mission'
  payload: RescheduleProposal
}

/**
 * Uma acao proposta pela Kairya, discriminada pelo `kind`: o `payload` so tem
 * tipo depois de se saber o `kind`. Um `kind` novo reprova o `tsc` em quem
 * escolhe o cartao (`ProposalCard`).
 */
export type ActionRead = CreateMissionAction | RescheduleMissionAction

/**
 * O que todo cartao de proposta recebe do painel, qualquer que seja o `kind`.
 * Mora aqui, e nao no `ProposalCard`, para o cartao de cada `kind` nao
 * importar de volta o arquivo que o escolhe.
 */
export interface ProposalCardProps<A extends ActionRead = ActionRead> {
  action: A
  keys: ActionKeys
  onChanged: (action: ActionRead) => void
  /** "O quadro mudou" (F22): chamado depois de toda confirmacao bem-sucedida. */
  onMissionCreated: () => void
  onRefresh: () => void
  boardHref: string
  onGoToBoard?: () => void
}

export interface MessageRead {
  id: number
  role: MessageRole
  content: string
  status: MessageStatus
  client_message_id: string | null
  reply_to_id: number | null
  error_code: string | null
  /**
   * O modelo substituto que serviu a resposta depois de uma recusa (fallback
   * do servidor, pendencia 174); `null` quando foi o modelo pedido.
   */
  fallback_model: string | null
  created_at: string
  actions: ActionRead[]
}

/** O recorte da missao criada que o cartao usa. */
export interface CreatedMission {
  id: number
  instructions: string
}

export interface ConfirmRead {
  action: ActionRead
  mission: CreatedMission
}

export interface RejectRead {
  action: ActionRead
}

export interface StatusRead {
  available: boolean
}

/**
 * Os `code` que o `POST /api/tutoring/messages` devolve ANTES do stream, em
 * JSON comum (spec, "Erros antes do stream"). Espelham membros do
 * `CodigoDeErro` de `src/focusquest/main.py`, a mao -- nada amarra os dois
 * (pendencia 32 do HANDOFF). O 422 do Pydantic nao tem `code`.
 */
export type PreStreamErrorCode =
  'provedor_nao_configurado' | 'mensagem_em_andamento' | 'operacao_reutilizada'

/**
 * Os `code` do evento `error` DENTRO do stream. Espelham o `CodigoDoStream` de
 * `src/focusquest/modules/tutoring/domain.py`, a mao (pendencia 32). Nao estao
 * no `CodigoDeErro` porque nao passam por handler HTTP.
 */
export type StreamErrorCode =
  'provedor_indisponivel' | 'tempo_esgotado' | 'proposta_invalida' | 'resposta_recusada'

/**
 * Os `code` de confirmar e recusar uma proposta (spec, "Confirmar e recusar").
 * Espelham o `CodigoDeErro`, a mao (pendencia 32).
 */
export type ActionErrorCode =
  | 'operacao_reutilizada'
  | 'transicao_ilegal'
  | 'prazo_expirado'
  | 'acao_nao_encontrada'
  | 'reagendamento_invalido'
  | 'estimativa_fora_do_limite'
  | 'prazo_fora_do_limite'
