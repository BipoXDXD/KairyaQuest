/**
 * O contrato de missao como a API o publica.
 *
 * Os nomes dos campos estao em `snake_case` e em ingles porque sao as chaves do
 * payload -- contrato que atravessa a rede -- e renomea-los aqui criaria uma
 * traducao a mais para manter sincronizada com o backend. Os identificadores
 * que ESTE codigo inventa (tipos, funcoes, componentes) seguem em ingles, e o
 * texto que a pessoa le, em portugues do Brasil.
 */

/**
 * Os estados possiveis, com os valores em portugues que o backend grava.
 *
 * Sao DADOS, nao texto de interface: nunca vao crus para a tela. Quem traduz e
 * `MISSION_STATE_LABELS`.
 */
export type MissionState = 'pendente' | 'em_andamento' | 'concluida'

export interface Mission {
  id: number
  instructions: string
  completion_criterion: string
  /**
   * De 1 a 5; o teto e imposto pela API. O 5 espelha `DIFICULDADE_MAXIMA`, em
   * src/focusquest/modules/missions/schemas.py, e nada amarra os dois: quem
   * mudar la tem de mudar aqui e no "de 5" de `MissionList.tsx`.
   */
  difficulty: number
  estimated_minutes: number
  /** ISO 8601 SEMPRE com fuso -- a API recusa prazo sem fuso com 422. */
  deadline: string
  state: MissionState
  started_at: string | null
  completed_at: string | null
  /** Computado pela API a partir da dificuldade; nao armazenado. */
  xp: number
  /** Computado pela API; `null` enquanto faltar o inicio ou a conclusao. */
  actual_duration_minutes: number | null
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

/**
 * Os `code` de erro que as rotas de missao devolvem (spec do ciclo diario,
 * decisao C12). Espelha `CodigoDeErro`, em src/focusquest/main.py, e nada amarra
 * os dois automaticamente: um code novo no backend entra aqui a mao, e entao o
 * `tsc` exige a traducao dele em `completionFailure.ts`.
 *
 * Sao DADOS, nao texto de interface: a tela nunca mostra o code, e nunca mostra
 * o `detail` que vem junto.
 */
export type MissionErrorCode = 'missao_nao_encontrada' | 'transicao_ilegal' | 'operacao_reutilizada'
