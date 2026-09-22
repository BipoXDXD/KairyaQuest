/**
 * O contrato da tutoria como a API o publica (`tutoring/schemas.py`).
 *
 * Chaves em `snake_case` e em ingles porque sao payload -- contrato que
 * atravessa a rede --, como em `features/missions/types.ts`. Os VALORES de
 * `status` e `state` estao em portugues porque o backend os grava assim; sao
 * dado, e nunca vao crus para a tela.
 *
 * Esta feature nao importa nada de `features/missions/` (`docs/ARCHITECTURE.md`
 * §5, regra 1): a missao criada pela confirmacao e descrita aqui so pelo que o
 * cartao mostra.
 */

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

export interface ActionRead {
  id: number
  kind: 'create_mission'
  state: ActionState
  payload: MissionProposal
  mission_id: number | null
  error_code: string | null
}

export interface MessageRead {
  id: number
  role: MessageRole
  content: string
  status: MessageStatus
  client_message_id: string | null
  reply_to_id: number | null
  error_code: string | null
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
export type StreamErrorCode = 'provedor_indisponivel' | 'tempo_esgotado' | 'proposta_invalida'

/**
 * Os `code` de confirmar e recusar uma proposta (spec, "Confirmar e recusar").
 * Espelham o `CodigoDeErro`, a mao (pendencia 32).
 */
export type ActionErrorCode =
  'operacao_reutilizada' | 'transicao_ilegal' | 'prazo_expirado' | 'acao_nao_encontrada'
