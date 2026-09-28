import { describe, expect, it } from 'vitest'
import { describeEvidence, MAX_EVIDENCE_LENGTH, MAX_LINK_LENGTH } from './evidenceLimit'

const LINK_ERROR = 'O link precisa começar com http:// ou https:// e não ter espaços.'

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
    expect(result.counter).toBe('Restam 0 caracteres.')
  })

  it('recusa um ponto de codigo acima do limite e diz quanto passou', () => {
    const result = describeEvidence({ text: '🔥'.repeat(MAX_EVIDENCE_LENGTH + 1), link: '' })

    expect(result.sendable).toBe(false)
    expect(result.counter).toBe('Passou 1 caractere do limite de 4000.')
    expect(result.body).toBeNull()
  })

  it('pluraliza o quanto passou', () => {
    const result = describeEvidence({ text: 'a'.repeat(MAX_EVIDENCE_LENGTH + 2), link: '' })

    expect(result.counter).toBe('Passou 2 caracteres do limite de 4000.')
  })

  it('mede o texto sem os espacos das pontas', () => {
    const result = describeEvidence({ text: `  ${'a'.repeat(MAX_EVIDENCE_LENGTH)}  `, link: '' })

    expect(result.sendable).toBe(true)
  })

  it('nao mostra contador abaixo de 90% do limite, e mostra a partir dele', () => {
    expect(describeEvidence({ text: 'a'.repeat(3599), link: '' }).counter).toBeNull()
    expect(describeEvidence({ text: 'a'.repeat(3600), link: '' }).counter).toBe(
      'Restam 400 caracteres.',
    )
  })

  it('singulariza o que resta', () => {
    const result = describeEvidence({ text: 'a'.repeat(MAX_EVIDENCE_LENGTH - 1), link: '' })

    expect(result.counter).toBe('Resta 1 caractere.')
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
    expect(acima.linkError).toBe('O link passa de 2000 caracteres.')
  })

  it('link ruim barra o envio mesmo com texto bom', () => {
    expect(describeEvidence({ text: 'Feito', link: 'nada' }).sendable).toBe(false)
  })
})
