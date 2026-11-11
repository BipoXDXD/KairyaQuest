import { achievementText } from '../../shared/i18n/achievementText'
import type { Translate } from '../../shared/i18n/useT'
import type { CaptionDetail } from './events'

/**
 * As linhas da legenda: o que a voz não diz (nível e conquistas) fica só aqui.
 * Reaproveita as chaves do anúncio da recompensa em vez de duplicá-las.
 */
export function captionLines(detail: CaptionDetail | null, t: Translate): string[] {
  if (detail === null) return []
  if (detail.kind === 'level') return [t('missions.reward.levelUp', { level: detail.level })]
  return detail.items.map((item) =>
    t('missions.reward.achievement', { title: achievementText(item, t).title }),
  )
}
