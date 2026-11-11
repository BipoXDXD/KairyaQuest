import type { Translate } from '../../shared/i18n/useT'

/** Os codes de faixa que o catalogo traduz (contrato: `rank_*`, em ingles). */
const KNOWN_RANKS = ['rank_seed', 'rank_sprout', 'rank_blade', 'rank_flame', 'rank_star'] as const

type KnownRank = (typeof KNOWN_RANKS)[number]

function isKnownRank(rank: string): rank is KnownRank {
  return (KNOWN_RANKS as readonly string[]).includes(rank)
}

/**
 * O nome da faixa no idioma corrente, ou `null` quando nao ha o que mostrar:
 * `rank` ausente (back mais antigo que o front) ou de code desconhecido (back
 * mais novo). Nunca devolve o code cru (tolerant reader).
 */
export function rankName(rank: string | undefined, t: Translate): string | null {
  if (rank === undefined || !isKnownRank(rank)) {
    return null
  }
  return t(`progression.rank.${rank}`)
}
