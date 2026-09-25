import type { Mission } from '../../shared/types/mission'

/**
 * O contrato de missao como a API o publica.
 *
 * Os nomes dos campos estao em `snake_case` e em ingles porque sao as chaves do
 * payload -- contrato que atravessa a rede -- e renomea-los aqui criaria uma
 * traducao a mais para manter sincronizada com o backend. Os identificadores
 * que ESTE codigo inventa (tipos, funcoes, componentes) seguem em ingles, e o
 * texto que a pessoa le, em portugues do Brasil.
 *
 * `Mission`, `MissionState`, `MissionType`, `Availability`,
 * `MISSION_STATE_LABELS` e `DAYS_PER_MILESTONE` moraram aqui e, desde o
 * Incremento C, moram SO em `shared/types/mission.ts` (segundo usuario real:
 * a trilha de `features/campaigns/`, que recebe o MESMO `MissionRead`). Este
 * arquivo NAO os reexporta -- quem precisar deles importa de la direto.
 */

/** O dia do ciclo, como `GET /api/cycle` o publica. */
export interface Cycle {
  /** Data CIVIL ("2026-09-25"), sem fuso: mostrada por `formatCivilDate`. */
  today: string
  mission: Mission | null
  streak: number
  days_to_milestone: number
  special: Mission | null
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
export type MissionErrorCode =
  'missao_nao_encontrada' | 'transicao_ilegal' | 'operacao_reutilizada' | 'missao_expirada'
