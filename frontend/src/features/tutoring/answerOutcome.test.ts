import { describe, expect, it } from 'vitest'
import { announceAnswer, unansweredNote } from './answerOutcome'
import type { MessageRead } from './types'

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
    expect(announceAnswer(tutor('completa', null))).toBe('Kairya terminou de responder.')
  })

  it('a cortada por tamanho diz o motivo e o que fazer (pendencias 121 e 122)', () => {
    expect(announceAnswer(tutor('interrompida', 'resposta_longa'))).toBe(
      'A resposta da Kairya ficou longa demais e foi cortada. Tente pedir por partes.',
    )
  })

  it('outra resposta incompleta nao se diz terminada, nem inventa motivo', () => {
    expect(announceAnswer(tutor('interrompida', null))).toBe(
      'A resposta da Kairya chegou incompleta.',
    )
  })
})

describe('unansweredNote', () => {
  it('a cortada por tamanho sugere pedir por partes (pendencia 122)', () => {
    expect(unansweredNote(tutor('interrompida', 'resposta_longa'))).toBe(
      'A última resposta ficou longa demais e foi cortada. Tente pedir por partes, um tópico de cada vez. Tentar de novo refaz a mesma pergunta e pode cortar outra vez.',
    )
  })

  it('a recusada sugere perguntar de outro jeito (pendencia 120)', () => {
    expect(unansweredNote(tutor('falhou', 'resposta_recusada'))).toBe(
      'A Kairya não pôde responder à última pergunta. Tentar de novo tende a dar o mesmo resultado: pergunte de outro jeito.',
    )
  })

  it.each([
    ['sem resposta', undefined],
    ['interrompida sem motivo', tutor('interrompida', null)],
    ['falha do provedor', tutor('falhou', 'provedor_indisponivel')],
  ])('%s: a nota geral, de reenvio seguro', (_caso, answer) => {
    expect(unansweredNote(answer)).toBe(
      'A última pergunta ficou sem resposta completa. Tentar de novo é seguro: a pergunta não será duplicada.',
    )
  })
})
