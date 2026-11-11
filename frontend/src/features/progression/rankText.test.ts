import { describe, expect, it } from 'vitest'
import { translate, type MessageKey, type MessageVars } from '../../shared/i18n/catalog'
import type { Locale } from '../../shared/i18n/locale'
import { rankName } from './rankText'

const tFor = (locale: Locale) => (key: MessageKey, vars?: MessageVars) =>
  translate(locale, key, vars)

describe('rankName', () => {
  it.each([
    ['rank_seed', 'Semente', 'Seed'],
    ['rank_sprout', 'Broto', 'Sprout'],
    ['rank_blade', 'Lâmina', 'Blade'],
    ['rank_flame', 'Chama', 'Flame'],
    ['rank_star', 'Estrela', 'Star'],
  ])('%s vira o nome da faixa nos dois idiomas', (rank, ptBR, en) => {
    expect(rankName(rank, tFor('pt-BR'))).toBe(ptBR)
    expect(rankName(rank, tFor('en'))).toBe(en)
  })

  it('código desconhecido (back mais novo que o front) não aparece cru', () => {
    expect(rankName('rank_novo', tFor('pt-BR'))).toBeNull()
  })

  it('rank ausente (back antigo) não mostra nada', () => {
    expect(rankName(undefined, tFor('pt-BR'))).toBeNull()
  })
})
