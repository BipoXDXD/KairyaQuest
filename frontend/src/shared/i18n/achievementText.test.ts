import { describe, expect, it } from 'vitest'
import { achievementText } from './achievementText'
import { translate, type MessageKey, type MessageVars } from './catalog'
import type { Locale } from './locale'

const tFor = (locale: Locale) => (key: MessageKey, vars?: MessageVars) =>
  translate(locale, key, vars)

describe('achievementText', () => {
  it('code conhecido, em en: os textos EN do catalogo, e nao os do back', () => {
    const text = achievementText(
      { code: 'streak_7', title: 'Uma semana inteira', description: 'Desc do back' },
      tFor('en'),
    )

    expect(text).toEqual({
      title: 'A Whole Week',
      description: 'Complete your daily 7 days in a row.',
    })
  })

  it('code conhecido, em pt-BR: os textos PT do catalogo', () => {
    const text = achievementText(
      { code: 'veteran_10', title: 'Outro titulo', description: 'Outra desc' },
      tFor('pt-BR'),
    )

    expect(text).toEqual({ title: 'Veterano I', description: 'Conclua 10 missões.' })
  })

  it('a parceria com a Kairya tem texto proprio nos dois idiomas', () => {
    const achievement = { code: 'kairya_partnership', title: 'x', description: 'y' }

    expect(achievementText(achievement, tFor('en'))).toEqual({
      title: 'Partnership with Kairya',
      description: 'Complete a mission Kairya proposed.',
    })
    expect(achievementText(achievement, tFor('pt-BR'))).toEqual({
      title: 'Parceria com a Kairya',
      description: 'Conclua uma missão proposta pela Kairya.',
    })
  })

  it.each<[string, Locale, { title: string; description: string }]>([
    [
      'first_pass',
      'pt-BR',
      {
        title: 'Primeira aprovação',
        description: 'Receba da Kairya uma avaliação “atende” numa entrega.',
      },
    ],
    [
      'first_pass',
      'en',
      { title: 'First Pass', description: 'Get a “meets” evaluation from Kairya on a delivery.' },
    ],
    [
      'weekly_trial',
      'pt-BR',
      { title: 'Prova da semana vencida', description: 'Conclua a sua primeira missão especial.' },
    ],
    [
      'weekly_trial',
      'en',
      { title: 'Weekly Trial Cleared', description: 'Complete your first special mission.' },
    ],
    [
      'comeback',
      'pt-BR',
      {
        title: 'A volta',
        description: 'Conclua uma diária depois de 3 dias ou mais sem nenhuma concluída.',
      },
    ],
    [
      'comeback',
      'en',
      {
        title: 'Comeback',
        description: 'Complete a daily after 3 or more days without completing one.',
      },
    ],
  ])('a conquista derivada %s, em %s: o texto do catalogo', (code, locale, esperado) => {
    expect(achievementText({ code, title: 'x', description: 'y' }, tFor(locale))).toEqual(esperado)
  })

  it.each<Locale>(['pt-BR', 'en'])(
    'code desconhecido, em %s: o title e a description do back',
    (locale) => {
      expect(
        achievementText(
          { code: 'conquista_nova', title: 'Nova', description: 'Desc' },
          tFor(locale),
        ),
      ).toEqual({ title: 'Nova', description: 'Desc' })
    },
  )

  it('nome herdado de Object nao e tratado como code conhecido', () => {
    expect(achievementText({ code: 'toString', title: 'T', description: 'D' }, tFor('en'))).toEqual(
      { title: 'T', description: 'D' },
    )
  })
})
