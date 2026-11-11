import { describe, expect, expectTypeOf, it } from 'vitest'
import { CATALOGS, translate, translateParts, type MessageKey, type Messages } from './catalog'
import { LOCALES } from './locale'
import { en } from './messages/en'
import { ptBR } from './messages/pt-BR'

describe('catalog', () => {
  it('en tem exatamente as chaves de ptBR', () => {
    expectTypeOf<keyof typeof en>().toEqualTypeOf<MessageKey>()
    expect(Object.keys(en).sort()).toEqual(Object.keys(ptBR).sort())
  })

  it('uma chave sem par é erro de tipo', () => {
    // @ts-expect-error falta 'shell.locale.en' e as demais
    const incompleto = { 'shell.locale.label': 'Language' } satisfies Messages
    expect(incompleto).toBeDefined()
  })

  it('os dois idiomas usam os mesmos placeholders em cada chave', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    // Pelas entradas, e nao por `Object.keys(ptBR) as MessageKey[]`: sem
    // conversao de tipo. A paridade das chaves e o teste acima.
    const enTexts = new Map<string, string>(Object.entries(en))
    for (const [key, text] of Object.entries(ptBR)) {
      expect({ key, vars: vars(enTexts.get(key) ?? '') }).toEqual({ key, vars: vars(text) })
    }
  })

  it('nenhum valor é vazio nem só espaço', () => {
    for (const locale of LOCALES) {
      for (const v of Object.values(CATALOGS[locale])) {
        expect(v.trim()).not.toBe('')
      }
    }
  })

  it('o nome de cada idioma começa pela sigla e é o endônimo, igual nos dois catálogos', () => {
    expect(ptBR['shell.locale.ptBR']).toBe('PT, Português (Brasil)')
    expect(ptBR['shell.locale.en']).toBe('EN, English')
    expect(en['shell.locale.ptBR']).toBe(ptBR['shell.locale.ptBR'])
    expect(en['shell.locale.en']).toBe(ptBR['shell.locale.en'])
  })

  it('devolve o texto do idioma pedido', () => {
    expect(translate('pt-BR', 'shell.locale.label')).toBe('Idioma')
    expect(translate('en', 'shell.locale.label')).toBe('Language')
  })

  it('interpola as variáveis', () => {
    expect(translate('pt-BR', 'shell.locale.saveFailed', { language: 'English' })).toBe(
      'Não foi possível salvar o idioma English. O servidor não confirmou a troca. Tente de novo.',
    )
  })

  it('interpola número com String(valor)', () => {
    expect(translate('en', 'shell.locale.saveFailed', { language: 7 })).toContain('7')
  })

  it('lança quando falta uma variável exigida', () => {
    expect(() => translate('en', 'shell.locale.saveFailed')).toThrow(
      /shell\.locale\.saveFailed.*language/,
    )
  })

  it('lança também com um objeto de variáveis sem a exigida', () => {
    expect(() => translate('pt-BR', 'shell.locale.saveFailed', { idioma: 'English' })).toThrow(
      /shell\.locale\.saveFailed.*language/,
    )
  })

  it('o endônimo de cada idioma tem chave própria, igual nos dois catálogos', () => {
    expect(ptBR['shell.locale.ptBR.endonym']).toBe('Português (Brasil)')
    expect(ptBR['shell.locale.en.endonym']).toBe('English')
    expect(en['shell.locale.ptBR.endonym']).toBe(ptBR['shell.locale.ptBR.endonym'])
    expect(en['shell.locale.en.endonym']).toBe(ptBR['shell.locale.en.endonym'])
  })

  // Padrao das mensagens de erro: o que falhou, causa, o que fazer, em 12 a 18
  // palavras. Medido com cada endonimo, o curto e o longo.
  it.each(
    LOCALES.flatMap((locale) =>
      ['English', 'Português (Brasil)'].map((language) => [locale, language]),
    ),
  )('saveFailed em %s com %s tem de 12 a 18 palavras', (locale, language) => {
    const words = translate(locale === 'en' ? 'en' : 'pt-BR', 'shell.locale.saveFailed', {
      language,
    })
      .split(/\s+/)
      .filter(Boolean)
    expect(words.length).toBeGreaterThanOrEqual(12)
    expect(words.length).toBeLessThanOrEqual(18)
  })

  describe('translateParts', () => {
    it('separa o texto e põe o valor de cada variável no lugar, sem converter', () => {
      const node = { marca: 'nó' }
      expect(translateParts('pt-BR', 'shell.locale.saveFailed', { language: node })).toEqual([
        'Não foi possível salvar o idioma ',
        node,
        '. O servidor não confirmou a troca. Tente de novo.',
      ])
    })

    it('chave sem variável vira uma parte só', () => {
      expect(translateParts('en', 'shell.locale.label', {})).toEqual(['Language'])
    })

    it('lança quando a variável exigida vem undefined', () => {
      expect(() =>
        translateParts('en', 'shell.locale.saveFailed', { language: undefined }),
      ).toThrow(/shell\.locale\.saveFailed.*language/)
    })

    it('lança quando falta uma variável exigida', () => {
      expect(() => translateParts('en', 'shell.locale.saveFailed', {})).toThrow(
        /shell\.locale\.saveFailed.*language/,
      )
    })
  })
})
