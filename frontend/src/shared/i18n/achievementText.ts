import type { UnlockedAchievement } from '../types/reward'
import type { Translate } from './useT'

/**
 * Os codes que o catalogo traduz. `kairya_partnership` e o nome novo da
 * conquista de parceria; o valor legado da conquista de parceria, anterior a
 * migracao 2.1, cai no texto do back.
 */
const KNOWN_CODES = [
  'first_steps',
  'streak_7',
  'streak_30',
  'veteran_10',
  'veteran_50',
  'veteran_100',
  'kairya_partnership',
  // As tres derivadas na leitura pelo back (F5): nunca gravadas, mas com
  // texto proprio aqui como as demais.
  'first_pass',
  'weekly_trial',
  'comeback',
] as const

type KnownCode = (typeof KNOWN_CODES)[number]

function isKnownCode(code: string): code is KnownCode {
  return (KNOWN_CODES as readonly string[]).includes(code)
}

/**
 * O titulo e a descricao da conquista no idioma corrente.
 *
 * Mora em `shared/i18n/` porque o anuncio da recompensa (`missions`) e o
 * painel (`progression`) a usam. O code que o catalogo nao conhece (o back
 * mais novo que o front) mostra o `title` e a `description` do back, em vez
 * de uma chave crua (tolerant reader).
 */
export function achievementText(
  achievement: UnlockedAchievement,
  t: Translate,
): { title: string; description: string } {
  const { code } = achievement
  if (!isKnownCode(code)) {
    return { title: achievement.title, description: achievement.description }
  }
  return {
    title: t(`progression.achievement.${code}.title`),
    description: t(`progression.achievement.${code}.description`),
  }
}
