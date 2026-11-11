import { describe, expect, it } from 'vitest'
import { COUNTER_VISIBLE_FROM, describeQuestionLength, MAX_QUESTION_LENGTH } from './questionLimit'

describe('describeQuestionLength', () => {
  it('espelha o teto do backend', () => {
    // TAMANHO_MAXIMO_DA_PERGUNTA, em src/focusquest/modules/tutoring/schemas.py.
    expect(MAX_QUESTION_LENGTH).toBe(4000)
    expect(COUNTER_VISIBLE_FROM).toBe(3600)
  })

  it.each([
    ['vazio', ''],
    ['so espacos', '   \n\t '],
  ])('%s nao e enviavel e nao mostra contador', (_caso, text) => {
    expect(describeQuestionLength(text)).toMatchObject({
      length: 0,
      sendable: false,
      counter: null,
    })
  })

  it('abaixo do limiar do contador: enviavel, sem contador', () => {
    expect(describeQuestionLength('a'.repeat(COUNTER_VISIBLE_FROM - 1))).toEqual({
      length: 3599,
      remaining: 401,
      sendable: true,
      counter: null,
    })
  })

  it('no limiar, o contador aparece com os restantes', () => {
    expect(describeQuestionLength('a'.repeat(3600)).counter).toEqual({ kind: 'remaining', n: 400 })
  })

  it('no limite exato ainda e enviavel', () => {
    expect(describeQuestionLength('a'.repeat(4000))).toEqual({
      length: 4000,
      remaining: 0,
      sendable: true,
      counter: { kind: 'remaining', n: 0 },
    })
  })

  it('um caractere restante no singular', () => {
    expect(describeQuestionLength('a'.repeat(3999)).counter).toEqual({ kind: 'remaining', n: 1 })
  })

  it('acima do limite: nao enviavel, e o contador diz quanto passou', () => {
    expect(describeQuestionLength('a'.repeat(4012))).toEqual({
      length: 4012,
      remaining: -12,
      sendable: false,
      counter: { kind: 'over', n: 12 },
    })
  })

  it('um caractere acima do limite: o off point entre restantes e excesso', () => {
    expect(describeQuestionLength('a'.repeat(4001))).toEqual({
      length: 4001,
      remaining: -1,
      sendable: false,
      counter: { kind: 'over', n: 1 },
    })
  })

  it('conta pontos de codigo, como o len() do Python', () => {
    // Cada emoji e UM ponto de codigo e DUAS unidades UTF-16. Com
    // `text.length`, 4000 emojis dariam 8000 e a tela recusaria o que o
    // servidor aceita.
    expect(describeQuestionLength('😀'.repeat(4000))).toMatchObject({
      length: 4000,
      sendable: true,
    })
  })

  it('ignora os espacos das pontas, como o strip_whitespace do backend', () => {
    expect(describeQuestionLength(`  ${'a'.repeat(4000)}  \n`)).toMatchObject({
      length: 4000,
      sendable: true,
    })
  })
})
