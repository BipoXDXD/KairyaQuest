import { describe, expect, it } from 'vitest'
import { en } from './messages/en'
import { ptBR } from './messages/pt-BR'

// Ética da gamificação: a cópia de faixa, conquista e lanterna nunca pune, nem
// cria urgência. O prefixo e o padrão de cada idioma mandam; ver o plano da F5.
const PREFIXES = ['progression.rank.', 'progression.achievement.', 'campaigns.lantern.']
const PUNITIVE_PT = /perd(e|er|eu|a|ida)|quebr|zer(a|ou|ado)|última chance|restam|contagem/i
const PUNITIVE_EN = /\b(lose|lost|loses|break|broke|broken)\b|last chance|expires? in/i

function textsOf(messages: Record<string, string>): [string, string][] {
  return Object.entries(messages).filter(([key]) => PREFIXES.some((p) => key.startsWith(p)))
}

describe('cópia da gamificação', () => {
  it('a regra de pt-BR acusa texto que pune', () => {
    expect(PUNITIVE_PT.test('Você vai perder a sequência')).toBe(true)
  })

  it('a regra de en acusa texto que pune', () => {
    expect(PUNITIVE_EN.test('You will lose your streak')).toBe(true)
  })

  it('há textos de gamificação para varrer', () => {
    expect(textsOf(ptBR).length).toBeGreaterThan(0)
    expect(textsOf(en).length).toBeGreaterThan(0)
  })

  it('nenhum texto em pt-BR pune ou pressiona', () => {
    for (const [key, text] of textsOf(ptBR)) {
      expect({ key, punitive: PUNITIVE_PT.test(text) }).toEqual({ key, punitive: false })
    }
  })

  it('nenhum texto em en pune ou pressiona', () => {
    for (const [key, text] of textsOf(en)) {
      expect({ key, punitive: PUNITIVE_EN.test(text) }).toEqual({ key, punitive: false })
    }
  })
})
