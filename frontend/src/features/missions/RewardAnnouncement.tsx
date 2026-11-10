import { achievementText } from '../../shared/i18n/achievementText'
import { useT } from '../../shared/i18n/useT'
import type { Reward } from '../../shared/types/reward'

/**
 * O anuncio da recompensa no cartao concluido (D16). Mora DENTRO da regiao
 * viva do cartao (decisao P4): uma regiao nova, nascida ja com texto, nao e
 * anunciada por todo leitor de tela. A entrada so anima sob `motion-safe:`
 * (README s7: movimento reduzido).
 *
 * `bonus` e o anuncio do bonus da avaliacao da Kairya (incremento E): o mesmo
 * desenho, com "de bonus" junto do XP para nao parecer uma segunda conclusao.
 *
 * O titulo da conquista sai do catalogo pelo `code` (`achievementText`); um
 * `code` que o catalogo nao conhece mostra o `title` do back.
 */
export function RewardAnnouncement({ reward, bonus = false }: { reward: Reward; bonus?: boolean }) {
  const t = useT()
  return (
    <div
      data-testid="reward"
      className="mt-2 text-sm text-emerald-200 motion-safe:animate-[reward-in_400ms_ease-out]"
    >
      <p data-testid="reward-xp" className="font-semibold">
        {t(bonus ? 'missions.reward.bonusXp' : 'missions.reward.xp', { xp: reward.xp_awarded })}
      </p>
      {reward.level_after > reward.level_before && (
        <p data-testid="reward-level-up">
          {t('missions.reward.levelUp', { level: reward.level_after })}
        </p>
      )}
      {reward.achievements_unlocked.length > 0 && (
        <ul role="list">
          {reward.achievements_unlocked.map((a) => (
            <li key={a.code} data-testid="reward-achievement">
              {t('missions.reward.achievement', { title: achievementText(a, t).title })}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
