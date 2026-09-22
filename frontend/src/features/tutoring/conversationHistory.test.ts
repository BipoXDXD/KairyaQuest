import { describe, expect, it } from 'vitest'
import {
  appendTurn,
  pendingFromHistory,
  replaceAction,
  settleInterrupted,
} from './conversationHistory'
import type { ActionRead, MessageRead } from './types'

function message(overrides: Partial<MessageRead> & Pick<MessageRead, 'id' | 'role'>): MessageRead {
  return {
    content: `mensagem ${String(overrides.id)}`,
    status: 'completa',
    client_message_id: overrides.role === 'user' ? `cmid-${String(overrides.id)}` : null,
    reply_to_id: null,
    error_code: null,
    created_at: '2026-09-22T12:00:00Z',
    actions: [],
    ...overrides,
  }
}

const action = (id: number, state: ActionRead['state'] = 'proposta'): ActionRead => ({
  id,
  kind: 'create_mission',
  state,
  payload: {
    instructions: 'Ler o capítulo 3',
    completion_criterion: 'Resumo entregue',
    difficulty: 2,
    estimated_minutes: 30,
    deadline: '2027-01-10T13:00:00Z',
  },
  mission_id: null,
  error_code: null,
})

describe('appendTurn', () => {
  it('acrescenta a pergunta e a resposta novas, na ordem', () => {
    const q = message({ id: 1, role: 'user' })
    const a = message({ id: 2, role: 'tutor', reply_to_id: 1 })
    expect(appendTurn([], q, a)).toEqual([q, a])
  })

  it('nao duplica a pergunta que ja esta na lista (reenvio)', () => {
    const q = message({ id: 1, role: 'user' })
    const a = message({ id: 3, role: 'tutor', reply_to_id: 1 })
    expect(appendTurn([q], q, a)).toEqual([q, a])
  })

  it('troca a resposta que ja esta na lista, em vez de repetir (ja respondida)', () => {
    const q = message({ id: 1, role: 'user' })
    const antiga = message({ id: 2, role: 'tutor', reply_to_id: 1, content: 'velha' })
    const nova = { ...antiga, content: 'a mesma resposta, como o servidor a devolveu' }
    expect(appendTurn([q, antiga], q, nova)).toEqual([q, nova])
  })

  it('sem pergunta (fora do contrato), acrescenta so a resposta', () => {
    const a = message({ id: 2, role: 'tutor', reply_to_id: 1 })
    expect(appendTurn([], null, a)).toEqual([a])
  })

  it('nao muda a lista recebida', () => {
    const lista = [message({ id: 1, role: 'user' })]
    appendTurn(lista, null, message({ id: 2, role: 'tutor', reply_to_id: 1 }))
    expect(lista).toHaveLength(1)
  })
})

describe('settleInterrupted', () => {
  it('poe a pergunta e a resposta provisoria marcada, com o parcial', () => {
    const q = message({ id: 10, role: 'user' })
    const lista = settleInterrupted([], q, 'Meio', 'falhou', -1)
    expect(lista).toEqual([
      q,
      expect.objectContaining({
        id: -1,
        role: 'tutor',
        content: 'Meio',
        status: 'falhou',
        reply_to_id: 10,
      }),
    ])
  })

  it('nao duplica a pergunta que ja esta na lista (segunda falha da mesma pergunta)', () => {
    const q = message({ id: 10, role: 'user' })
    const primeira = settleInterrupted([], q, 'a', 'falhou', -1)
    expect(settleInterrupted(primeira, q, 'b', 'interrompida', -2).map((m) => m.id)).toEqual([
      10, -1, -2,
    ])
  })
})

describe('replaceAction', () => {
  it('troca so a acao de mesmo id, na mensagem que a carrega', () => {
    const outra = message({ id: 1, role: 'tutor', reply_to_id: 9, actions: [action(5)] })
    const alvo = message({ id: 2, role: 'tutor', reply_to_id: 9, actions: [action(6), action(7)] })
    const executada = action(7, 'executada')

    const [primeira, segunda] = replaceAction([outra, alvo], executada)

    expect(primeira).toBe(outra)
    expect(segunda?.actions).toEqual([action(6), executada])
  })
})

describe('pendingFromHistory', () => {
  it('sem pergunta nenhuma, nao ha o que reenviar', () => {
    expect(pendingFromHistory([])).toBeNull()
  })

  it.each(['completa', 'gerando'] as const)(
    'ultima pergunta com resposta %s: nada a reenviar',
    (status) => {
      const q = message({ id: 1, role: 'user' })
      expect(
        pendingFromHistory([q, message({ id: 2, role: 'tutor', reply_to_id: 1, status })]),
      ).toBeNull()
    },
  )

  it.each(['interrompida', 'falhou'] as const)(
    'ultima pergunta so com resposta %s: reenviar com o id dela',
    (status) => {
      const q = message({ id: 1, role: 'user', content: 'Me ajuda com recursão?' })
      expect(
        pendingFromHistory([q, message({ id: 2, role: 'tutor', reply_to_id: 1, status })]),
      ).toEqual({ clientMessageId: 'cmid-1', content: 'Me ajuda com recursão?' })
    },
  )

  it('ultima pergunta sem resposta nenhuma: reenviar', () => {
    const antiga = message({ id: 1, role: 'user' })
    const respondida = message({ id: 2, role: 'tutor', reply_to_id: 1 })
    const ultima = message({ id: 3, role: 'user' })
    expect(pendingFromHistory([antiga, respondida, ultima])).toEqual({
      clientMessageId: 'cmid-3',
      content: 'mensagem 3',
    })
  })

  it('so a ULTIMA pergunta conta: uma antiga sem resposta nao e oferecida', () => {
    const antiga = message({ id: 1, role: 'user' })
    const ultima = message({ id: 2, role: 'user' })
    const respondida = message({ id: 3, role: 'tutor', reply_to_id: 2 })
    expect(pendingFromHistory([antiga, ultima, respondida])).toBeNull()
  })

  it('pergunta sem client_message_id (fora do contrato) nao e oferecida', () => {
    expect(
      pendingFromHistory([message({ id: 1, role: 'user', client_message_id: null })]),
    ).toBeNull()
  })
})
