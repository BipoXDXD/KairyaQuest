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
