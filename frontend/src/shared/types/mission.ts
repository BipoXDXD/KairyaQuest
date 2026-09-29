/**
 * O contrato de missao (`MissionRead`, src/focusquest/modules/missions/schemas.py)
 * como a API o publica.
 *
 * Mora em `shared/types/` desde o Incremento C (`docs/ARCHITECTURE.md` §5,
 * regra 3): nasceu em `features/missions/types.ts` e passou a ter um segundo
 * usuario real, a trilha de `features/campaigns/`, que recebe o MESMO
 * `MissionRead` dentro de `GET /api/plans/current`. Duplicar a forma na trilha
 * (como a tutoria faz com a proposta, que e OUTRO contrato) deixaria dois
 * tipos da mesma resposta para manter em sincronia com o backend.
 *
 * `features/missions/types.ts` NAO reexporta estes nomes: quem precisar deles
 * importa daqui diretamente (R3 do controlador do Incremento C).
 *
 * Os nomes dos campos estao em `snake_case` e em ingles porque sao as chaves do
 * payload -- contrato que atravessa a rede.
 */

/**
 * Os estados possiveis, com os valores em portugues que o backend grava.
 *
 * Sao DADOS, nao texto de interface: nunca vao crus para a tela. Quem traduz e
 * `MISSION_STATE_LABELS`.
 */
export type MissionState = 'pendente' | 'em_andamento' | 'concluida'

/** O tipo da missao (spec do ciclo diario, C4). Dado, nao texto de interface. */
export type MissionType = 'avulsa' | 'diaria' | 'especial'

/**
 * A disponibilidade DERIVADA pela API (nunca gravada): o que ainda pode ser
 * feito, e nao o que foi feito (esse e `state`).
 */
export type Availability =
  'fora_do_plano' | 'bloqueada' | 'disponivel' | 'concluida' | 'perdida' | 'expirada'

/**
 * Dias de sequencia por missao especial. Espelha `DIAS_POR_MARCO`, em
 * src/focusquest/modules/missions/cycle_domain.py, a mao (pendencia 32).
 */
export const DAYS_PER_MILESTONE = 7

/**
 * A dificuldade maxima. Espelha `DIFICULDADE_MAXIMA`, em
 * src/focusquest/modules/missions/schemas.py, a mao. A trilha
 * (`features/campaigns/`) usa esta constante; o cartao de
 * `features/missions/MissionCard.tsx` e o de proposta da tutoria ainda
 * escrevem o "de 5" literal (nao mexidos por este incremento).
 */
export const MAX_DIFFICULTY = 5

/** Como a conclusao foi verificada: so declarada, ou entregue com evidencia. */
export type Verification = 'autodeclarada' | 'com_evidencia'

/** O veredito da Tifa sobre a evidencia (interpretacao do modelo, nao prova). */
export type Verdict = 'atende' | 'parcial' | 'nao_atende'

/** O estado do pedido de avaliacao: em curso, terminado ou falhado. */
export type EvaluationState = 'avaliando' | 'concluida' | 'falhou'

/** A evidencia entregue com a conclusao; `link` e opcional. */
export interface Evidence {
  text: string
  link: string | null
}

/** O resumo da avaliacao (`EvaluationSummaryRead`, no backend). Sem `bonus_xp` (EM1). */
export interface EvaluationSummary {
  state: EvaluationState
  verdict: Verdict | null
  feedback: string | null
  error_code: string | null
  model: string
  finished_at: string | null
}

export interface Mission {
  id: number
  instructions: string
  completion_criterion: string
  /**
   * De 1 a 5; o teto e imposto pela API. O 5 espelha `DIFICULDADE_MAXIMA`, em
   * src/focusquest/modules/missions/schemas.py, e nada amarra os dois: quem
   * mudar la tem de mudar aqui (`MAX_DIFFICULTY`) e no "de 5" literal de
   * `features/missions/MissionCard.tsx` e `features/tutoring/ProposalCard.tsx`
   * (pendencia do Incremento C em `docs/HANDOFF.md`).
   */
  difficulty: number
  estimated_minutes: number
  mission_type: MissionType
  /** Data civil da diaria; null fora dela. */
  day: string | null
  /** ISO 8601 SEMPRE com fuso -- a API recusa prazo sem fuso com 422. */
  deadline: string
  state: MissionState
  availability: Availability
  started_at: string | null
  completed_at: string | null
  /** Computado pela API a partir da dificuldade; nao armazenado. */
  xp: number
  /** Computado pela API; `null` enquanto faltar o inicio ou a conclusao. */
  actual_duration_minutes: number | null
  /** `null` enquanto a missao nao esta concluida. */
  verification: Verification | null
  evidence: Evidence | null
  evaluation: EvaluationSummary | null
}

/**
 * Rotulo em pt-BR de cada estado, com acentuacao de gente.
 *
 * O tipo `Record<MissionState, string>` e o que faz este mapa ser EXAUSTIVO: um
 * estado novo no backend entra no tipo `MissionState` e o `tsc` passa a exigir
 * o rotulo aqui. A alternativa -- um `Partial` com fallback, ou um `switch` com
 * `default` -- deixaria o estado novo aparecer na tela como `em_revisao`, e o
 * defeito so seria descoberto por quem o visse.
 */
export const MISSION_STATE_LABELS: Record<MissionState, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
}
