import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithI18n } from '../../test/i18n'
import type { Reward } from '../../shared/types/reward'
import { en } from '../../shared/i18n/messages/en'
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
    renderWithI18n(<RewardAnnouncement reward={reward({ xp_awarded: 220 })} />)

    expect(screen.getByTestId('reward-xp')).toHaveTextContent('+220 XP')
  })

  it('o bonus da avaliacao diz "de bônus" junto do XP; a conclusao, nao', () => {
    const { rerender } = renderWithI18n(
      <RewardAnnouncement reward={reward({ xp_awarded: 110 })} bonus />,
    )

    expect(screen.getByTestId('reward-xp')).toHaveTextContent(/^\+110 XP de bônus$/)

    rerender(<RewardAnnouncement reward={reward({ xp_awarded: 110 })} />)

    expect(screen.getByTestId('reward-xp')).toHaveTextContent(/^\+110 XP$/)
  })

  it('anuncia a subida de nivel so quando o nivel muda', () => {
    const { rerender } = renderWithI18n(
      <RewardAnnouncement reward={reward({ level_before: 4, level_after: 5 })} />,
    )

    expect(screen.getByTestId('reward-level-up')).toHaveTextContent('Subiu para o nível 5!')

    rerender(<RewardAnnouncement reward={reward({ level_before: 4, level_after: 4 })} />)

    expect(screen.queryByTestId('reward-level-up')).not.toBeInTheDocument()
  })

  it('com subida de nivel, mostra o turntable (placeholder ate o asset existir)', () => {
    renderWithI18n(<RewardAnnouncement reward={reward({ level_before: 4, level_after: 5 })} />)

    expect(screen.getByTestId('kairya-turntable-placeholder')).toBeInTheDocument()
  })

  it('sem subida de nivel, nao ha turntable', () => {
    renderWithI18n(<RewardAnnouncement reward={reward({ level_before: 4, level_after: 4 })} />)

    expect(screen.queryByTestId('kairya-turntable-placeholder')).not.toBeInTheDocument()
  })

  it('o bonus com subida de nivel mostra o turntable uma vez', () => {
    renderWithI18n(
      <RewardAnnouncement reward={reward({ level_before: 4, level_after: 5 })} bonus />,
    )

    expect(screen.getAllByTestId('kairya-turntable-placeholder')).toHaveLength(1)
  })

  it('lista as conquistas destravadas pelo titulo', () => {
    renderWithI18n(
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
    renderWithI18n(<RewardAnnouncement reward={reward({ achievements_unlocked: [] })} />)

    expect(screen.queryByTestId('reward-achievement')).not.toBeInTheDocument()
  })

  it('a animacao so existe sob motion-safe', () => {
    renderWithI18n(<RewardAnnouncement reward={reward()} />)

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

  it.each([
    ['pt-BR', 'Conquista: A volta'],
    ['en', 'Achievement: Comeback'],
  ] as const)('a conquista derivada comeback, em %s: o texto do catalogo', (locale, texto) => {
    renderWithI18n(
      <RewardAnnouncement
        reward={reward({
          achievements_unlocked: [{ code: 'comeback', title: 'x', description: 'y' }],
        })}
      />,
      { locale },
    )

    expect(screen.getByTestId('reward-achievement')).toHaveTextContent(texto)
  })

  it('em en, XP, bonus, nivel e conquista saem do catalogo ingles', () => {
    const { rerender } = renderWithI18n(
      <RewardAnnouncement
        reward={reward({
          xp_awarded: 110,
          level_before: 4,
          level_after: 5,
          achievements_unlocked: [{ code: 'veteran_10', title: 'Veterano I', description: 'x' }],
        })}
        bonus
      />,
      { locale: 'en' },
    )

    expect(screen.getByTestId('reward-xp')).toHaveTextContent(/^\+110 bonus XP$/)
    expect(screen.getByTestId('reward-level-up')).toHaveTextContent('You reached level 5!')
    expect(screen.getByTestId('reward-achievement')).toHaveTextContent('Achievement: Veteran I')

    rerender(<RewardAnnouncement reward={reward({ xp_awarded: 110 })} />)

    expect(screen.getByTestId('reward-xp')).toHaveTextContent(/^\+110 XP$/)
  })

  it('em en, a conquista conhecida sai do catalogo ingles, e nao do title PT do back', () => {
    renderWithI18n(
      <RewardAnnouncement
        reward={reward({
          achievements_unlocked: [
            {
              code: 'streak_7',
              title: 'Uma semana inteira',
              description: 'Complete a diária 7 dias seguidos.',
            },
          ],
        })}
      />,
      { locale: 'en' },
    )

    const item = screen.getByTestId('reward-achievement')
    expect(item).toHaveTextContent(`Achievement: ${en['progression.achievement.streak_7.title']}`)
    expect(item).not.toHaveTextContent('Uma semana inteira')
  })

  it('em en, a conquista com code desconhecido mostra o title do back', () => {
    renderWithI18n(
      <RewardAnnouncement
        reward={reward({
          achievements_unlocked: [{ code: 'conquista_nova', title: 'Nova', description: 'Desc' }],
        })}
      />,
      { locale: 'en' },
    )

    expect(screen.getByTestId('reward-achievement')).toHaveTextContent(/^Achievement: Nova$/)
  })
})
