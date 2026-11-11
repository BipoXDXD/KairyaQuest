import { useT } from '../../shared/i18n/useT'
import type { Reward } from '../../shared/types/reward'
import { LanternMark } from './LanternMark'

/**
 * O anuncio da recompensa no cartao concluido (D16). Mora DENTRO da regiao
 * viva do cartao (decisao P4): uma regiao nova, nascida ja com texto, nao e
 * anunciada por todo leitor de tela. A entrada so anima sob `motion-safe:`
 * (README s7: movimento reduzido).
 *
 * `bonus` e o anuncio do bonus da avaliacao da Kairya (incremento E): o mesmo
 * desenho, com "de bonus" junto do XP para nao parecer uma segunda conclusao.
 *
 * `lit` acende a lanterna ao lado do anuncio: o cartao pede para a diaria, a
 * missao que alimenta a sequencia. A lanterna e decorativa; o texto continua
 * sendo o anuncio.
 */
export function RewardAnnouncement({
  reward,
  bonus = false,
  lit = false,
}: {
  reward: Reward
  bonus?: boolean
  lit?: boolean
}) {
  const t = useT()
  return (
    <div
      data-testid="reward"
      className="mt-2 flex items-start gap-2 text-sm text-feedback-success motion-safe:animate-reward-in"
    >
      {lit && <LanternMark lit data-testid="reward-lantern" />}
      <div className="min-w-0">
        <p data-testid="reward-xp" className="font-bold">
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
                {t('missions.reward.achievement', { title: a.title })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
