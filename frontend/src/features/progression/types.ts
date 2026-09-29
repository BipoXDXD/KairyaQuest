/**
 * O contrato de progresso como `GET /api/progress` o publica.
 *
 * Os nomes dos campos estao em `snake_case` e em ingles porque sao as chaves
 * do payload -- contrato que atravessa a rede --, o mesmo motivo de
 * `features/missions/types.ts`.
 */

/** Uma conquista do catalogo, destravada ou nao. */
export interface Achievement {
  code: string
  title: string
  description: string
  /** Instante ISO 8601 em que foi destravada, ou `null` se ainda bloqueada. */
  unlocked_at: string | null
}

/** O progresso da unica pessoa usuaria, como `GET /api/progress` o publica. */
export interface Progress {
  xp_total: number
  level: number
  level_floor_xp: number
  next_level_xp: number
  achievements: Achievement[]
}
