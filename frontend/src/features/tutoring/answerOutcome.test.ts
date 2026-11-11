import { describe, expect, it } from 'vitest'
import { translate } from '../../shared/i18n/catalog'
import { en } from '../../shared/i18n/messages/en'
import { announceAnswer, unansweredNote } from './answerOutcome'
import type { MessageRead } from './types'

/** O texto PT da chave: o teste afirma o literal da interface, e nao a chave. */
const pt = (key: Parameters<typeof translate>[1]) => translate('pt-BR', key)

const tutor = (status: MessageRead['status'], errorCode: string | null): MessageRead => ({
  id: 2,
  role: 'tutor',
  content: 'texto',
  status,
  client_message_id: null,
  reply_to_id: 1,
  error_code: errorCode,
  fallback_model: null,
  created_at: '2026-09-22T12:00:01Z',
  actions: [],
})

describe('announceAnswer', () => {
  it('a resposta completa: a Kairya terminou', () => {
    expect(pt(announceAnswer(tutor('completa', null)))).toBe('Kairya terminou de responder.')
  })

  it('a cortada por tamanho diz o motivo e o que fazer (pendencias 121 e 122)', () => {
    expect(pt(announceAnswer(tutor('interrompida', 'resposta_longa')))).toBe(
      'A resposta da Kairya ficou longa demais e foi cortada. Tente pedir por partes.',
    )
  })

  it('outra resposta incompleta nao se diz terminada, nem inventa motivo', () => {
    expect(pt(announceAnswer(tutor('interrompida', null)))).toBe(
      'A resposta da Kairya chegou incompleta.',
    )
  })
})

describe('unansweredNote', () => {
  it('a cortada por tamanho sugere pedir por partes (pendencia 122)', () => {
    expect(pt(unansweredNote(tutor('interrompida', 'resposta_longa')))).toBe(
      'A última resposta ficou longa demais e foi cortada. Tente pedir por partes, um tópico de cada vez. Tentar de novo refaz a mesma pergunta e pode cortar outra vez.',
    )
  })

  it('a recusada sugere perguntar de outro jeito (pendencia 120)', () => {
    expect(pt(unansweredNote(tutor('falhou', 'resposta_recusada')))).toBe(
      'A Kairya não pôde responder à última pergunta. Tentar de novo tende a dar o mesmo resultado: pergunte de outro jeito.',
    )
  })

  it.each([
    ['sem resposta', undefined],
    ['interrompida sem motivo', tutor('interrompida', null)],
    ['falha do provedor', tutor('falhou', 'provedor_indisponivel')],
  ])('%s: a nota geral, de reenvio seguro', (_caso, answer) => {
    expect(pt(unansweredNote(answer))).toBe(
      'A última pergunta ficou sem resposta completa. Tentar de novo é seguro: a pergunta não será duplicada.',
    )
  })
})

describe('os textos em ingles', () => {
  it('cada desfecho tem o texto do catalogo en', () => {
    expect(translate('en', announceAnswer(tutor('completa', null)))).toBe(
      en['tutoring.answer.announce.complete'],
    )
    expect(translate('en', announceAnswer(tutor('interrompida', 'resposta_longa')))).toBe(
      en['tutoring.answer.announce.cut'],
    )
    expect(translate('en', unansweredNote(tutor('falhou', 'resposta_recusada')))).toBe(
      en['tutoring.answer.note.refused'],
    )
    expect(translate('en', announceAnswer(tutor('interrompida', null)))).toBe(
      en['tutoring.answer.announce.incomplete'],
    )
    expect(translate('en', unansweredNote(tutor('interrompida', 'resposta_longa')))).toBe(
      en['tutoring.answer.note.long'],
    )
    expect(translate('en', unansweredNote(undefined))).toBe(en['tutoring.answer.note.general'])
  })
})
