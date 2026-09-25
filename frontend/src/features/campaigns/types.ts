import type { Availability, Mission } from '../../shared/types/mission'

/**
 * O contrato da trilha como `GET /api/plans/current` o publica (`PlanRead`,
 * `DayRead`, `SpecialRead` e `CurrentPlanRead`, em
 * src/focusquest/modules/missions/cycle_schemas.py). Chaves em ingles porque
 * sao payload.
 *
 * `mission` e `null` exatamente no que ainda nao foi revelado (B3 e C11 da
 * spec do ciclo): o dia futuro e a especial bloqueada vem sem `id` e sem
 * conteudo -- o bau fechado. A tela decide o bau pelo `mission === null`, e
 * nao pela `availability`, porque e a AUSENCIA do conteudo que ela desenha.
 */
export interface PlanDay {
  /** Data CIVIL ("2026-09-24"), sem fuso: formatada por `shared/lib/civilDate`. */
  day: string
  availability: Availability
  mission: Mission | null
}

export interface PlanSpecial {
  availability: Availability
  /** A sequencia atual modulo 7: o "N de 7" do proximo marco. */
  progress: number
  mission: Mission | null
}

export interface Plan {
  /** A segunda-feira da semana, data CIVIL. */
  week_start: string
  /** Os sete dias, de segunda a domingo, na ordem da API. */
  days: PlanDay[]
  special: PlanSpecial
}

/** "Sem plano" e estado, nao erro: `{"plan": null}` com 200. */
export interface CurrentPlan {
  plan: Plan | null
}
