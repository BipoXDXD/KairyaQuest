import { describe, expect, it } from 'vitest'
import { describeEvidence, MAX_EVIDENCE_LENGTH, MAX_LINK_LENGTH } from './evidenceLimit'

const LINK_ERROR = 'format'

describe('describeEvidence -- o texto', () => {
  it.each([
    ['vazio', ''],
    ['so espacos', '   \n\t '],
  ])('texto %s nao e enviavel e nao tem corpo', (_nome, text) => {
    expect(describeEvidence({ text, link: '' })).toEqual({
      sendable: false,
      counter: null,
      linkError: null,
      body: null,
    })
  })

  it('aceita o limite exato, contando pontos de codigo e nao unidades UTF-16', () => {
    const result = describeEvidence({ text: '🔥'.repeat(MAX_EVIDENCE_LENGTH), link: '' })

    expect(result.sendable).toBe(true)
    expect(result.counter).toEqual({ kind: 'remaining', n: 0 })
  })

  it('recusa um ponto de codigo acima do limite e diz quanto passou', () => {
    const result = describeEvidence({ text: '🔥'.repeat(MAX_EVIDENCE_LENGTH + 1), link: '' })

    expect(result.sendable).toBe(false)
    expect(result.counter).toEqual({ kind: 'over', n: 1 })
    expect(result.body).toBeNull()
  })

  it('pluraliza o quanto passou', () => {
    const result = describeEvidence({ text: 'a'.repeat(MAX_EVIDENCE_LENGTH + 2), link: '' })

    expect(result.counter).toEqual({ kind: 'over', n: 2 })
  })

  it('mede o texto sem os espacos das pontas', () => {
    const result = describeEvidence({ text: `  ${'a'.repeat(MAX_EVIDENCE_LENGTH)}  `, link: '' })

    expect(result.sendable).toBe(true)
  })

  it.each([
    ['NEL (U+0085)', '\u0085'],
    ['NEL e espaco', ' \u0085\n'],
    ['espaco de largura ideografica (U+3000)', '\u3000'],
    ['NBSP (U+00A0)', '\u00a0'],
    ['separador de linha (U+2028)', '\u2028'],
  ])('texto so de %s e vazio, como no servidor', (_nome, text) => {
    const result = describeEvidence({ text, link: '' })

    expect(result.sendable).toBe(false)
    expect(result.body).toBeNull()
  })

  it.each([
    ['U+FEFF', '\ufeff'],
    ['U+001C', '\u001c'],
    ['U+001F', '\u001f'],
  ])('%s NAO e espaco: o servidor nao o remove, e a tela tambem nao', (_nome, ch) => {
    const result = describeEvidence({ text: `${ch}feito${ch}`, link: '' })

    expect(result.sendable).toBe(true)
    expect(result.body).toEqual({ text: `${ch}feito${ch}` })
    expect(describeEvidence({ text: ch, link: '' }).sendable).toBe(true)
  })

  it('o teto de 4000 e contado DEPOIS do recorte (com NEL e U+3000 nas pontas)', () => {
    const corpo = 'a'.repeat(MAX_EVIDENCE_LENGTH)

    const noLimite = describeEvidence({ text: `\u0085\u3000${corpo}\u3000\u0085`, link: '' })
    expect(noLimite.sendable).toBe(true)
    expect(noLimite.body).toEqual({ text: corpo })

    const acima = describeEvidence({ text: `\u0085${corpo}a\u0085`, link: '' })
    expect(acima.sendable).toBe(false)
    expect(acima.counter).toEqual({ kind: 'over', n: 1 })
  })

  it('conta pontos de codigo, e nao grafemas: marca combinante e ZWJ', () => {
    expect(describeEvidence({ text: 'e\u0301'.repeat(2000), link: '' }).sendable).toBe(true)
    expect(describeEvidence({ text: 'e\u0301'.repeat(2001), link: '' }).sendable).toBe(false)
    // familia: 5 pontos de codigo (3 pessoas e 2 ZWJ), 1 grafema.
    const familia = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'
    expect(describeEvidence({ text: familia.repeat(800), link: '' }).sendable).toBe(true)
    expect(describeEvidence({ text: familia.repeat(801), link: '' }).sendable).toBe(false)
  })

  it('nao mostra contador abaixo de 90% do limite, e mostra a partir dele', () => {
    expect(describeEvidence({ text: 'a'.repeat(3599), link: '' }).counter).toBeNull()
    expect(describeEvidence({ text: 'a'.repeat(3600), link: '' }).counter).toEqual({
      kind: 'remaining',
      n: 400,
    })
  })

  it('singulariza o que resta', () => {
    const result = describeEvidence({ text: 'a'.repeat(MAX_EVIDENCE_LENGTH - 1), link: '' })

    expect(result.counter).toEqual({ kind: 'remaining', n: 1 })
  })

  it('o corpo leva o texto sem as pontas', () => {
    expect(describeEvidence({ text: '  Feito  ', link: '' }).body).toEqual({ text: 'Feito' })
  })
})

describe('describeEvidence -- o link', () => {
  it('link vazio ou de espacos: o corpo nao tem a chave link', () => {
    const vazio = describeEvidence({ text: 'Feito', link: '' })
    const espacos = describeEvidence({ text: 'Feito', link: '   ' })

    expect(vazio.body).toEqual({ text: 'Feito' })
    expect(espacos.body).toEqual({ text: 'Feito' })
    expect(Object.hasOwn(espacos.body ?? {}, 'link')).toBe(false)
    expect(espacos.linkError).toBeNull()
  })

  it('aceita HTTPS em maiusculas e manda o link sem espacos nas pontas', () => {
    const result = describeEvidence({ text: 'Feito', link: '  HTTPS://x.com  ' })

    expect(result.sendable).toBe(true)
    expect(result.linkError).toBeNull()
    expect(result.body).toEqual({ text: 'Feito', link: 'HTTPS://x.com' })
  })

  it.each(['javascript:alert(1)', 'https://a b', 'ftp://x.com', 'http://', 'x.com'])(
    'recusa %s com a mensagem do link',
    (link) => {
      const result = describeEvidence({ text: 'Feito', link })

      expect(result.linkError).toBe(LINK_ERROR)
      expect(result.sendable).toBe(false)
      expect(result.body).toBeNull()
    },
  )

  it('aceita o link no limite e recusa um caractere acima', () => {
    const prefixo = 'https://x.com/'
    const noLimite = prefixo + 'a'.repeat(MAX_LINK_LENGTH - prefixo.length)

    expect(describeEvidence({ text: 'Feito', link: noLimite }).sendable).toBe(true)

    const acima = describeEvidence({ text: 'Feito', link: `${noLimite}a` })
    expect(acima.sendable).toBe(false)
    expect(acima.linkError).toBe('tooLong')
  })

  it.each([
    ['NEL (U+0085)', 'https://a\u0085b'],
    ['NBSP', 'https://a\u00a0b'],
    ['U+3000', 'https://a\u3000b'],
    ['U+2028', 'https://a\u2028b'],
  ])('recusa espaco de Unicode no meio do link: %s', (_nome, link) => {
    expect(describeEvidence({ text: 'Feito', link }).linkError).toBe(LINK_ERROR)
  })

  it.each([
    ['U+FEFF', 'https://a\ufeffb'],
    ['U+001C', 'https://a\u001cb'],
  ])('aceita %s no meio do link: para o servidor nao e espaco', (_nome, link) => {
    const result = describeEvidence({ text: 'Feito', link })

    expect(result.linkError).toBeNull()
    expect(result.body).toEqual({ text: 'Feito', link })
  })

  it('o NEL nas pontas do link e recortado, como no servidor', () => {
    const result = describeEvidence({ text: 'Feito', link: '\u0085https://x.com\u0085' })

    expect(result.body).toEqual({ text: 'Feito', link: 'https://x.com' })
  })

  it('link ruim barra o envio mesmo com texto bom', () => {
    expect(describeEvidence({ text: 'Feito', link: 'nada' }).sendable).toBe(false)
  })
})
