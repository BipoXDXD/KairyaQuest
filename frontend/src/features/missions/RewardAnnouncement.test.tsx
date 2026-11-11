import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Reward } from '../../shared/types/reward'
import { RewardAnnouncement } from './RewardAnnouncement'

const reward = (ajustes: Partial<Reward> = {}): Reward => ({
  xp_awarded: 220,
  xp_total: 1340,
  level_before: 4,
  level_after: 4,
  achievements_unlocked: [],
  ...ajustes,
})

describe('RewardAnnouncement', () => {
  it('mostra o XP ganho', () => {
    render(<RewardAnnouncement reward={reward({ xp_awarded: 220 })} />)

    expect(screen.getByTestId('reward-xp')).toHaveTextContent('+220 XP')
  })

  it('o bonus da avaliacao diz "de bônus" junto do XP; a conclusao, nao', () => {
    const { rerender } = render(<RewardAnnouncement reward={reward({ xp_awarded: 110 })} bonus />)

    expect(screen.getByTestId('reward-xp')).toHaveTextContent(/^\+110 XP de bônus$/)

    rerender(<RewardAnnouncement reward={reward({ xp_awarded: 110 })} />)

    expect(screen.getByTestId('reward-xp')).toHaveTextContent(/^\+110 XP$/)
  })

  it('anuncia a subida de nivel so quando o nivel muda', () => {
    const { rerender } = render(
      <RewardAnnouncement reward={reward({ level_before: 4, level_after: 5 })} />,
    )

    expect(screen.getByTestId('reward-level-up')).toHaveTextContent('Subiu para o nível 5!')

    rerender(<RewardAnnouncement reward={reward({ level_before: 4, level_after: 4 })} />)

    expect(screen.queryByTestId('reward-level-up')).not.toBeInTheDocument()
  })

  it('lista as conquistas destravadas pelo titulo', () => {
    render(
      <RewardAnnouncement
        reward={reward({
          achievements_unlocked: [
            { code: 'veteran_10', title: 'Veterano I', description: '10 missões concluídas.' },
            {
              code: 'kairya_partnership',
              title: 'Parceria com a Kairya',
              description: 'Primeira conversa com a Kairya.',
            },
          ],
        })}
      />,
    )

    const itens = screen.getAllByTestId('reward-achievement')
    expect(itens).toHaveLength(2)
    expect(itens[0]).toHaveTextContent('Conquista: Veterano I')
    expect(itens[1]).toHaveTextContent('Conquista: Parceria com a Kairya')
  })

  it('sem conquistas, nenhum item aparece', () => {
    render(<RewardAnnouncement reward={reward({ achievements_unlocked: [] })} />)

    expect(screen.queryByTestId('reward-achievement')).not.toBeInTheDocument()
  })

  it('a animacao so existe sob motion-safe', () => {
    render(<RewardAnnouncement reward={reward()} />)

    const raiz = screen.getByTestId('reward')
    const classes = raiz.className.split(/\s+/)
    // A classe de animacao tem de comecar com o prefixo `motion-safe:`: sem
    // ele, quem pede movimento reduzido (README §7) veria a entrada animar
    // mesmo assim.
    expect(classes.some((classe) => classe.startsWith('motion-safe:'))).toBe(true)
    // E NENHUMA classe `animate-` pode existir sem o prefixo -- e a guarda que
    // pegaria uma classe de animacao solta, fora do `motion-safe:`.
    expect(classes.some((classe) => /^animate-/.test(classe))).toBe(false)
  })
})
